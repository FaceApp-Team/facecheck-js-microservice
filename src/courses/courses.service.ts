import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CoursesDto } from '../dto/courses.dto';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
  ) {}

  async addCourse(payload: CoursesDto) {
    const course = await this.prisma.course.findUnique({
      where: { code: payload.courseCode },
    });

    if (course) {
      return {
        message: 'Course with this code already exists',
        course: course,
      };
    }

    if (!payload.description || !payload.title || !payload.courseCode) {
      throw new BadRequestException(
        'Course title, code and description are required',
      );
    }

    if (!payload.lecturerId) {
      throw new BadRequestException('Lecturer ID is required');
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const lecturer = await tx.lecturer.findUnique({
        where: { id: payload.lecturerId },
      });

      if (!lecturer) {
        throw new NotFoundException('Lecturer not found');
      }

      const newCourse = await tx.course.create({
        data: {
          code: payload.courseCode,
          title: payload.title,
          lecturers: {
            connect: { id: payload.lecturerId },
          },
        },
      });

      return { newCourse, lecturer };
    });
    return { success: true, data: transaction.newCourse };
  }

  async updateCourse(courseId: string, payload: Partial<CoursesDto>) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { lecturers: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const updateData: any = {};

      if (payload.title) {
        updateData.title = payload.title;
      }
      if (payload.description) {
        updateData.description = payload.description;
      }
      if (payload.courseCode) {
        updateData.code = payload.courseCode;
      }

      if (payload.lecturerId) {
        const lecturer = await tx.lecturer.findUnique({
          where: { id: payload.lecturerId },
        });

        if (!lecturer) {
          throw new NotFoundException('Lecturer not found');
        }

        updateData.lecturers = {
          connect: { id: payload.lecturerId },
        };
      }

      const updatedCourse = await tx.course.update({
        where: { id: courseId },
        data: updateData,
      });

      return { updatedCourse };
    });

    return { success: true, data: transaction.updatedCourse };
  }

  async getAllCourses() {
    const courses = await this.prisma.course.findMany({
      include: {
        lecturers: true,
        enrollments: true,
        reps: true,
        sessions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: courses };
  }

  async removeCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.course.delete({
      where: { id: courseId },
    });

    return { success: true, message: 'Course removed successfully' };
  }

  async removeStudentCourse(email: string, courseId: string) {
    const user = await this.helpers.getUser(email);

    const student = await this.prisma.student.findUnique({
      where: { userId: user.id },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: student.id,
          courseId,
        },
      },
    });

    if (!enrollment) {
      return {
        message: 'Student is not enrolled in this course',
      };
    }

    await this.prisma.courseEnrollment.delete({
      where: {
        studentId_courseId: {
          studentId: student.id,
          courseId,
        },
      },
    });

    return {
      message: 'Course removed from student successfully',
    };
  }
}
