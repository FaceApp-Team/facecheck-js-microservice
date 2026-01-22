import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CoursesDto } from '../dto/courses.dto';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { Cache } from '@nestjs/cache-manager';
import { Priority } from '../../generated/prisma/enums';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
    @Inject('CACHE_MANAGER') private readonly cacheManager: Cache,
  ) {}

  async addCourse(payload: CoursesDto, email: string) {
    const user = await this.helpers.getUser(email);
    let course;

    const savedCourse = await this.cacheManager.get(
      `course_code_${payload.courseCode}`,
    );

    if (savedCourse) {
      course = savedCourse;
    } else {
      course = await this.prisma.course.findUnique({
        where: { code: payload.courseCode },
      });
    }

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

    await this.cacheManager.set(
      `course_code_${payload.courseCode}`,
      course,
      600000, //cache for 10 minutes
    );

    const transaction = await this.prisma.$transaction(async (tx) => {
      const newCourse = await tx.course.create({
        data: {
          code: payload.courseCode,
          title: payload.title,
          description: payload.description,
        },
      });

      return { newCourse };
    });

    // Invalidate course list cache after adding new course
    try {
      await this.cacheManager.del('courses:all');
    } catch (error) {
      this.logger.warn('Failed to invalidate courses cache', error.message);
    }

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

    let course;
    const savedCourse = await this.cacheManager.get(
      `updated_course_${courseId}`,
    );

    if (savedCourse) {
      course = savedCourse;
    } else {
      course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: { lecturers: true },
      });
    }

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.cacheManager.set(`updated_course_${courseId}`, course, 600000); //cache for 10 minutes

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

    // Invalidate course caches after update
    try {
      await Promise.all([
        this.cacheManager.del(`course:${courseId}:details`),
        this.cacheManager.del(`course:code:${course.code}`),
        this.cacheManager.del('courses:all'),
      ]);
    } catch (error) {
      this.logger.warn(
        'Failed to invalidate course caches after update',
        error.message,
      );
    }

    await this.helpers.createSystemLog(
      `Course updated: ${transaction.updatedCourse.title} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, data: transaction.updatedCourse };
  }

  async getAllCourses(email: string) {
    const user = await this.helpers.getUser(email);
    let courses;

    const savedCourses = await this.cacheManager.get('all_courses');

    if (savedCourses) {
      courses = savedCourses;
    } else {
      courses = await this.prisma.course.findMany({
        include: {
          lecturers: true,
          enrollments: true,
          reps: true,
          sessions: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      await this.cacheManager.set('all_courses', courses, 600000); //cache for 10 minutes
    }

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
}
