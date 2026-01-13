import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { SessionsDto } from '../dto/sessions.dto';
import { Role, SessionStatus } from '../../generated/prisma/enums';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
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

    if (new Date(payload.endTime) <= new Date(payload.startTime)) {
      throw new BadRequestException('End time must be after start time');
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        createdBy: {
          id: user.id,
        },
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
          courseReps: true,
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
            name: payload.name ?? '',
            type: payload.type,
            mode: payload.mode,
            token: sessionToken,
            lecturer: {
              connect: { id: lecturer.id },
            },
            startTime:
              typeof payload.startTime === 'string'
                ? new Date(payload.startTime)
                : payload.startTime,
            endTime:
              typeof payload.endTime === 'string'
                ? new Date(payload.endTime)
                : payload.endTime,
            lateThreshold: payload.lateThreshold,
            absentThreshold: payload.absentThreshold,
            status: SessionStatus.OPEN,
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
      });

      if (!assignment) {
        throw new ForbiddenException('Lecturer not assigned to this course');
      }

      const sessionToken = this.helpers.generateRandomCode(12);

      const transaction = await this.prisma.$transaction(async (tx) => {
        //create session for rep
        const session = await tx.session.create({
          data: {
            name: payload.name ?? 'Session',
            type: payload.type,
            mode: payload.mode,
            token: sessionToken,
            course: {
              connect: { id: course.id },
            },
            startTime:
              typeof payload.startTime === 'string'
                ? new Date(payload.startTime)
                : payload.startTime,
            endTime:
              typeof payload.endTime === 'string'
                ? new Date(payload.endTime)
                : payload.endTime,
            lateThreshold: payload.lateThreshold,
            absentThreshold: payload.absentThreshold,
            status: SessionStatus.OPEN,
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

    return { success: true, data: updatedSession };
  }

  async getAllSessionsAdmin() {
    const sessions = await this.prisma.session.findMany({
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

    return { success: true, data: sessions };
  }

  async getSessionCreatorSessions(email: string) {
    const user = await this.helpers.getUser(decodeURIComponent(email));

    if (user.role !== Role.LECTURER && user.role !== Role.REP) {
      throw new ForbiddenException(
        'Only lecturers and course representatives can access their sessions',
      );
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        createdBy: {
          id: user.id,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      sessions,
    };
  }
}
