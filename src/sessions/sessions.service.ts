import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { SessionsDto } from '../dto/sessions.dto';
import {
  Priority,
  Role,
  SessionMode,
  SessionStatus,
} from '../../generated/prisma/enums';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async createSession(payload: Partial<SessionsDto>, email: string) {
    const user = await this.helpers.getUser(decodeURIComponent(email));

    if (!payload.name || !payload.type) {
      throw new BadRequestException(
        'Session name and session type are required',
      );
    }

    if (user.role === Role.REP && !payload.lecturerId) {
      throw new BadRequestException('Lecturer ID is required');
    }

    if (user.role === Role.LECTURER && !payload.courseId) {
      throw new BadRequestException('Course ID is required');
    }

    if (!payload.mode) {
      throw new BadRequestException('Session mode is required');
    }

    if (!payload.startTime || !payload.endTime) {
      throw new BadRequestException('Start and end times required');
    }

    // Type narrowing: after validation, these are guaranteed to exist
    const { startTime, endTime, name, type, mode } = payload as Required<
      Pick<SessionsDto, 'startTime' | 'endTime' | 'name' | 'type' | 'mode'>
    >;
    const sessionName = name ?? 'Session';
    const sessionStartTime =
      typeof startTime === 'string' ? new Date(startTime) : startTime;
    const sessionEndTime =
      typeof endTime === 'string' ? new Date(endTime) : endTime;

    if (new Date(sessionEndTime) <= new Date(sessionStartTime)) {
      throw new BadRequestException('End time must be after start time');
    }
    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    // Don't cache open sessions - they're transient and change frequently
    // Query is fast with proper indexes
    const sessions = await this.prisma.session.findMany({
      where: {
        createdBy: { id: user.id },
        status: SessionStatus.OPEN,
      },
    });

    if (sessions.length >= 1) {
      throw new BadRequestException(
        'You already have an open session. Please close it before creating a new one.',
      );
    }

    if (user.role === Role.REP) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: {
          staffNo: payload.lecturerId,
        },
      });

      if (!lecturer) {
        throw new NotFoundException('Lecturer not found');
      }

      const rep = await this.prisma.student.findUnique({
        where: {
          userId: user.id,
        },
        include: {
          courseReps: {
            include: {
              thresholds: {
                select: { lateThreshold: true, absentThreshold: true },
              },
            },
          },
        },
      });

      const uniqueRep = await this.prisma.courseRep.findFirst({
        where: {
          studentId: rep?.id,
          course: {
            lecturers: {
              some: {
                lecturerId: lecturer.id,
              },
            },
          },
        },
        include: {
          thresholds: {
            select: { lateThreshold: true, absentThreshold: true },
          },
        },
      });

      if (!rep?.courseReps || rep.courseReps.length === 0) {
        throw new NotFoundException('User not a course representative');
      }

      const isAuthorized = await this.prisma.courseLecturer.findFirst({
        where: {
          lecturerId: lecturer.id ?? payload.lecturerId,
          courseId: { in: rep.courseReps.map((r) => r.courseId) },
        },
      });

      if (!isAuthorized) {
        throw new ForbiddenException(
          'You are not authorized to create session for this lecturer',
        );
      }

      const sessionToken = this.helpers.generateRandomCode(12);

      //create session for rep
      const transaction = await this.prisma.$transaction(async (tx) => {
        const session = await tx.session.create({
          data: {
            name: sessionName,
            type: type,
            mode: mode,
            token: sessionToken,
            lecturer: {
              connect: { id: lecturer.id },
            },
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            lateThreshold: uniqueRep?.thresholds?.lateThreshold,
            absentThreshold: uniqueRep?.thresholds?.absentThreshold,
            createdBy: {
              connect: { id: user.id },
            },
          },
        });

        return {
          session,
        };
      });

      return { success: true, data: transaction.session };
    } else if (user.role === Role.LECTURER) {
      const course = await this.prisma.course.findUnique({
        where: {
          id: payload.courseId,
        },
      });

      if (!course) {
        throw new NotFoundException('Course not found');
      }

      const lecturer = await this.prisma.lecturer.findUnique({
        where: {
          userId: user.id,
        },
      });

      if (!lecturer) {
        throw new NotFoundException('Lecturer profile not found');
      }

      const assignment = await this.prisma.courseLecturer.findFirst({
        where: {
          lecturerId: lecturer.id,
          courseId: payload.courseId,
        },
        include: {
          lecturer: {
            select: {
              userId: true,
              id: true,
              thresholds: {
                select: { lateThreshold: true, absentThreshold: true },
              },
            },
          },
        },
      });

      if (!assignment) {
        throw new ForbiddenException('Lecturer not assigned to this course');
      }

      const sessionToken = this.helpers.generateRandomCode(12);

      const transaction = await this.prisma.$transaction(async (tx) => {
        //create session for lecturer
        const session = await tx.session.create({
          data: {
            name: sessionName,
            type: type,
            mode: mode,
            token: sessionToken,
            course: {
              connect: { id: course.id },
            },
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            lateThreshold: assignment.lecturer.thresholds?.lateThreshold,
            absentThreshold: assignment.lecturer.thresholds?.absentThreshold,
            createdBy: {
              connect: { id: user.id },
            },
          },
        });
        return {
          session,
        };
      });

      await this.helpers.createUserLog(
        user.email,
        `Session ${sessionName} created successfully on ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      await this.helpers.createSystemLog(
        `Session ${sessionName} created by ${user.name} on ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      return { success: true, data: transaction.session };
    } else {
      throw new ForbiddenException('Access forbidden for this action');
    }
  }

  async closeSession(sessionId: string, email: string) {
    const user = await this.helpers.getUser(decodeURIComponent(email));

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { createdBy: true },
    });

    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.createdBy.id !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to close this session',
      );
    }

    if (session.status === SessionStatus.CLOSED) {
      throw new BadRequestException('Session is already closed');
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CLOSED },
    });

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      user.email,
      `Session ${session.name} closed successfully on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    // Invalidate session caches after closing
    try {
      await Promise.all([
        this.cacheManager.del(`session:${sessionId}:active`),
        this.cacheManager.del(`sessions:user:${user.id}`),
      ]);
    } catch (error) {
      this.logger.warn('Failed to invalidate session caches', error.message);
    }

    await this.helpers.createSystemLog(
      `Session ${session.name} closed by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );
    return { success: true, data: updatedSession };
  }

  async getAllSessionsAdmin(email: string) {
    const user = await this.helpers.getUser(email);

    if (user.role !== Role.ADMIN && user.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Access denied. Admins only.');
    }

    const cacheKey = 'sessions:admin:all';
    let sessions;

    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        this.logger.log('Cache hit: all admin sessions');
        sessions = cached;
      }
    } catch (error) {
      this.logger.warn('Cache read failed for admin sessions', error.message);
    }

    if (!sessions) {
      sessions = await this.prisma.session.findMany({
        include: {
          createdBy: true,
          lecturer: true,
          course: true,
          attendances: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      try {
        await this.cacheManager.set(cacheKey, sessions, 180000); // 3 minutes for admin view
      } catch (error) {
        this.logger.warn(
          'Cache write failed for admin sessions',
          error.message,
        );
      }
    }

    await this.helpers.createSystemLog(
      `All sessions viewed by ${user.name} on ${new Date().toISOString()}`,
      Priority.LOW,
    );

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      user.email,
      `You viewed all sessions on ${new Date().toISOString()}`,
      Priority.LOW,
    );

    return { success: true, data: sessions };
  }

  async getSessionCreatorSessions(email: string) {
    const user = await this.helpers.getUser(decodeURIComponent(email));

    if (user.role !== Role.LECTURER && user.role !== Role.REP) {
      throw new ForbiddenException(
        'Only lecturers and course representatives can access their sessions',
      );
    }

    const cacheKey = `sessions:user:${user.id}`;
    let sessions;

    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit: sessions for user ${user.id}`);
        sessions = cached;
      }
    } catch (error) {
      this.logger.warn(
        `Cache read failed for user ${user.id} sessions`,
        error.message,
      );
    }

    if (!sessions) {
      sessions = await this.prisma.session.findMany({
        where: {
          createdBy: { id: user.id },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      try {
        await this.cacheManager.set(cacheKey, sessions, 180000); // 3 minutes
      } catch (error) {
        this.logger.warn(
          `Cache write failed for user ${user.id} sessions`,
          error.message,
        );
      }
    }

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      user.email,
      `You viewed your sessions on ${new Date().toISOString()}`,
      Priority.LOW,
    );

    await this.helpers.createSystemLog(
      `Sessions for ${user.name} viewed on ${new Date().toISOString()}`,
      Priority.LOW,
    );

    return {
      sessions,
    };
  }

  async updateSession(
    sessionId: string,
    payload: Partial<SessionsDto>,
    email: string,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    // Fetch the session with creator info
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { createdBy: { select: { id: true } } },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Verify user is the creator
    const user = await this.helpers.getUser(email);
    if (session.createdBy.id !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to update this session',
      );
    }

    // Prevent updating mode or status directly
    const { ...updatableFields } = payload;

    // Optional: validate fields (like endTime > startTime)
    if (
      updatableFields.startTime &&
      updatableFields.endTime &&
      new Date(updatableFields.endTime) < new Date(updatableFields.startTime)
    ) {
      throw new BadRequestException('End time cannot be before start time');
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        ...updatableFields,
        updatedAt: new Date(),
      },
    });

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      user.email,
      `Session ${session.name} updated successfully on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Session ${session.name} updated by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    // Invalidate session caches after update
    try {
      await Promise.all([
        this.cacheManager.del(`session:${sessionId}:active`),
        this.cacheManager.del(`sessions:user:${user.id}`),
        this.cacheManager.del('sessions:admin:all'),
      ]);
    } catch (error) {
      this.logger.warn(
        'Failed to invalidate session caches after update',
        error.message,
      );
    }

    return {
      success: true,
      message: 'Session updated successfully',
      session: updatedSession,
    };
  }

  async toggleSessionMode(sessionId: string, email: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { createdBy: { select: { id: true } } },
    });

    const user = await this.helpers.getUser(email);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const creatorId = session.createdBy.id;

    if (creatorId !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to toggle this session mode',
      );
    }

    if (session.status === SessionStatus.CLOSED) {
      throw new ForbiddenException('Cannot toggle mode of a closed session');
    }

    if (session.mode === SessionMode.CHECK_OUT) {
      throw new BadRequestException('Session is already in CHECK_OUT mode');
    }

    if (!session.endTime) {
      throw new ForbiddenException('Session end time is not set');
    }

    const GRACE_MINUTES = 15;

    const now = Date.now();
    const graceDeadline = session.endTime.getTime() + GRACE_MINUTES * 60 * 1000;

    if (now > graceDeadline) {
      throw new ForbiddenException(
        `CHECK_OUT can only be enabled within ${GRACE_MINUTES} minutes after session end time`,
      );
    }

    const newMode = SessionMode.CHECK_OUT;

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { mode: newMode },
    });

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      user.email,
      `Session ${session.name} mode changed to CHECK_OUT on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Session ${session.name} mode changed to CHECK_OUT by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    // Invalidate session cache after mode toggle
    try {
      await this.cacheManager.del(`session:${sessionId}:active`);
    } catch (error) {
      this.logger.warn(
        'Failed to invalidate session cache after mode toggle',
        error.message,
      );
    }

    return { success: true, message: 'Session mode updated successfully' };
  }

  async approveSession(sessionId: string, email: string) {
    const user = await this.helpers.getUser(email);

    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    if (user.role !== Role.ADMIN && user.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Access denied. Admins only.');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        createdBy: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status === SessionStatus.OPEN) {
      return { success: true, message: 'Session is already approved' };
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.OPEN },
    });

    if (!session.createdBy) {
      throw new NotFoundException('Session creator not found');
    }

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      session.createdBy.email,
      `Session with ID ${sessionId} and name ${session.name} approved successfully on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Session with ID ${session.id} and name ${session.name} approved by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, message: 'Session approved successfully' };
  }

  async disproveSession(sessionId: string, email: string) {
    const user = await this.helpers.getUser(email);

    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    if (user.role !== Role.ADMIN && user.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Access denied. Admins only.');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { createdBy: { select: { email: true } } },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!session.createdBy) {
      throw new NotFoundException('Session creator not found');
    }

    if (session.status === SessionStatus.CLOSED) {
      return {
        success: true,
        message: 'Session is already closed or disproved',
      };
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CLOSED },
    });

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      session.createdBy.email,
      `Session with ID ${sessionId} and name ${session.name} approved successfully on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Session with ID ${sessionId} and name ${session.name} approved by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { success: true, message: 'Session approved successfully' };
  }

  async deleteSession(sessionId: string, email: string) {
    const user = await this.helpers.getUser(decodeURIComponent(email));

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { createdBy: true },
    });

    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.createdBy.id !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to delete this session',
      );
    }

    await this.prisma.session.delete({
      where: { id: sessionId },
    });

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      user.email,
      `Session ${session.name} deleted successfully on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Session ${session.name} deleted by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );
    return { success: true, message: 'Session deleted successfully' };
  }
}
