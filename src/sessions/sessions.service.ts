import {
  BadRequestException,
  ForbiddenException,
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

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
  ) {}

  /**
   * Generate attendance link from session ID
   */
  private generateAttendanceLink(sessionId: string): string {
    const environment = process.env.NODE_ENV || 'development';
    const kioskUrl =
      environment === 'production'
        ? process.env.KIOSK_MODE_URL || 'https://face.comas.edu.gh/kiosk'
        : process.env.DEV_KIOSK_MODE_URL || 'http://localhost:5175/kiosk';
    return `${kioskUrl}/${sessionId}`;
  }

  async createSession(payload: Partial<SessionsDto>, email: string) {
    const user = await this.helpers.getUser(email);

    // Only REPs can create sessions
    if (user.role !== Role.REP) {
      throw new ForbiddenException(
        'Only student representatives can create sessions',
      );
    }

    if (!payload.name || !payload.type) {
      throw new BadRequestException(
        'Session name and session type are required',
      );
    }

    // REPs must select lecturer and module for the session
    if (!payload.lecturerId) {
      throw new BadRequestException('Please select a lecturer for the session');
    }

    if (!payload.moduleId) {
      throw new BadRequestException('Please select a module for the session');
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

    // Verify lecturer exists and get user info for SMS
    const lecturer = await this.prisma.lecturer.findUnique({
      where: {
        id: payload.lecturerId,
      },
      include: {
        user: {
          select: { name: true, phone: true },
        },
        thresholds: {
          select: { lateThreshold: true, absentThreshold: true },
        },
      },
    });

    if (!lecturer) {
      throw new NotFoundException('Lecturer not found');
    }

    // Verify user is a student rep
    const rep = await this.prisma.student.findUnique({
      where: {
        userId: user.id,
      },
      include: {
        studentRep: {
          include: {
            thresholds: {
              select: { lateThreshold: true, absentThreshold: true },
            },
          },
        },
      },
    });

    if (!rep?.studentRep) {
      throw new NotFoundException('User not a student representative');
    }

    // Validate course (optional now)
    let course: any = null;
    if (payload.courseId) {
      course = await this.prisma.course.findUnique({
        where: { id: payload.courseId },
      });
      if (!course) {
        throw new NotFoundException('Course not found');
      }
    }

    // Validate module (required)
    const module = await this.prisma.module.findUnique({
      where: { id: payload.moduleId },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    // Validate subtopic if provided
    let subtopic: any = null;
    if (payload.subtopicId) {
      subtopic = await this.prisma.subtopic.findUnique({
        where: { id: payload.subtopicId },
      });
      if (!subtopic) {
        throw new NotFoundException('Subtopic not found');
      }
      // Verify subtopic belongs to the specified module
      if (subtopic.moduleId !== payload.moduleId) {
        throw new BadRequestException(
          'Subtopic does not belong to the specified module',
        );
      }
    }

    // Validate timetable slot if provided
    if (payload.timetableSlotId) {
      const slot = await this.prisma.timetableSlot.findUnique({
        where: { id: payload.timetableSlotId },
      });
      if (!slot) {
        throw new NotFoundException('Timetable slot not found');
      }
    }

    const sessionToken = this.helpers.generateRandomCode(12);

    // Use rep's thresholds or lecturer's thresholds
    const thresholds = rep.studentRep.thresholds || lecturer.thresholds;

    // Build session data
    const sessionData: any = {
      name: sessionName,
      type: type,
      mode: mode,
      token: sessionToken,
      location: payload.location,
      lecturer: {
        connect: { id: lecturer.id },
      },
      module: {
        connect: { id: module.id },
      },
      startTime: sessionStartTime,
      endTime: sessionEndTime,
      lateThreshold: thresholds?.lateThreshold,
      absentThreshold: thresholds?.absentThreshold,
      createdBy: {
        connect: { id: user.id },
      },
      // Geofencing fields (optional)
      latitude: payload.latitude,
      longitude: payload.longitude,
      geofenceRadius: payload.geofenceRadius ?? 100,
      week: payload.week,
    };

    // Add optional relations
    if (course) {
      sessionData.course = { connect: { id: course.id } };
    }
    if (payload.subtopicId) {
      sessionData.subtopic = { connect: { id: payload.subtopicId } };
    }
    if (payload.timetableSlotId) {
      sessionData.timetableSlot = { connect: { id: payload.timetableSlotId } };
    }

    // Create session
    const transaction = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: sessionData,
      });

      return {
        session,
      };
    });

    // Generate attendance link using session ID
    const attendanceLink = this.generateAttendanceLink(transaction.session.id);

    // Update session with attendance link
    await this.prisma.session.update({
      where: { id: transaction.session.id },
      data: { attendanceLink },
    });

    // Send SMS to lecturer (don't fail session creation if SMS fails)
    let smsSentToLecturer = false;
    if (lecturer.user.phone) {
      try {
        const smsMessage = `Hi ${lecturer.user.name}, a session '${sessionName}' for ${module.name} (${module.code}) has been started by ${user.name}. Check attendance here: ${attendanceLink}`;
        await this.helpers.sendSMS([lecturer.user.phone], smsMessage);
        smsSentToLecturer = true;
        // Update session to mark SMS as sent
        await this.prisma.session.update({
          where: { id: transaction.session.id },
          data: { smsSentToLecturer: true },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send SMS to lecturer ${lecturer.user.name}: ${error}`,
        );
      }
    }

    // Send SMS to students based on subtopic's module level (don't fail session creation if SMS fails)
    let studentsSmsCount = 0;
    if (subtopic) {
      try {
        // Get the module's level from the subtopic
        const moduleLevel = module.level;

        // Fetch all students with the same level as the module
        const students = await this.prisma.student.findMany({
          where: { level: moduleLevel },
          include: {
            user: { select: { name: true, phone: true } },
          },
        });

        // Collect valid phone numbers
        const studentPhones: string[] = [];
        for (const student of students) {
          if (student.user.phone) {
            studentPhones.push(student.user.phone);
          }
        }

        if (studentPhones.length > 0) {
          const studentSmsMessage = `Session '${sessionName}' for ${module.name} (${module.code}) - ${subtopic.name} has started. Mark your attendance here: ${attendanceLink}`;
          await this.helpers.sendSMS(studentPhones, studentSmsMessage);
          studentsSmsCount = studentPhones.length;
          this.logger.log(
            `SMS sent to ${studentsSmsCount} level ${moduleLevel} students for session ${sessionName}`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to send SMS to students: ${error}`);
      }
    }

    await this.helpers.createUserLog(
      user.email,
      `Session ${sessionName} created successfully on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Session ${sessionName} created by rep ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return {
      success: true,
      data: {
        ...transaction.session,
        attendanceLink,
        smsSentToLecturer,
        studentsSmsCount,
      },
    };
  }

  async closeSession(sessionId: string, email: string) {
    const user = await this.helpers.getUser(email);

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

    await this.helpers.createSystemLog(
      `Session ${session.name} closed by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );
    return { success: true, data: updatedSession };
  }

  async getAllSessionsAdmin(email: string) {
    const user = await this.helpers.getUser(email);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SYSTEM_ADMIN &&
      user.role !== Role.STUDENT &&
      user.role !== Role.REP &&
      user.role !== Role.STAFF &&
      user.role !== Role.LECTURER
    ) {
      throw new ForbiddenException('Access denied. Admins only.');
    }

    const sessions = await this.prisma.session.findMany({
      include: {
        createdBy: true,
        lecturer: true,
        module: true,
        course: {
          include: {
            _count: {
              select: { enrollments: true },
            },
            enrollments: {
              include: {
                student: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        attendances: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                student: {
                  select: {
                    studentId: true,
                    matricNo: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    await this.helpers.createSystemLog(
      `All sessions viewed by ${user.name} on ${new Date().toISOString()}`,
      Priority.LOW,
    );

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    return { success: true, data: sessions };
  }

  async getSessionCreatorSessions(email: string) {
    const user = await this.helpers.getUser(email);

    if (user.role !== Role.REP) {
      throw new ForbiddenException(
        'Only student representatives can access their sessions',
      );
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        createdBy: { id: user.id },
      },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
        lecturer: true,
        module: true,
        course: {
          include: {
            _count: {
              select: { enrollments: true },
            },
          },
        },
        attendances: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                student: {
                  select: {
                    studentId: true,
                    matricNo: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

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

    // Bidirectional toggle: CHECK_IN <-> CHECK_OUT
    const currentMode = session.mode;
    let newMode: SessionMode;

    if (currentMode === SessionMode.CHECK_IN) {
      // Toggling TO CHECK_OUT - enforce grace period
      if (!session.endTime) {
        throw new ForbiddenException('Session end time is not set');
      }

      const GRACE_MINUTES = 15;
      const now = Date.now();
      const graceDeadline =
        session.endTime.getTime() + GRACE_MINUTES * 60 * 1000;

      if (now > graceDeadline) {
        throw new ForbiddenException(
          `CHECK_OUT can only be enabled within ${GRACE_MINUTES} minutes after session end time`,
        );
      }

      newMode = SessionMode.CHECK_OUT;
    } else {
      // Toggling back to CHECK_IN - no grace period restriction
      newMode = SessionMode.CHECK_IN;
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { mode: newMode },
    });

    if (!user.email) {
      throw new BadRequestException('User email not found');
    }

    await this.helpers.createUserLog(
      user.email,
      `Session ${session.name} mode changed to ${newMode} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Session ${session.name} mode changed to ${newMode} by ${user.name} on ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return {
      success: true,
      message: `Session mode updated to ${newMode} successfully`,
      mode: newMode,
    };
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
    const user = await this.helpers.getUser(email);

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

  async generateQrCode(sessionId: string) {
    const image = await this.helpers.generateQRCode(sessionId);
    return {
      message: 'QR Code generated successfully',
      data: image,
    };
  }

  async getSessionById(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        lecturer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        course: {
          include: {
            _count: {
              select: { enrollments: true },
            },
          },
        },
        attendances: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                student: {
                  select: {
                    studentId: true,
                    matricNo: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      success: true,
      data: session,
    };
  }

  /**
   * Get session info by session ID (for SMS link access)
   */
  async getSessionByLink(sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        module: { select: { name: true, code: true } },
        subtopic: {
          include: { lecturer: true },
        },
        lecturer: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Return session info without exposing exact coordinates
    return {
      success: true,
      data: {
        id: session.id,
        name: session.name,
        moduleName: session.module?.name,
        moduleCode: session.module?.code,
        subtopicName: session.subtopic?.name,
        lecturerName: session.lecturer?.user?.name,
        mode: session.mode,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        geofenceRadius: session.geofenceRadius,
        hasGeofence: session.latitude != null && session.longitude != null,
        location: session.location,
      },
    };
  }

  /**
   * Get all sessions assigned to a lecturer
   */
  async getLecturerSessions(userId: string) {
    // Find the lecturer record for this user
    const lecturer = await this.prisma.lecturer.findUnique({
      where: { userId },
    });

    if (!lecturer) {
      return { success: true, data: [] };
    }

    const sessions = await this.prisma.session.findMany({
      where: { lecturerId: lecturer.id },
      include: {
        module: {
          select: { id: true, name: true, code: true, level: true },
        },
        subtopic: {
          include: { lecturer: true },
        },
        lecturer: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        attendances: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                student: {
                  select: { studentId: true, matricNo: true },
                },
              },
            },
          },
        },
        course: {
          include: {
            enrollments: {
              include: {
                student: {
                  include: {
                    user: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            },
            _count: {
              select: { enrollments: true },
            },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    return { success: true, data: sessions };
  }
}
