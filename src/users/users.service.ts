import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UsersDto } from '../dto/users.dto';
import { ImageStatus, Role } from '../../generated/prisma/enums';
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

  /*conditionally adding the user based on their roles*/
  async enrollUser(payload: Partial<UsersDto>, file: Express.Multer.File) {
    //studnent registration
    if (payload.role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { studentId: payload.studentId },
      });

      if (student) {
        return { message: 'Student with this ID already exists', student };
      }

      if (!payload.email) {
        throw new BadRequestException(
          'Email is required for student registration',
        );
      }
      const user = await this.helpers.getUser(payload.email);
      if (user.email !== payload.email) {
        throw new BadRequestException('Email does not match user record');
      }

      if (user.imageStatus === ImageStatus.UPLOADED) {
        return {
          message: 'User already has an image uploaded',
          image: user.imageUrl,
        };
      }

      this.helpers.checkFileSize(file);

      this.helpers.checkMediaType(file, [
        'image/jpeg',
        'image/png',
        'image/jpg',
        'image/webp',
      ]);

      const { imageUrl } = await this.helpers.uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      if (!imageUrl) {
        throw new BadRequestException('Image upload failed');
      }

      const transaction = await this.prisma.$transaction(async (tx) => {
        //create a new student
        const student = await tx.student.create({
          data: {
            user: {
              connect: { id: user.id },
            },
            matricNo: payload.studentId,
            studentId: payload.studentId!,
          },
        });

        //get courses from the payload and link to student
        if (!payload.courses || payload.courses.length === 0) {
          throw new BadRequestException('Courses are required for student');
        }

        const courses = await tx.course.findMany({
          where: { code: { in: payload.courses } },
        });

        if (courses.length !== payload.courses.length) {
          throw new BadRequestException('One or more courses do not exist');
        }

        for (const courseCode of payload.courses) {
          await tx.courseEnrollment.create({
            data: {
              course: {
                connect: { code: courseCode },
              },
              student: {
                connect: { id: student.id },
              },
            },
          });
        }

        //update the user with imageurl and face embedding if provided
        const updatedUser = await tx.student.update({
          where: { id: student.id },
          data: {
            user: {
              update: {
                imageStatus: ImageStatus.UPLOADED,
                imageUrl: imageUrl,
              },
            },
          },
        });

        return { updatedUser, userId: user.id };
      });

      if (user.embeddingStatus === ImageStatus.UPLOADED) {
        return {
          message:
            'Student enrolled successfully. Image already processed previously.',
          student: transaction.updatedUser,
        };
      }

      if (user.embeddingStatus === ImageStatus.COMPLETED) {
        return {
          message:
            'Student enrolled successfully. Image already processed previously.',
          student: transaction.updatedUser,
        };
      }

      //queue image for processing
      const job = await this.imageProducer.addImageJob({
        imageUrl: imageUrl,
        userId: user.id,
      });

      return {
        message:
          'Student enrolled successfully. Processing image in background.',
        student: transaction.updatedUser,
        jobId: job.id,
      };
    } else if (payload.role === Role.LECTURER) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: { staffNo: payload.lecturerId },
        include: { user: true },
      });

      if (lecturer) {
        return { message: 'Lecturer with this ID already exists', lecturer };
      }

      //lecturer registration
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

      const randomPassword = Math.random().toString(36).slice(-8);

      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const { imageUrl } = await this.helpers.uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      if (!imageUrl) {
        throw new BadRequestException('Image upload failed');
      }

      const transaction = await this.prisma.$transaction(async (tx) => {
        //create a new lecturer user
        const user = await tx.user.create({
          data: {
            email: payload.email ?? '',
            name: payload.fullName ?? 'CoMAS Lecturer',
            role: Role.LECTURER,
            phone: payload.phone ?? '',
            password: hashedPassword,
            isActive: true,
          },
        });

        //create lecturer profile
        const lecturer = await tx.lecturer.create({
          data: {
            user: {
              connect: { id: user.id },
            },
            staffNo: payload.lecturerId,
            hourlyRate: payload.lecturerHourlyRate
              ? parseFloat(payload.lecturerHourlyRate.toString())
              : 0.0,
          },
        });

        //create courses for lecturer if provided
        if (!payload.courses || payload.courses.length === 0) {
          throw new BadRequestException('Courses are required for lecturer');
        }

        const courses = await tx.course.findMany({
          where: { code: { in: payload.courses } },
        });

        if (courses.length !== payload.courses.length) {
          throw new BadRequestException('One or more courses do not exist');
        }

        for (const courseCode of payload.courses) {
          await tx.courseLecturer.create({
            data: {
              course: {
                connect: { code: courseCode },
              },
              lecturer: {
                connect: { id: lecturer.id },
              },
            },
          });
        }

        //update the user with imageurl and face embedding if provided
        const updatedUser = await tx.lecturer.update({
          where: { id: lecturer.id },
          data: {
            user: {
              update: {
                imageStatus: ImageStatus.UPLOADED,
                imageUrl: imageUrl,
              },
            },
          },
        });

        return { updatedUser, userId: user.id };
      });

      //enqueue image for processing
      const job = await this.imageProducer.addImageJob({
        imageUrl: imageUrl,
        userId: transaction.userId,
      });

      await this.helpers.sendSMS(
        [payload.phone],
        `Hello ${payload.fullName}, your staff account has been created. Your temporary password is: ${randomPassword}. Please change it after your first login.`,
      );

      return {
        message: 'Lecturer enrolled successfully',
        lecturer: transaction.updatedUser,
        tempPassword: randomPassword,
        jobId: job.id,
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
          'Email, full name and phone are required for lecturer registration',
        );
      }

      const staff = await this.prisma.staff.findUnique({
        where: { staffNo: payload.staffId },
      });

      if (staff) {
        return { message: 'Staff with this ID already exists', staff };
      }

      const randomPassword = Math.random().toString(36).slice(-8);

      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const { imageUrl } = await this.helpers.uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      if (!imageUrl) {
        throw new BadRequestException('Image upload failed');
      }

      const transaction = await this.prisma.$transaction(async (tx) => {
        //create a new lecturer user
        const user = await tx.user.create({
          data: {
            email: payload.email ?? '',
            name: payload.fullName ?? 'CoMAS Staff',
            role: Role.STAFF,
            phone: payload.phone ?? '',
            password: hashedPassword,
            isActive: true,
          },
        });

        //create lecturer profile
        const staff = await tx.staff.create({
          data: {
            user: {
              connect: { id: user.id },
            },
            staffNo: payload.staffId ?? '',
          },
        });

        //update the user with imageurl and face embedding if provided
        const updatedUser = await tx.staff.update({
          where: { id: staff.id },
          data: {
            user: {
              update: {
                imageStatus: ImageStatus.UPLOADED,
                imageUrl: imageUrl,
              },
            },
          },
        });

        return { updatedUser, userId: user.id };
      });

      //queue image for processing
      const job = await this.imageProducer.addImageJob({
        imageUrl: imageUrl,
        userId: transaction.userId,
      });

      await this.helpers.sendSMS(
        [payload.phone],
        `Hello ${payload.fullName}, your staff account has been created. Your temporary password is: ${randomPassword}. Please change it after your first login.`,
      );

      return {
        message: 'Staff enrolled successfully',
        staff: transaction.updatedUser,
        tempPassword: randomPassword,
        jobId: job.id,
      };
    } else {
      throw new BadRequestException('Invalid role for enrollment');
    }
  }

  async getJobStatus(jobId: string) {
    const state = await this.imageProducer.getJobStatus(jobId);
    if (!state) {
      throw new BadRequestException('Job not found');
    }
    return { jobId, status: state };
  }

  async updateUserDetails(email: string, authDto?: Partial<AuthDto>) {
    const user = await this.helpers.getUser(email);

    const updateData: any = {};

    if (authDto?.name) {
      updateData.name = authDto.name;
    }

    if (authDto?.phone) {
      updateData.phone = authDto.phone;
    }

    // ❗ Strongly recommended: DO NOT allow email change here
    if (authDto?.email && authDto.email !== user.email) {
      throw new BadRequestException(
        'Email change is not allowed via this endpoint',
      );
    }

    if (authDto?.password) {
      updateData.password = await bcrypt.hash(authDto.password, 10);
    }

    if (authDto?.role && authDto.role !== user.role) {
      updateData.role = authDto.role;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    await this.helpers.createSystemLog(
      `User details updated for ${user.email} on ${new Date().toISOString()}`,
    );

    await this.helpers.createUserLog(
      user.email!,
      `Your user details were updated on ${new Date().toISOString()}`,
    );

    return {
      message: 'User details updated successfully',
      user: updatedUser,
    };
  }

  async updateRecords(email: string, payload: Partial<UsersDto>) {
    const user = await this.helpers.getUser(decodeURIComponent(email));

    if (user.role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { userId: user.id },
      });

      if (!student) {
        throw new NotFoundException('Student record not found');
      }

      const updateData: any = {};

      if (payload.studentId) {
        updateData.matricNo = payload.studentId;
        updateData.studentId = payload.studentId;
      }

      const transaction = await this.prisma.$transaction(async (tx) => {
        if (payload.courses && payload.courses.length > 0) {
          for (const courseCode of payload.courses) {
            const existingEnrollment = await tx.courseEnrollment.findFirst({
              where: {
                studentId: student.id,
                course: {
                  code: courseCode,
                },
              },
            });

            if (!existingEnrollment) {
              await tx.courseEnrollment.create({
                data: {
                  course: {
                    connect: { code: courseCode },
                  },
                  student: {
                    connect: { id: student.id },
                  },
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
    } else if (user.role === Role.LECTURER) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: { userId: user.id },
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

      const transaction = await this.prisma.$transaction(async (tx) => {
        if (payload.courses && payload.courses.length > 0) {
          for (const courseCode of payload.courses) {
            const existingAssignment = await tx.courseLecturer.findFirst({
              where: {
                lecturerId: lecturer.id,
                courseId: courseCode,
              },
            });

            if (!existingAssignment) {
              await tx.courseLecturer.create({
                data: {
                  course: {
                    connect: { code: courseCode },
                  },
                  lecturer: {
                    connect: { id: lecturer.id },
                  },
                },
              });
            }
          }
        }
        const updatedLecturer = await tx.lecturer.update({
          where: { id: lecturer.id },
          data: updateData,
        });

        return { updatedLecturer };
      });

      return {
        message: 'Lecturer record updated successfully',
        lecturer: transaction.updatedLecturer,
      };
    } else if (user.role === Role.STAFF) {
      const staff = await this.prisma.staff.findUnique({
        where: { userId: user.id },
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
    }
  }

  async removeUser(email: string) {
    const user = await this.helpers.getUser(email);

    await this.prisma.user.delete({
      where: { id: user.id },
    });

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
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      users,
    };
  }

  async assignRep(courseId: string, studentId: string, email: string) {
    if (!courseId || !studentId) {
      throw new BadRequestException('Course ID and Student ID are required');
    }

    const user = await this.helpers.getUser(email);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SYSTEM_ADMIN &&
      user.role !== Role.STAFF
    ) {
      throw new ForbiddenException('Not authorized to assign course reps');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
    });

    if (!enrollment) {
      throw new BadRequestException(
        'Student must be enrolled in the course to be assigned as rep',
      );
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const rep = await tx.courseRep.upsert({
        where: {
          studentId_courseId: {
            studentId,
            courseId,
          },
        },
        update: {
          studentId,
          courseId,
        },
        create: {
          studentId,
          courseId,
        },
      });

      return {
        rep,
        created: true,
      };
    });

    if (transaction.created) {
      await this.helpers.sendSMS(
        [student.user.phone],
        `Hello ${student.user.name}, you have been assigned as the Course Representative for ${course.title}. Congratulations!`,
      );
    }
    return {
      success: true,
      message: 'Course representative assigned successfully',
      data: transaction.rep,
    };
  }

  async removeCourseRep(courseId: string, studentId: string, email: string) {
    if (!courseId || !studentId) {
      throw new BadRequestException('Course ID and Student ID are required');
    }
    const user = await this.helpers.getUser(email);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SYSTEM_ADMIN &&
      user.role !== Role.STAFF
    ) {
      throw new ForbiddenException('Not authorized to remove course reps');
    }

    const rep = await this.prisma.courseRep.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
    });

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: { phone: true, email: true, name: true },
        },
      },
    });

    if (!rep) {
      throw new NotFoundException('Course representative not found');
    }

    await this.prisma.courseRep.delete({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
    });

    await this.helpers.sendSMS(
      [student!.user.phone],
      `The course representative role for course ID ${courseId} has been removed.`,
    );

    await this.helpers.createSystemLog(
      `Course representative removed for course ID ${courseId} and student ID ${studentId} by ${user.name} on ${new Date().toISOString()}`,
    );

    await this.helpers.createUserLog(
      student!.user.email,
      `You have been removed as the Course Representative for course ID ${courseId} on ${new Date().toISOString()}`,
    );
    return {
      success: true,
      message: 'Course representative removed successfully',
    };
  }

  async createAdmin(
    email: string,
    name: string,
    phone: string,
    secretCode: string,
    adminNo?: string,
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
      throw new BadRequestException('User with this email already exists');
    }

    if (secretCode !== this.configService.get<string>('app.secretCode')) {
      throw new ForbiddenException('Invalid secret code for admin creation');
    }

    // Generate random password
    const randomPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Generate admin number if not provided
    const generatedAdminNo = adminNo ?? `ADM-${Date.now()}`;

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
}
