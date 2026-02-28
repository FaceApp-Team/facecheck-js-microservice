import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CoursesDto, ModulesDto } from '../dto/courses.dto';
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

  // ==================== MODULE METHODS ====================

  async addModule(payload: ModulesDto, email: string) {
    const user = await this.helpers.getUser(email);

    const existingModule = await this.prisma.module.findUnique({
      where: { code: payload.moduleCode },
    });

    if (existingModule) {
      return {
        message: 'Module with this code already exists',
        module: existingModule,
      };
    }

    if (!payload.name || !payload.moduleCode) {
      throw new BadRequestException('Module name and code are required');
    }

    const newModule = await this.prisma.module.create({
      data: {
        name: payload.name,
        code: payload.moduleCode,
        description: payload.description,
        duration: payload.duration ?? 12,
      },
    });

    await this.helpers.createSystemLog(
      `New module added: ${newModule.name} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, data: newModule };
  }

  async updateModule(
    moduleId: string,
    payload: Partial<ModulesDto>,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });

    if (!module) {
      throw new NotFoundException('Module not found');
    }

    const updateData: any = {};

    if (payload.name) {
      updateData.name = payload.name;
    }
    if (payload.description) {
      updateData.description = payload.description;
    }
    if (payload.moduleCode) {
      updateData.code = payload.moduleCode;
    }
    if (payload.duration) {
      updateData.duration = payload.duration;
    }

    const updatedModule = await this.prisma.module.update({
      where: { id: moduleId },
      data: updateData,
    });

    await this.helpers.createSystemLog(
      `Module updated: ${updatedModule.name} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, data: updatedModule };
  }

  async getAllModules(email: string) {
    const user = await this.helpers.getUser(email);

    const modules = await this.prisma.module.findMany({
      include: {
        courses: {
          include: {
            lecturers: {
              include: {
                lecturer: {
                  include: {
                    user: {
                      select: { id: true, name: true, email: true },
                    },
                  },
                },
              },
            },
            enrollments: true,
            sessions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.helpers.createSystemLog(
      `Fetched all modules on ${new Date().toISOString()} by ${user.name}`,
      Priority.LOW,
    );

    return { success: true, data: modules };
  }

  async getModuleById(moduleId: string, email: string) {
    await this.helpers.getUser(email);

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        courses: {
          include: {
            lecturers: {
              include: {
                lecturer: {
                  include: {
                    user: {
                      select: { id: true, name: true, email: true },
                    },
                  },
                },
              },
            },
            enrollments: true,
          },
        },
      },
    });

    if (!module) {
      throw new NotFoundException('Module not found');
    }

    return { success: true, data: module };
  }

  async removeModule(moduleId: string, email: string) {
    const user = await this.helpers.getUser(email);

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });

    if (!module) {
      throw new NotFoundException('Module not found');
    }

    await this.prisma.module.delete({
      where: { id: moduleId },
    });

    await this.helpers.createSystemLog(
      `Module removed: ${module.name} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, message: 'Module removed successfully' };
  }

  // ==================== COURSE METHODS ====================

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

    if (!payload.title || !payload.courseCode) {
      throw new BadRequestException('Course title and code are required');
    }

    // Validate module if provided
    if (payload.moduleId) {
      const module = await this.prisma.module.findUnique({
        where: { id: payload.moduleId },
      });
      if (!module) {
        throw new NotFoundException('Module not found');
      }
    }

    const newCourse = await this.prisma.course.create({
      data: {
        code: payload.courseCode,
        title: payload.title,
        description: payload.description,
        creditHours: payload.creditHours,
        moduleId: payload.moduleId,
      },
    });

    await this.helpers.createSystemLog(
      `New course added: ${newCourse.title} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, data: newCourse };
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
    if (payload.moduleId) {
      const module = await this.prisma.module.findUnique({
        where: { id: payload.moduleId },
      });
      if (!module) {
        throw new NotFoundException('Module not found');
      }
      updateData.moduleId = payload.moduleId;
    }

    const updatedCourse = await this.prisma.course.update({
      where: { id: courseId },
      data: updateData,
    });

    await this.helpers.createSystemLog(
      `Course updated: ${updatedCourse.title} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, data: updatedCourse };
  }

  async getAllCourses(email: string) {
    const user = await this.helpers.getUser(email);

    const courses = await this.prisma.course.findMany({
      include: {
        lecturers: {
          include: {
            lecturer: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
        enrollments: true,
        sessions: true,
        module: true,
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
        lecturers: {
          include: {
            lecturer: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
        sessions: true,
        enrollments: true,
        module: true,
      },
    });

    return { success: true, data: courses };
  }
}
