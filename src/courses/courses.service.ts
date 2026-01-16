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

  async addCourse(payload: CoursesDto, email: string) {
    const user = await this.helpers.getUser(email);
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

    await this.helpers.createSystemLog(
      `New course added: ${transaction.newCourse.title} by ${user.name} on ${new Date().toISOString()}`,
    );

    return { success: true, data: transaction.newCourse };
  }

  async updateCourse(
    courseId: string,
    payload: Partial<CoursesDto>,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);
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

    await this.helpers.createSystemLog(
      `Course updated: ${transaction.updatedCourse.title} by ${user.name} on ${new Date().toISOString()}`,
    );

    return { success: true, data: transaction.updatedCourse };
  }

  async getAllCourses(email: string) {
    const user = await this.helpers.getUser(email);
    const courses = await this.prisma.course.findMany({
      include: {
        lecturers: true,
        enrollments: true,
        reps: true,
        sessions: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.helpers.createSystemLog(
      `Fetched all courses on ${new Date().toISOString()} by ${user.name}`,
    );
    return { success: true, data: courses };
  }

  async removeCourse(courseId: string, email: string) {
    const user = await this.helpers.getUser(email);
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.course.delete({
      where: { id: courseId },
    });

    await this.helpers.createSystemLog(
      `Course removed: ${course.title} by ${user.name} on ${new Date().toISOString()}`,
    );
    return { success: true, message: 'Course removed successfully' };
  }

  async removeStudentCourse(
    email: string,
    courseId: string,
    studentId: string,
  ) {
    const user = await this.helpers.getUser(email);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: { select: { name: true, email: true } } },
    });

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

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

    await this.helpers.createSystemLog(
      `Student ${student.user.name} removed from course ${courseId} by ${user.name} on ${new Date().toISOString()}`,
    );
    await this.helpers.createUserLog(
      student.user.email,
      `You have been removed from course ${course.title} on ${new Date().toISOString()}`,
    );
    return {
      message: 'Course removed from student successfully',
    };
  }
}
