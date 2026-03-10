import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import {
  CreateModuleDto,
  UpdateModuleDto,
  CreateSubtopicDto,
  UpdateSubtopicDto,
  CreateTimetableDto,
  UpdateTimetableDto,
  CreateTimetableSlotDto,
  UpdateTimetableSlotDto,
} from '../dto/activities.dto';
import { Priority, Role } from '../../generated/prisma/enums';

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
  ) {}

  // ============================================
  // MODULES - CRUD Operations
  // ============================================

  /**
   * Get all modules with optional filters (level, semester)
   */
  async getModules(level?: number, semester?: number) {
    const where: any = {};
    if (level) where.level = level;
    if (semester) where.semester = semester;

    const modules = await this.prisma.module.findMany({
      where,
      include: {
        subtopics: {
          orderBy: { order: 'asc' },
          include: {
            lecturer: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: { subtopics: true, timetables: true },
        },
      },
      orderBy: [{ level: 'asc' }, { semester: 'asc' }, { order: 'asc' }],
    });

    // Calculate total contact hours for each module
    const modulesWithStats = modules.map((module) => {
      const totalContactHours = module.subtopics.reduce(
        (sum, subtopic) => sum + subtopic.weeks * subtopic.hoursPerWeek,
        0,
      );
      return {
        ...module,
        totalContactHours,
      };
    });

    return { success: true, data: modulesWithStats };
  }

  /**
   * Get single module with all details
   */
  async getModuleById(moduleId: string) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        subtopics: {
          orderBy: { order: 'asc' },
          include: {
            lecturer: { select: { id: true, name: true, email: true } },
          },
        },
        timetables: {
          include: {
            slots: {
              include: {
                subtopic: true,
                lecturer: { select: { id: true, name: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!module) {
      throw new NotFoundException('Module not found');
    }

    return { success: true, data: module };
  }

  /**
   * Create a new module (Admin/System Admin only)
   */
  async createModule(dto: CreateModuleDto, email: string) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    // Check if module code already exists
    const existing = await this.prisma.module.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(
        `Module with code ${dto.code} already exists`,
      );
    }

    // Validate level
    if (![100, 200, 300, 400, 500, 600].includes(dto.level)) {
      throw new BadRequestException(
        'Level must be 100, 200, 300, 400, 500, or 600',
      );
    }

    const module = await this.prisma.module.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        credits: dto.credits,
        level: dto.level,
        semester: dto.semester,
        order: dto.order ?? 0,
        duration: dto.duration ?? 12,
        createdById: user.id,
      },
    });

    await this.helpers.createSystemLog(
      `Module ${dto.code} - ${dto.name} created by ${user.name}`,
      Priority.MEDIUM,
    );

    return {
      success: true,
      data: module,
      message: 'Module created successfully',
    };
  }

  /**
   * Update a module (Admin/System Admin only)
   */
  async updateModule(moduleId: string, dto: UpdateModuleDto, email: string) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    // Check for code uniqueness if updating code
    if (dto.code && dto.code !== module.code) {
      const existing = await this.prisma.module.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new BadRequestException(
          `Module with code ${dto.code} already exists`,
        );
      }
    }

    const updated = await this.prisma.module.update({
      where: { id: moduleId },
      data: dto,
    });

    await this.helpers.createSystemLog(
      `Module ${updated.code} updated by ${user.name}`,
      Priority.LOW,
    );

    return {
      success: true,
      data: updated,
      message: 'Module updated successfully',
    };
  }

  /**
   * Delete a module (cascades to subtopics, timetables, slots)
   */
  async deleteModule(moduleId: string, email: string) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    await this.prisma.module.delete({ where: { id: moduleId } });

    await this.helpers.createSystemLog(
      `Module ${module.code} - ${module.name} deleted by ${user.name}`,
      Priority.HIGH,
    );

    return { success: true, message: 'Module deleted successfully' };
  }

  // ============================================
  // SUBTOPICS - CRUD Operations
  // ============================================

  /**
   * Get all subtopics for a module
   */
  async getSubtopics(moduleId: string) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    const subtopics = await this.prisma.subtopic.findMany({
      where: { moduleId },
      include: {
        lecturer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { order: 'asc' },
    });

    return { success: true, data: subtopics };
  }

  /**
   * Add a subtopic to a module
   */
  async createSubtopic(
    moduleId: string,
    dto: CreateSubtopicDto,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    // Get lecturer name if lecturerId provided
    let lecturerName: string | undefined;
    if (dto.lecturerId) {
      const lecturer = await this.prisma.user.findUnique({
        where: { id: dto.lecturerId },
        select: { name: true, role: true },
      });
      if (!lecturer || lecturer.role !== Role.LECTURER) {
        throw new BadRequestException('Invalid lecturer');
      }
      lecturerName = lecturer.name;
    }

    // Auto-assign order if not provided
    const maxOrder = await this.prisma.subtopic.aggregate({
      where: { moduleId },
      _max: { order: true },
    });

    const subtopic = await this.prisma.subtopic.create({
      data: {
        moduleId,
        name: dto.name,
        lecturerId: dto.lecturerId,
        lecturerName,
        weeks: dto.weeks ?? 1,
        hoursPerWeek: dto.hoursPerWeek ?? 1,
        order: dto.order ?? (maxOrder._max.order ?? 0) + 1,
      },
      include: {
        lecturer: { select: { id: true, name: true, email: true } },
      },
    });

    // Auto-create timetable slot if slot data is provided
    let createdSlot: any = null;
    if (dto.day && dto.startTime && dto.endTime) {
      // Find or create timetable for the module
      let timetable = await this.prisma.timetable.findFirst({
        where: {
          moduleId,
          ...(dto.academicYear ? { academicYear: dto.academicYear } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

      // Create timetable if it doesn't exist and academicYear is provided
      if (!timetable && dto.academicYear) {
        timetable = await this.prisma.timetable.create({
          data: {
            moduleId,
            level: module.level,
            semester: module.semester,
            academicYear: dto.academicYear,
            totalWeeks: dto.weeks ?? 4,
            createdById: user.id,
          },
        });
      }

      if (timetable) {
        // Check for overlapping slots
        const existingSlot = await this.prisma.timetableSlot.findFirst({
          where: {
            timetableId: timetable.id,
            week: dto.slotWeek ?? 1,
            day: dto.day,
            startTime: dto.startTime,
          },
        });

        if (!existingSlot) {
          createdSlot = await this.prisma.timetableSlot.create({
            data: {
              timetableId: timetable.id,
              moduleId,
              subtopicId: subtopic.id,
              day: dto.day,
              startTime: dto.startTime,
              endTime: dto.endTime,
              activityType: dto.activityType ?? 'LECTURE',
              lecturerId: dto.lecturerId,
              lecturerName,
              venue: dto.venue,
              week: dto.slotWeek ?? 1,
              colSpan: dto.colSpan ?? 1,
            },
            include: {
              module: { select: { id: true, code: true, name: true } },
              subtopic: { select: { id: true, name: true } },
              lecturer: { select: { id: true, name: true } },
            },
          });
        }
      }
    }

    await this.helpers.createSystemLog(
      `Subtopic "${dto.name}" added to module ${module.code} by ${user.name}${createdSlot ? ' with timetable slot' : ''}`,
      Priority.LOW,
    );

    return {
      success: true,
      data: {
        subtopic,
        ...(createdSlot && { timetableSlot: createdSlot }),
      },
      message: createdSlot
        ? 'Subtopic and timetable slot created successfully'
        : 'Subtopic created successfully',
    };
  }

  /**
   * Update a subtopic
   */
  async updateSubtopic(
    moduleId: string,
    subtopicId: string,
    dto: UpdateSubtopicDto,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const subtopic = await this.prisma.subtopic.findFirst({
      where: { id: subtopicId, moduleId },
    });
    if (!subtopic) {
      throw new NotFoundException('Subtopic not found');
    }

    // Get lecturer name if lecturerId is being updated
    let lecturerName: string | undefined;
    if (dto.lecturerId) {
      const lecturer = await this.prisma.user.findUnique({
        where: { id: dto.lecturerId },
        select: { name: true, role: true },
      });
      if (!lecturer || lecturer.role !== Role.LECTURER) {
        throw new BadRequestException('Invalid lecturer');
      }
      lecturerName = lecturer.name;
    }

    const updated = await this.prisma.subtopic.update({
      where: { id: subtopicId },
      data: {
        ...dto,
        ...(lecturerName && { lecturerName }),
      },
      include: {
        lecturer: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      success: true,
      data: updated,
      message: 'Subtopic updated successfully',
    };
  }

  /**
   * Delete a subtopic
   */
  async deleteSubtopic(moduleId: string, subtopicId: string, email: string) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const subtopic = await this.prisma.subtopic.findFirst({
      where: { id: subtopicId, moduleId },
    });
    if (!subtopic) {
      throw new NotFoundException('Subtopic not found');
    }

    await this.prisma.subtopic.delete({ where: { id: subtopicId } });

    await this.helpers.createSystemLog(
      `Subtopic "${subtopic.name}" deleted by ${user.name}`,
      Priority.LOW,
    );

    return { success: true, message: 'Subtopic deleted successfully' };
  }

  // ============================================
  // TIMETABLES - CRUD Operations
  // ============================================

  /**
   * Get all timetables with optional filters
   */
  async getTimetables(
    level?: number,
    semester?: number,
    academicYear?: string,
  ) {
    const where: any = {};
    if (level) where.level = level;
    if (semester) where.semester = semester;
    if (academicYear) where.academicYear = academicYear;

    const timetables = await this.prisma.timetable.findMany({
      where,
      include: {
        module: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { slots: true } },
      },
      orderBy: [{ level: 'asc' }, { semester: 'asc' }],
    });

    return { success: true, data: timetables };
  }

  /**
   * Get timetable by ID with all slots
   */
  async getTimetableById(timetableId: string) {
    const timetable = await this.prisma.timetable.findUnique({
      where: { id: timetableId },
      include: {
        module: {
          include: {
            subtopics: {
              orderBy: { order: 'asc' },
              include: { lecturer: { select: { id: true, name: true } } },
            },
          },
        },
        slots: {
          orderBy: [{ week: 'asc' }, { day: 'asc' }, { startTime: 'asc' }],
          include: {
            subtopic: true,
            lecturer: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!timetable) {
      throw new NotFoundException('Timetable not found');
    }

    return { success: true, data: timetable };
  }

  /**
   * Get timetable for a specific module
   */
  async getModuleTimetable(moduleId: string, academicYear?: string) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    const where: any = { moduleId };
    if (academicYear) where.academicYear = academicYear;

    const timetable = await this.prisma.timetable.findFirst({
      where,
      include: {
        module: true,
        slots: {
          orderBy: [{ week: 'asc' }, { day: 'asc' }, { startTime: 'asc' }],
          include: {
            subtopic: true,
            lecturer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: timetable };
  }

  /**
   * Create or update timetable metadata
   */
  async createTimetable(dto: CreateTimetableDto, email: string) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const module = await this.prisma.module.findUnique({
      where: { id: dto.moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    // Check if timetable already exists for this module and academic year
    const existing = await this.prisma.timetable.findUnique({
      where: {
        moduleId_academicYear: {
          moduleId: dto.moduleId,
          academicYear: dto.academicYear,
        },
      },
    });

    if (existing) {
      // Update existing timetable
      const updated = await this.prisma.timetable.update({
        where: { id: existing.id },
        data: {
          totalWeeks: dto.totalWeeks ?? existing.totalWeeks,
          startDate: dto.startDate
            ? new Date(dto.startDate)
            : existing.startDate,
          endDate: dto.endDate ? new Date(dto.endDate) : existing.endDate,
        },
      });
      return {
        success: true,
        data: updated,
        message: 'Timetable updated successfully',
      };
    }

    // Create new timetable
    const timetable = await this.prisma.timetable.create({
      data: {
        moduleId: dto.moduleId,
        level: module.level,
        semester: module.semester,
        academicYear: dto.academicYear,
        totalWeeks: dto.totalWeeks ?? 4,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        createdById: user.id,
      },
    });

    await this.helpers.createSystemLog(
      `Timetable created for module ${module.code} (${dto.academicYear}) by ${user.name}`,
      Priority.MEDIUM,
    );

    return {
      success: true,
      data: timetable,
      message: 'Timetable created successfully',
    };
  }

  /**
   * Update timetable settings
   */
  async updateTimetable(
    timetableId: string,
    dto: UpdateTimetableDto,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const timetable = await this.prisma.timetable.findUnique({
      where: { id: timetableId },
    });
    if (!timetable) {
      throw new NotFoundException('Timetable not found');
    }

    const updated = await this.prisma.timetable.update({
      where: { id: timetableId },
      data: {
        ...(dto.academicYear && { academicYear: dto.academicYear }),
        ...(dto.totalWeeks && { totalWeeks: dto.totalWeeks }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
    });

    return {
      success: true,
      data: updated,
      message: 'Timetable updated successfully',
    };
  }

  /**
   * Delete a timetable (cascades to slots)
   */
  async deleteTimetable(timetableId: string, email: string) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const timetable = await this.prisma.timetable.findUnique({
      where: { id: timetableId },
      include: { module: true },
    });
    if (!timetable) {
      throw new NotFoundException('Timetable not found');
    }

    await this.prisma.timetable.delete({ where: { id: timetableId } });

    await this.helpers.createSystemLog(
      `Timetable for module ${timetable.module.code} deleted by ${user.name}`,
      Priority.HIGH,
    );

    return { success: true, message: 'Timetable deleted successfully' };
  }

  // ============================================
  // TIMETABLE SLOTS - CRUD Operations
  // ============================================

  /**
   * Get all slots for a timetable (with optional week filter)
   */
  async getTimetableSlots(timetableId: string, week?: number) {
    const timetable = await this.prisma.timetable.findUnique({
      where: { id: timetableId },
    });
    if (!timetable) {
      throw new NotFoundException('Timetable not found');
    }

    const where: any = { timetableId };
    if (week) where.week = week;

    const slots = await this.prisma.timetableSlot.findMany({
      where,
      include: {
        module: { select: { id: true, code: true, name: true } },
        subtopic: { select: { id: true, name: true } },
        lecturer: { select: { id: true, name: true } },
      },
      orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
    });

    return { success: true, data: slots };
  }

  /**
   * Add a time slot to a timetable
   */
  async createTimetableSlot(
    timetableId: string,
    dto: CreateTimetableSlotDto,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const timetable = await this.prisma.timetable.findUnique({
      where: { id: timetableId },
    });
    if (!timetable) {
      throw new NotFoundException('Timetable not found');
    }

    // Validate module
    const module = await this.prisma.module.findUnique({
      where: { id: dto.moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    // Validate subtopic if provided
    if (dto.subtopicId) {
      const subtopic = await this.prisma.subtopic.findUnique({
        where: { id: dto.subtopicId },
      });
      if (!subtopic) {
        throw new NotFoundException('Subtopic not found');
      }
    }

    // Get lecturer name if provided
    let lecturerName: string | undefined;
    if (dto.lecturerId) {
      const lecturer = await this.prisma.user.findUnique({
        where: { id: dto.lecturerId },
        select: { name: true },
      });
      if (lecturer) {
        lecturerName = lecturer.name;
      }
    }

    // Check for overlapping slots
    const existingSlot = await this.prisma.timetableSlot.findFirst({
      where: {
        timetableId,
        week: dto.week ?? 1,
        day: dto.day,
        startTime: dto.startTime,
      },
    });
    if (existingSlot) {
      throw new BadRequestException(
        'A slot already exists at this time for this day and week',
      );
    }

    const slot = await this.prisma.timetableSlot.create({
      data: {
        timetableId,
        moduleId: dto.moduleId,
        subtopicId: dto.subtopicId,
        day: dto.day,
        startTime: dto.startTime,
        endTime: dto.endTime,
        activityType: dto.activityType ?? 'LECTURE',
        lecturerId: dto.lecturerId,
        lecturerName,
        venue: dto.venue,
        week: dto.week ?? 1,
        colSpan: dto.colSpan ?? 1,
      },
      include: {
        module: { select: { id: true, code: true, name: true } },
        subtopic: { select: { id: true, name: true } },
        lecturer: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      data: slot,
      message: 'Time slot created successfully',
    };
  }

  /**
   * Update a time slot
   */
  async updateTimetableSlot(
    timetableId: string,
    slotId: string,
    dto: UpdateTimetableSlotDto,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const slot = await this.prisma.timetableSlot.findFirst({
      where: { id: slotId, timetableId },
    });
    if (!slot) {
      throw new NotFoundException('Time slot not found');
    }

    // Get lecturer name if updating lecturer
    let lecturerName: string | undefined;
    if (dto.lecturerId) {
      const lecturer = await this.prisma.user.findUnique({
        where: { id: dto.lecturerId },
        select: { name: true },
      });
      if (lecturer) {
        lecturerName = lecturer.name;
      }
    }

    const updated = await this.prisma.timetableSlot.update({
      where: { id: slotId },
      data: {
        ...dto,
        ...(lecturerName && { lecturerName }),
      },
      include: {
        module: { select: { id: true, code: true, name: true } },
        subtopic: { select: { id: true, name: true } },
        lecturer: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      data: updated,
      message: 'Time slot updated successfully',
    };
  }

  /**
   * Delete a time slot
   */
  async deleteTimetableSlot(
    timetableId: string,
    slotId: string,
    email: string,
  ) {
    const user = await this.helpers.getUser(email);
    this.checkAdminAccess(user.role);

    const slot = await this.prisma.timetableSlot.findFirst({
      where: { id: slotId, timetableId },
    });
    if (!slot) {
      throw new NotFoundException('Time slot not found');
    }

    await this.prisma.timetableSlot.delete({ where: { id: slotId } });

    return { success: true, message: 'Time slot deleted successfully' };
  }

  // ============================================
  // LECTURER SCHEDULE
  // ============================================

  /**
   * Get a lecturer's teaching schedule across all modules
   */
  async getLecturerSchedule(lecturerId: string) {
    const lecturer = await this.prisma.user.findUnique({
      where: { id: lecturerId },
      select: { id: true, name: true, role: true },
    });
    if (!lecturer || lecturer.role !== Role.LECTURER) {
      throw new NotFoundException('Lecturer not found');
    }

    const slots = await this.prisma.timetableSlot.findMany({
      where: { lecturerId },
      include: {
        module: { select: { id: true, code: true, name: true } },
        subtopic: { select: { id: true, name: true } },
        timetable: {
          select: { academicYear: true, level: true, semester: true },
        },
      },
      orderBy: [{ week: 'asc' }, { day: 'asc' }, { startTime: 'asc' }],
    });

    // Also get subtopics where lecturer is assigned
    const subtopics = await this.prisma.subtopic.findMany({
      where: { lecturerId },
      include: {
        module: { select: { id: true, code: true, name: true } },
      },
    });

    return {
      success: true,
      data: {
        lecturer: { id: lecturer.id, name: lecturer.name },
        timetableSlots: slots,
        assignedSubtopics: subtopics,
      },
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Check if user has admin access
   */
  private checkAdminAccess(role: Role | undefined) {
    if (
      !role ||
      (role !== Role.ADMIN && role !== Role.SYSTEM_ADMIN && role !== Role.REP)
    ) {
      throw new ForbiddenException('Access denied. Admin privileges required.');
    }
  }
}
