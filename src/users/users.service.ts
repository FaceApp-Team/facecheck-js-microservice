import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UsersDto } from '../dto/users.dto';
import { ImageStatus, Priority, Role } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import * as bcrypt from 'bcrypt';
import { ImageProducer } from '../producers/image.producer';
import { AuthDto } from '../dto/auth.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  logger = new Logger(UsersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
    private readonly imageProducer: ImageProducer,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Enroll face images for a user - separate from registration
   * Can be called anytime to update face data
   * Students can also provide their studentId and level (year group)
   * This is for the students
   */
  async enrollFace(
    email: string,
    files: Express.Multer.File[],
    studentId?: string,
    level?: number,
  ) {
    await this.helpers.getUser(email);

    const user = await this.prisma.user.findUnique({
      where: { email: email },
      include: { student: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hasFaceImages = Boolean(files && files.length > 0);
    const hasStudentIdUpdate = Boolean(
      studentId && studentId.trim().length > 0,
    );
    const hasLevelUpdate = level !== undefined && level !== null;

    if (!hasFaceImages && !hasStudentIdUpdate && !hasLevelUpdate) {
      throw new BadRequestException(
        'Provide face images for enrollment or student details to update',
      );
    }

    let imageUrls: string[] = [];

    if (hasFaceImages) {
      // Validate files BEFORE uploading
      for (const file of files) {
        this.helpers.checkFileSize(file);
        if (!file.buffer || file.buffer === null) {
          throw new BadRequestException('Invalid image file');
        }
      }

      imageUrls = await this.helpers.uploadImages(files);

      if (!imageUrls || imageUrls.length === 0) {
        throw new BadRequestException('Image upload failed');
      }

      try {
        await this.helpers.enrollFace(user.id, imageUrls);
      } catch (error) {
        this.logger.error('Face enrollment failed', error);
        throw new BadRequestException(
          'Face enrollment failed. Please ensure the images are clear and try again.',
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          imageStatus: ImageStatus.UPLOADED,
          imageUrl: imageUrls[0],
          embeddingStatus: ImageStatus.COMPLETED,
        },
      });
    }

    // Create or update student record with studentId and level
    if (hasStudentIdUpdate) {
      if (user.student) {
        // Student already exists — update
        const normalizedStudentId = studentId!.trim();
        const studentUpdateData: any = {
          studentId: normalizedStudentId,
          matricNo: normalizedStudentId,
        };
        if (hasLevelUpdate) {
          studentUpdateData.level = level;
        }
        await this.prisma.student.update({
          where: { id: user.student.id },
          data: studentUpdateData,
        });
      } else {
        // Student doesn't exist yet — create
        const normalizedStudentId = studentId!.trim();
        await this.prisma.student.create({
          data: {
            user: { connect: { id: user.id } },
            studentId: normalizedStudentId,
            matricNo: normalizedStudentId,
            level: hasLevelUpdate ? level : 100,
          },
        });
      }
    } else if (user.student && hasLevelUpdate) {
      // Only level provided for an existing student
      await this.prisma.student.update({
        where: { id: user.student.id },
        data: { level },
      });
    }

    await this.helpers.createSystemLog(
      `${
        hasFaceImages ? 'Face enrolled' : 'Enrollment details updated'
      } for user ${user.email} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return {
      message:
        hasFaceImages && (hasStudentIdUpdate || hasLevelUpdate)
          ? 'Face enrollment and details update successful'
          : hasFaceImages
            ? 'Face enrollment successful'
            : 'Details update successful',
      ...(hasFaceImages && { imageUrl: imageUrls[0] }),
    };
  }

  /**
   * Enroll a lecturer or staff member - admin only
   */
  async enrollUser(
    payload: Partial<UsersDto>,
    files: Express.Multer.File[],
    adminEmail: string,
  ) {
    // Verify the requesting user is an admin
    const admin = await this.helpers.getUser(adminEmail);
    if (admin.role !== Role.ADMIN && admin.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException(
        'Only admins can enroll lecturers and staff',
      );
    }

    // Check if a user with the target email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (payload.role === Role.LECTURER) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: { staffNo: payload.lecturerId },
        include: { user: true },
      });

      if (lecturer) {
        throw new ConflictException('Lecturer with this ID already exists');
      }

      //lecturer registration - NO course requirement (part-time lecturers)
      if (!payload.email || !payload.fullName || !payload.phone) {
        throw new BadRequestException(
          'Email, full name, phone are required for lecturer registration',
        );
      }

      if (!payload.lecturerHourlyRate) {
        throw new BadRequestException(
          'Lecturer hourly rate is required for lecturer registration',
        );
      }

      if (existingUser) {
        throw new ConflictException('A user with this email already exists');
      }

      const randomPassword = this.helpers.generateRandomCode(8);

      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // Face images are optional - can be enrolled later
      let imageUrls: string[] = [];
      if (files && files.length > 0) {
        imageUrls = await this.helpers.uploadImages(files);

        if (!imageUrls || imageUrls.length === 0) {
          throw new BadRequestException('Image upload failed');
        }
      }

      const transaction = await this.prisma.$transaction(async (tx) => {
        //create a new lecturer user
        const newUser = await tx.user.create({
          data: {
            email: payload.email ?? '',
            name: payload.fullName ?? 'CoMAS Lecturer',
            role: Role.LECTURER,
            phone: payload.phone ?? '',
            password: hashedPassword,
            isActive: true,
            isPasswordChanged: false,
          },
        });

        //create lecturer profile - NO course assignments (part-time)
        const newLecturer = await tx.lecturer.create({
          data: {
            user: {
              connect: { id: newUser.id },
            },
            staffNo: payload.lecturerId,
            hourlyRate: payload.lecturerHourlyRate
              ? parseFloat(payload.lecturerHourlyRate.toString())
              : 0.0,
          },
        });

        //update the user with imageurl if provided
        if (imageUrls && imageUrls.length > 0) {
          await tx.lecturer.update({
            where: { id: newLecturer.id },
            data: {
              user: {
                update: {
                  imageStatus: ImageStatus.UPLOADED,
                  imageUrl: imageUrls[0],
                },
              },
            },
          });
        }

        return { lecturer: newLecturer, userId: newUser.id, user: newUser };
      });

      // Enroll face if images provided
      if (imageUrls && imageUrls.length > 0) {
        try {
          await this.helpers.enrollFace(transaction.userId, imageUrls);
        } catch (error) {
          this.logger.error(
            'Face enrollment failed for lecturer, rolling back user creation',
            error,
          );
          await this.prisma.user.delete({ where: { id: transaction.userId } });
          throw new BadRequestException(
            'Face enrollment failed. Please ensure the images are clear and try again.',
          );
        }
      }

      await this.helpers.sendSMS(
        [payload.phone],
        `Hello ${payload.fullName}, your lecturer account has been created. Your temporary password is: ${randomPassword}. Please change it after your first login.`,
      );

      return {
        message: 'Lecturer enrolled successfully',
        lecturer: transaction.lecturer,
        tempPassword: randomPassword,
      };
    } else if (payload.role === Role.STAFF) {
      //staff registration
      if (
        !payload.email ||
        !payload.fullName ||
        !payload.phone ||
        !payload.staffId
      ) {
        throw new BadRequestException(
          'Email, full name and phone are required for staff registration',
        );
      }

      const staff = await this.prisma.staff.findUnique({
        where: { staffNo: payload.staffId },
      });

      if (staff) {
        throw new ConflictException('Staff with this ID already exists');
      }

      if (existingUser) {
        throw new ConflictException('A user with this email already exists');
      }

      const randomPassword = Math.random().toString(36).slice(-8);

      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // Face images are optional - can be enrolled later
      let imageUrls: string[] = [];
      if (files && files.length > 0) {
        imageUrls = await this.helpers.uploadImages(files);

        if (!imageUrls || imageUrls.length === 0) {
          throw new BadRequestException('Image upload failed');
        }
      }

      const transaction = await this.prisma.$transaction(async (tx) => {
        //create a new staff user
        const newUser = await tx.user.create({
          data: {
            email: payload.email ?? '',
            name: payload.fullName ?? 'CoMAS Staff',
            role: Role.STAFF,
            phone: payload.phone ?? '',
            password: hashedPassword,
            isActive: true,
          },
        });

        //create staff profile
        const newStaff = await tx.staff.create({
          data: {
            user: {
              connect: { id: newUser.id },
            },
            staffNo: payload.staffId ?? '',
          },
        });

        //update the user with imageurl if provided
        if (imageUrls && imageUrls.length > 0) {
          await tx.staff.update({
            where: { id: newStaff.id },
            data: {
              user: {
                update: {
                  imageStatus: ImageStatus.UPLOADED,
                  imageUrl: imageUrls[0],
                },
              },
            },
          });
        }

        return { staff: newStaff, userId: newUser.id, user: newUser };
      });

      // Enroll face if images provided
      if (imageUrls && imageUrls.length > 0) {
        try {
          await this.helpers.enrollFace(transaction.userId, imageUrls);
        } catch (error) {
          this.logger.error(
            'Face enrollment failed for staff, rolling back user creation',
            error,
          );
          await this.prisma.user.delete({ where: { id: transaction.userId } });
          throw new BadRequestException(
            'Face enrollment failed. Please ensure the images are clear and try again.',
          );
        }
      }

      await this.helpers.sendSMS(
        [payload.phone],
        `Hello ${payload.fullName}, your staff account has been created. Your temporary password is: ${randomPassword}. Please change it after your first login.`,
      );

      return {
        message: 'Staff enrolled successfully',
        staff: transaction.staff,
        tempPassword: randomPassword,
      };
    } else {
      throw new BadRequestException('Invalid role for enrollment');
    }
  }

  async getJobStatus(jobId: string) {
    const status: any = await this.imageProducer.getJobStatus(jobId);

    return { state: status.state, status: status.values };
  }

  async updateUserDetails(
    email: string,
    image?: Express.Multer.File,
    authDto?: Partial<AuthDto>,
  ) {
    // Always fetch the user by the provided email (target user's email)
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = {};

    if (authDto?.name) {
      updateData.name = authDto.name;
    }

    if (authDto?.phone) {
      updateData.phone = authDto.phone;
    }

    if (authDto?.email) {
      updateData.email = authDto.email;
    }

    if (authDto?.status) {
      updateData.accountStatus = authDto.status;
      if (authDto.status === 'INACTIVE') {
        updateData.isActive = false;
      }
    }

    // ❗ Strongly recommended: DO NOT allow email change here
    // if (authDto?.email && authDto.email !== user.email) {
    //   throw new BadRequestException(
    //     'Email change is not allowed via this endpoint',
    //   );
    // }

    if (image) {
      if (image.buffer && image.buffer !== null) {
        const url = await this.helpers.uploadImage(image);
        if (!url) {
          throw new BadRequestException('Image upload failed');
        }
        updateData.profilePicture = url.imageUrl;
      }
    }

    if (user.role === Role.ADMIN || user.role === Role.SYSTEM_ADMIN) {
      if (authDto?.role && authDto.role !== user.role) {
        updateData.role = authDto.role;
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    await this.helpers.createSystemLog(
      `User details updated for ${user.email} on ${new Date().toISOString()}`,
      Priority.LOW,
    );

    await this.helpers.createUserLog(
      user.email,
      `Your user details were updated on ${new Date().toISOString()}`,
      Priority.LOW,
    );

    return {
      message: 'User details updated successfully',
    };
  }

  async updateRecords(email: string, payload: Partial<UsersDto>) {
    // Always get the target user by email (not the authenticated user's own record)
    const targetUser = await this.prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    // Determine role for update logic
    if (targetUser.role === Role.STUDENT || targetUser.role === Role.REP) {
      const student = await this.prisma.student.findUnique({
        where: { userId: targetUser.id },
      });
      if (!student) {
        throw new NotFoundException('Student record not found');
      }
      const updateData: any = {};
      if (payload.studentId) {
        updateData.matricNo = payload.studentId;
        updateData.studentId = payload.studentId;
      }
      if (payload.level) {
        updateData.level = parseInt(payload.level.toString());
      }
      const transaction = await this.prisma.$transaction(async (tx) => {
        // Handle course enrollments
        if (payload.courses && payload.courses.length > 0) {
          for (const courseCode of payload.courses) {
            const course = await tx.course.findUnique({
              where: { code: courseCode },
            });
            if (!course) {
              throw new NotFoundException('Course not found: ' + courseCode);
            }
            const existingEnrollment = await tx.courseEnrollment.findUnique({
              where: {
                studentId_courseId: {
                  studentId: student.id,
                  courseId: course.id,
                },
              },
            });
            if (!existingEnrollment) {
              await tx.courseEnrollment.create({
                data: {
                  course: { connect: { id: course.id } },
                  student: { connect: { id: student.id } },
                },
              });
            }
          }
        }
        const updatedStudent = await tx.student.update({
          where: { id: student.id },
          data: updateData,
        });
        return { updatedStudent };
      });
      return {
        message: 'Student record updated successfully',
        student: transaction.updatedStudent,
      };
    } else if (targetUser.role === Role.LECTURER) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: { userId: targetUser.id },
      });
      if (!lecturer) {
        throw new NotFoundException('Lecturer record not found');
      }
      const updateData: any = {};
      if (payload.lecturerId) {
        updateData.staffNo = payload.lecturerId;
      }
      if (payload.lecturerHourlyRate) {
        updateData.hourlyRate = parseFloat(
          payload.lecturerHourlyRate.toString(),
        );
      }
      if (payload.lecturerCreditHours) {
        updateData.creditHours = payload.lecturerCreditHours;
      }
      // Note: Lecturers are part-time and not tied to courses
      // Course assignments are not managed here
      const updatedLecturer = await this.prisma.lecturer.update({
        where: { id: lecturer.id },
        data: {
          ...updateData,
          ...(payload.fullName && {
            user: {
              update: {
                name: payload.fullName,
              },
            },
          }),
        },
      });
      return {
        message: 'Lecturer record updated successfully',
        lecturer: updatedLecturer,
      };
    } else if (targetUser.role === Role.STAFF) {
      const staff = await this.prisma.staff.findUnique({
        where: { userId: targetUser.id },
      });
      if (!staff) {
        throw new NotFoundException('Staff record not found');
      }
      const updateData: any = {};
      if (payload.staffId) {
        updateData.staffNo = payload.staffId;
      }
      const updatedStaff = await this.prisma.staff.update({
        where: { id: staff.id },
        data: updateData,
      });
      return {
        message: 'Staff record updated successfully',
        staff: updatedStaff,
      };
    } else {
      throw new ForbiddenException('Role not allowed to update records');
    }
  }

  async removeUser(email: string) {
    const user = await this.helpers.getUser(email);

    if (
      user.role === Role.LECTURER ||
      user.role === Role.STAFF ||
      user.role === Role.STUDENT ||
      user.role === Role.REP
    ) {
      //remove face embeddings on user removal
      await this.helpers.deleteFaceEmbeddings(user.id!);
    }

    //delete the user from the database
    await this.prisma.user.delete({
      where: { email: email },
    });

    await this.helpers.createSystemLog(
      `User ${email} removed on ${new Date().toISOString()}`,
      Priority.HIGH,
    );

    return {
      message: 'User removed successfully',
    };
  }

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        student: true,
        lecturer: true,
        staff: true,
        attendances: true,
        createdModules: true,
        subtopicsAsLecturer: true,
        createdTimetables: true,
        timetableSlotsAsLecturer: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      users,
    };
  }

  /**
   * Assign a student as a representative (StudentRep)
   * Reps are NOT tied to specific courses - they serve for all courses throughout their studies
   */
  async assignRep(studentId: string, email: string) {
    if (!studentId) {
      throw new BadRequestException('Student ID is required');
    }

    const user = await this.helpers.getUser(email);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SYSTEM_ADMIN &&
      user.role !== Role.STAFF &&
      user.role !== Role.LECTURER
    ) {
      throw new ForbiddenException('Not authorized to assign reps');
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true,
        studentRep: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.studentRep) {
      return {
        success: true,
        message: 'Student is already a representative',
        data: student.studentRep,
      };
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const rep = await tx.studentRep.create({
        data: {
          studentId: student.id,
        },
      });

      //update user role to REP
      await tx.user.update({
        where: { id: student.userId },
        data: {
          role: Role.REP,
        },
      });

      return { rep };
    });

    await this.helpers.sendSMS(
      [student.user.phone],
      `Hello ${student.user.name}, you have been appointed as a Student Representative. Congratulations!`,
    );

    await this.helpers.createSystemLog(
      `Student ${student.user.name} assigned as representative by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return {
      success: true,
      message: 'Student representative assigned successfully',
      data: transaction.rep,
    };
  }

  /**
   * Remove a student representative
   */
  async removeRep(studentId: string, email: string) {
    if (!studentId) {
      throw new BadRequestException('Student ID is required');
    }
    const user = await this.helpers.getUser(email);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SYSTEM_ADMIN &&
      user.role !== Role.STAFF
    ) {
      throw new ForbiddenException('Not authorized to remove reps');
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: { phone: true, email: true, name: true },
        },
        studentRep: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (!student.studentRep) {
      throw new NotFoundException('Student is not a representative');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.studentRep.delete({
        where: { studentId: student.id },
      });

      await tx.user.update({
        where: { id: student.userId },
        data: {
          role: Role.STUDENT,
        },
      });
    });

    await this.helpers.sendSMS(
      [student.user.phone],
      `Your student representative role has been removed.`,
    );

    await this.helpers.createSystemLog(
      `Student representative removed for student ${student.user.name} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createUserLog(
      student.user.email,
      `Your Student Representative role has been removed on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return {
      success: true,
      message: 'Student representative removed successfully',
    };
  }

  async createAdmin(
    email: string,
    name: string,
    phone: string,
    adminEmail: string,
  ) {
    const requestingUser = await this.helpers.getUser(adminEmail);
    if (requestingUser.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only system admins can create admins');
    }

    if (!email || !name || !phone) {
      throw new BadRequestException(
        'Email, name, and phone are required to create an admin',
      );
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Generate random password
    const randomPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Generate admin number if not provided
    const generatedAdminNo = `ADM-${Date.now()}`;

    // Transaction: create user + admin profile
    const transaction = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          phone,
          password: hashedPassword,
          role: Role.ADMIN,
          isActive: true,
        },
      });

      const admin = await tx.admin.create({
        data: {
          user: {
            connect: { id: user.id },
          },
          adminNo: generatedAdminNo,
        },
      });

      return { user, admin };
    });

    await this.helpers.sendSMS(
      [phone],
      `Hello ${name}, your admin account has been created. Your temporary password is: ${randomPassword}. Please change it after your first login.`,
    );

    await this.helpers.createSystemLog(
      `New admin created: ${email} by SYSTEM on ${new Date().toISOString()}`,
      Priority.CRITICAL,
    );
    return {
      message: 'Admin created successfully',
      data: {
        user: {
          id: transaction.user.id,
          email: transaction.user.email,
          name: transaction.user.name,
          phone: transaction.user.phone,
          role: transaction.user.role,
        },
        admin: {
          id: transaction.admin.id,
          adminNo: transaction.admin.adminNo,
        },
        tempPassword: randomPassword,
      },
    };
  }

  async createSuperAdmin(
    email: string,
    name: string,
    phone: string,
    secretCode: string,
  ) {
    if (!email || !name || !phone) {
      throw new BadRequestException(
        'Email, name, and phone are required to create an admin',
      );
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (secretCode !== this.configService.get<string>('app.secretCode')) {
      throw new ForbiddenException('Invalid secret code for admin creation');
    }

    // Generate random password
    const randomPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Generate admin number if not provided
    const generatedAdminNo = `SUPADM-${Date.now()}`;

    // Transaction: create user + admin profile
    const transaction = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          phone,
          password: hashedPassword,
          role: Role.SYSTEM_ADMIN,
          isActive: true,
        },
      });

      const admin = await tx.admin.create({
        data: {
          user: {
            connect: { id: user.id },
          },
          adminNo: generatedAdminNo,
        },
      });

      return { user, admin };
    });

    try {
      await this.helpers.sendSMS(
        [phone],
        `Hello ${name}, your super admin account has been created. Your temporary password is: ${randomPassword}. Please change it after your first login.`,
      );
    } catch (error: any) {
      this.logger.error(error);
      //delete superadmin if sms sending fais, and retry
      await this.prisma.user.delete({ where: { id: transaction.user.id } });
      throw new BadRequestException(
        'Failed to send SMS. Super admin creation rolled back. Please try again.',
      );
    }

    await this.helpers.createSystemLog(
      `New super admin created: ${email} by SYSTEM on ${new Date().toISOString()}`,
      Priority.CRITICAL,
    );
    return {
      message: 'Admin created successfully',
      data: {
        user: {
          id: transaction.user.id,
          email: transaction.user.email,
          name: transaction.user.name,
          phone: transaction.user.phone,
          role: transaction.user.role,
        },
        admin: {
          id: transaction.admin.id,
          adminNo: transaction.admin.adminNo,
        },
        tempPassword: randomPassword,
      },
    };
  }

  async fetchStudents(email: string) {
    const user = await this.helpers.getUser(email);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SYSTEM_ADMIN &&
      user.role !== Role.STAFF &&
      user.role !== Role.LECTURER &&
      user.role !== Role.REP &&
      user.role !== Role.STUDENT
    ) {
      throw new ForbiddenException('Not authorized to view students');
    }

    const students = await this.prisma.student.findMany({
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const lecturers = await this.prisma.lecturer.findMany({
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { students, lecturers };
  }

  async updateThresholds(
    email: string,
    thresholds: { lateThreshold: number; absentThreshold: number },
  ) {
    const user = await this.helpers.getUser(email);

    if (user.role !== Role.LECTURER && user.role !== Role.REP) {
      throw new ForbiddenException(
        'Only lecturers and reps can update their thresholds',
      );
    }

    if (user.role === Role.LECTURER) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: { userId: user.id },
        include: { thresholds: true },
      });

      if (!lecturer) {
        throw new NotFoundException('Lecturer profile not found');
      }

      const updatedThresholds = await this.prisma.thresholds.upsert({
        where: { lecturerId: lecturer.id },
        update: {
          lateThreshold: thresholds.lateThreshold,
          absentThreshold: thresholds.absentThreshold,
        },
        create: {
          lecturerId: lecturer.id,
          absentThreshold: thresholds.absentThreshold,
          lateThreshold: thresholds.lateThreshold,
        },
      });

      await this.helpers.createUserLog(
        user.email!,
        `Your thresholds were updated on ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      return {
        message: 'Thresholds updated successfully',
        thresholds: updatedThresholds,
      };
    } else if (user.role === Role.REP) {
      const student = await this.prisma.student.findFirst({
        where: { userId: user.id },
        include: {
          studentRep: {
            include: {
              thresholds: {
                select: { lateThreshold: true, absentThreshold: true },
              },
            },
          },
        },
      });

      if (!student || !student.studentRep) {
        throw new NotFoundException('Student rep record not found');
      }

      const updatedThresholds = await this.prisma.thresholds.upsert({
        where: {
          studentRepId: student.studentRep.id,
        },
        update: {
          lateThreshold: thresholds.lateThreshold,
          absentThreshold: thresholds.absentThreshold,
        },
        create: {
          studentRepId: student.studentRep.id,
          absentThreshold: thresholds.absentThreshold,
          lateThreshold: thresholds.lateThreshold,
        },
      });

      await this.helpers.createUserLog(
        user.email!,
        `Your thresholds were updated on ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      return {
        message: 'Thresholds updated successfully',
        thresholds: updatedThresholds,
      };
    }
  }

  async getUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        student: true,
        lecturer: true,
        staff: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      user,
    };
  }

  async getUserById(id: string) {
    const person = await this.prisma.user.findUnique({
      where: { id },
      include: {
        student: true,
        lecturer: true,
        staff: true,
        sessions: true,
        attendances: true,
      },
    });

    if (!person) {
      throw new NotFoundException('User not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = person;

    return {
      user: userWithoutPassword,
    };
  }

  async getAllReps(email: string) {
    const user = await this.helpers.getUser(email);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SYSTEM_ADMIN &&
      user.role !== Role.STAFF &&
      user.role !== Role.LECTURER
    ) {
      throw new ForbiddenException('Not authorized to view all reps');
    }

    const reps = await this.prisma.studentRep.findMany({
      include: {
        student: {
          include: {
            user: {
              select: { id: true, email: true, name: true, phone: true },
            },
            enrollments: {
              include: {
                course: {
                  include: {
                    module: true,
                    lecturers: {
                      include: {
                        lecturer: {
                          include: {
                            user: {
                              select: { id: true, email: true, name: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        thresholds: true,
      },
      orderBy: { assignedAt: 'desc' },
    });

    return {
      success: true,
      data: reps,
    };
  }
}
