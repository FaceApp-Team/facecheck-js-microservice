import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UsersDto } from '../dto/users.dto';
import { ImageStatus, Role } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import * as bcrypt from 'bcrypt';
import { ImageProducer } from '../producers/image.producer';
import { AuthDto } from '../dto/auth.dto';

@Injectable()
export class UsersService {
  logger = new Logger(UsersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
    private readonly imageProducer: ImageProducer,
  ) {}

  /*conditionally adding the user based on their roles*/
  async enrollUser(payload: Partial<UsersDto>, file: Express.Multer.File) {
    //studnent registration
    if (payload.role === Role.STUDENT) {
      if (!payload.email) {
        throw new BadRequestException(
          'Email is required for student registration',
        );
      }
      const user = await this.helpers.getUser(payload.email);
      if (user.email !== payload.email) {
        throw new BadRequestException('Email does not match user record');
      }

      //create a new student
      const student = await this.prisma.student.create({
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

      for (const courseCode of payload.courses) {
        await this.prisma.courseEnrollment.create({
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

      const { imageUrl } = await this.helpers.uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      if (!imageUrl) {
        throw new BadRequestException('Image upload failed');
      }

      //update the user with imageurl and face embedding if provided
      const updatedUser = await this.prisma.student.update({
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

      //queue image for processing
      const job = await this.imageProducer.addImageJob({
        imageUrl: imageUrl,
        userId: user.id,
      });

      return {
        message:
          'Student enrolled successfully. Processing image in background.',
        student: updatedUser,
        jobId: job.id,
      };
    } else if (payload.role === Role.LECTURER) {
      //lecturer registration
      if (
        !payload.email ||
        !payload.fullName ||
        !payload.password ||
        !payload.phone
      ) {
        throw new BadRequestException(
          'Email, full name, phone and password are required for lecturer registration',
        );
      }

      const randomPassword = Math.random().toString(36).slice(-8);

      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      //create a new lecturer user
      const user = await this.prisma.user.create({
        data: {
          email: payload.email,
          name: payload.fullName ?? 'CoMAS Lecturer',
          role: Role.LECTURER,
          phone: payload.phone,
          password: hashedPassword,
          isActive: true,
        },
      });

      //create lecturer profile
      const lecturer = await this.prisma.lecturer.create({
        data: {
          user: {
            connect: { id: user.id },
          },
          staffNo: payload.lecturerId,
        },
      });

      //create courses for lecturer if provided
      if (!payload.courses || payload.courses.length === 0) {
        throw new BadRequestException('Courses are required for lecturer');
      }

      for (const courseCode of payload.courses) {
        await this.prisma.courseLecturer.create({
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

      const { imageUrl } = await this.helpers.uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      if (!imageUrl) {
        throw new BadRequestException('Image upload failed');
      }

      const updatedUser = await this.prisma.lecturer.update({
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

      //enqueue image for processing
      const job = await this.imageProducer.addImageJob({
        imageUrl: imageUrl,
        userId: user.id,
      });

      return {
        message: 'Lecturer enrolled successfully',
        lecturer: updatedUser,
        tempPassword: randomPassword,
        jobId: job.id,
      };
    } else if (payload.role === Role.STAFF) {
      //staff registration
      if (
        !payload.email ||
        !payload.fullName ||
        !payload.password ||
        !payload.phone ||
        !payload.staffId
      ) {
        throw new BadRequestException(
          'Email, full name, phone and password are required for lecturer registration',
        );
      }

      const randomPassword = Math.random().toString(36).slice(-8);

      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      //create a new lecturer user
      const user = await this.prisma.user.create({
        data: {
          email: payload.email,
          name: payload.fullName ?? 'CoMAS Staff',
          role: Role.STAFF,
          phone: payload.phone,
          password: hashedPassword,
          isActive: true,
        },
      });

      //create lecturer profile
      const staff = await this.prisma.staff.create({
        data: {
          user: {
            connect: { id: user.id },
          },
          staffNo: payload.staffId ?? '',
        },
      });

      const { imageUrl } = await this.helpers.uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      if (!imageUrl) {
        throw new BadRequestException('Image upload failed');
      }

      //update the user with imageurl and face embedding if provided
      const updatedUser = await this.prisma.staff.update({
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

      //queue image for processing
      const job = await this.imageProducer.addImageJob({
        imageUrl: imageUrl,
        userId: user.id,
      });

      return {
        message: 'Staff enrolled successfully',
        staff: updatedUser,
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

  async updateUserDetails(
    userDto?: Partial<UsersDto>,
    authDto?: Partial<AuthDto>,
  ) {
    //update user details
    const user = await this.helpers.getUser(authDto!.email!);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        name: userDto?.fullName ?? user.name,
        phone: userDto?.phone ?? user.phone,
        role: (userDto?.role ?? user.role) || Role.STUDENT,
        email: userDto?.email ?? user.email,
        student: {
          update: {
            studentId: userDto?.studentId,
            matricNo: userDto?.studentId,
          },
        },
      },
    });

    return {
      message: 'User details updated successfully',
      user: updatedUser,
    };
  }
}
