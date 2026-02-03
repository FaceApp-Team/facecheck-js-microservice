import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CoursesDto } from '../dto/courses.dto';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { Priority } from '../../generated/prisma/enums';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

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

    const transaction = await this.prisma.$transaction(async (tx) => {
      const newCourse = await tx.course.create({
        data: {
          code: payload.courseCode,
          title: payload.title,
          description: payload.description,
          creditHours: payload.creditHours,
        },
      });

      return { newCourse };
    });

    await this.helpers.createSystemLog(
      `New course added: ${transaction.newCourse.title} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
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

      if (payload.creditHours) {
        updateData.creditHours = payload.creditHours;
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
      Priority.MEDIUM,
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
      Priority.LOW,
    );
    return { success: true, data: courses };
  }

  async removeCourse(courseId: string, email: string) {
    const user = await this.helpers.getUser(email);

    // Don't cache before deletion - we're about to remove it
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
      Priority.MEDIUM,
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
      Priority.CRITICAL,
    );
    await this.helpers.createUserLog(
      student.user.email,
      `You have been removed from course ${course.title} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );
    return {
      message: 'Course removed from student successfully',
    };
  }

  async removeLecturerCourse(
    email: string,
    courseId: string,
    lecturerId: string,
  ) {
    const user = await this.helpers.getUser(email);

    const lecturer = await this.prisma.lecturer.findUnique({
      where: { id: lecturerId },
      include: { user: { select: { name: true, email: true } } },
    });

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (!lecturer) {
      throw new NotFoundException('Lecturer not found');
    }

    const assignment = await this.prisma.courseLecturer.findUnique({
      where: {
        lecturerId_courseId: {
          lecturerId: lecturer.id,
          courseId,
        },
      },
    });

    if (!assignment) {
      return {
        message: 'Lecturer is not assigned to this course',
      };
    }

    await this.prisma.courseLecturer.delete({
      where: {
        lecturerId_courseId: {
          lecturerId: lecturer.id,
          courseId,
        },
      },
    });

    await this.helpers.createSystemLog(
      `Lecturer ${lecturer.user.name} removed from course ${course.title} by ${user.name} on ${new Date().toISOString()}`,
      Priority.CRITICAL,
    );
    await this.helpers.createUserLog(
      lecturer.user.email,
      `You have been removed from course ${course.title} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );
    return {
      message: 'Lecturer removed from course successfully',
    };
  }

  async getStudentCourses(id: string) {
    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: { student: { user: { id: id } } },
      include: {
        course: {
          include: {
            lecturers: {
              include: {
                lecturer: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        name: true,
                        phone: true,
                        profilePicture: true,
                        isActive: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const courses = enrollments.map((enrollment) => enrollment.course);

    return { success: true, data: courses };
  }

  async getLecturerCourses(userId: string) {
    // First find the lecturer by userId
    const lecturer = await this.prisma.lecturer.findUnique({
      where: { userId: userId },
    });

    if (!lecturer) {
      return { success: false, data: [], message: 'Lecturer not found' };
    }

    const courses = await this.prisma.course.findMany({
      where: { lecturers: { some: { lecturerId: lecturer.id } } },
      include: {
        lecturers: true,
        sessions: true,
        enrollments: true,
        reps: true,
      },
    });

    return { success: true, data: courses };
  }
}
