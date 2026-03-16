import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import {
  AttendanceStatus,
  Priority,
  SessionMode,
  SessionStatus,
} from '../../generated/prisma/enums';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helper: HelpersService,
  ) {}

  /**
   * Calculate the distance between two coordinates using Haversine formula
   * @returns Distance in meters
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  async markAttendance(
    sessionId: string,
    face: Express.Multer.File,
    source: string,
    userLatitude?: number,
    userLongitude?: number,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        lateThreshold: true,
        absentThreshold: true,
        mode: true,
        status: true,
        courseId: true,
        latitude: true,
        longitude: true,
        geofenceRadius: true,
        createdBy: { select: { id: true } },
        subtopic: {
          select: {
            id: true,
            name: true,
            lecturerId: true,
            module: { select: { id: true, level: true, name: true } },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new ForbiddenException('Session is not open for attendance');
    }

    // Geofencing check - if session has location set, verify user is within range
    if (
      session.latitude != null &&
      session.longitude != null &&
      session.geofenceRadius != null
    ) {
      if (userLatitude == null || userLongitude == null) {
        throw new ForbiddenException(
          'Location is required to mark attendance for this session. Please enable location services.',
        );
      }

      const distanceFromSession = this.calculateDistance(
        session.latitude,
        session.longitude,
        userLatitude,
        userLongitude,
      );

      if (distanceFromSession > session.geofenceRadius) {
        throw new ForbiddenException(
          `You are ${Math.round(distanceFromSession)}m away from the classroom. You must be within ${session.geofenceRadius}m to mark attendance.`,
        );
      }
    }

    this.helper.checkFileSize(face);

    this.helper.checkMediaType(face, ['image/jpeg', 'image/png', 'image/jpg']);

    // Always use UTC for all date/time comparisons
    const nowUtc = new Date(new Date().toISOString());
    const sessionStartUtc = new Date(new Date(session.startTime).toISOString());
    const sessionEndUtc = session.endTime
      ? new Date(new Date(session.endTime).toISOString())
      : null;

    // Only allow attendance if now is between session start and end (UTC)
    // if (nowUtc < sessionStartUtc || (sessionEndUtc && nowUtc > sessionEndUtc)) {
    //   throw new ForbiddenException('Session is not active now');
    // }

    //upload face image to cloud storage
    const imageUrl = await this.helper.uploadImage(face);

    const absentThreshold = session.absentThreshold;
    const lateThreshold = session.lateThreshold;

    if (!session.createdBy) {
      throw new NotFoundException('Session creator not found');
    }

    if (sessionEndUtc && nowUtc > sessionEndUtc) {
      throw new ForbiddenException('Session has ended');
    }

    if (!['kiosk', 'mobile'].includes(source)) {
      throw new ForbiddenException('Invalid attendance source');
    }

    const diffInMins = (nowUtc.getTime() - sessionStartUtc.getTime()) / 60000;

    const isLate = diffInMins > lateThreshold;
    const isAbsent = diffInMins > absentThreshold;

    /*We send the face to the python microservice to get the face detection and 
    recognition model to run on the face, and then compare with the embeddings in the qdrant DB
    when we get the embeddings, it'll come with the ID of the user, then we can mark attendance accordingly
    */

    //mock request to python microservice
    const getRecognition = await this.helper.recognizeFace(imageUrl.imageUrl);

    if (getRecognition.match === false) {
      throw new NotFoundException('Face mismatch: No matching face found');
    }
    if (getRecognition.score < 0.6) {
      throw new ForbiddenException('Face recognition confidence too low');
    }

    if (!getRecognition.user_id) {
      throw new NotFoundException('User not recognized from face');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: getRecognition.user_id },
      include: { student: { include: { enrollments: true } }, lecturer: true },
    });

    if (!user) {
      console.log('User ID from recognition:', getRecognition.user_id);
      throw new NotFoundException('User not found');
    }

    if (!user.student && !user.lecturer) {
      throw new ForbiddenException('User is not a student or lecturer');
    }

    // Validate student level matches module level
    if (user.student && session.subtopic?.module) {
      const moduleLevel = session.subtopic.module.level;
      const studentLevel = user.student.level;
      if (studentLevel !== moduleLevel) {
        throw new ForbiddenException(
          `Your level (${studentLevel}) does not match the module level (${moduleLevel}). You cannot mark attendance for this session.`,
        );
      }
    }

    // Validate lecturer is assigned to the subtopic
    if (user.lecturer && session.subtopic) {
      if (session.subtopic.lecturerId !== user.id) {
        throw new ForbiddenException(
          'You are not assigned to this subtopic. Only the assigned lecturer can mark attendance.',
        );
      }
    }

    //update the user attendance for the session
    // Calculate distance for storing in attendance record
    let distanceFromSession: number | null = null;
    let withinGeofence = true;
    if (
      session.latitude != null &&
      session.longitude != null &&
      userLatitude != null &&
      userLongitude != null
    ) {
      distanceFromSession = this.calculateDistance(
        session.latitude,
        session.longitude,
        userLatitude,
        userLongitude,
      );
      withinGeofence = distanceFromSession <= (session.geofenceRadius ?? 10);
    }

    if (session.mode === SessionMode.CHECK_IN) {
      const existing = await this.prisma.attendance.findUnique({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: user.id,
          },
        },
      });

      if (
        existing &&
        existing.checkInTime &&
        session.mode === SessionMode.CHECK_IN
      ) {
        throw new ForbiddenException('User has already checked in');
      }

      const attendance = await this.prisma.attendance.upsert({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: user.id,
          },
        },
        update: {
          confidence: getRecognition.confidence,
          source,
          checkInTime: nowUtc,
          latitude: userLatitude,
          longitude: userLongitude,
          distanceFromSession,
          withinGeofence,
        },
        create: {
          sessionId: session.id,
          userId: user.id,
          status: isAbsent
            ? AttendanceStatus.ABSENT
            : isLate
              ? AttendanceStatus.LATE
              : AttendanceStatus.CHECKED_IN,
          confidence: getRecognition.confidence,
          source,
          checkInTime: nowUtc,
          latitude: userLatitude,
          longitude: userLongitude,
          distanceFromSession,
          withinGeofence,
        },
      });

      await this.helper.createUserLog(
        user.email,
        `You checked in to session ${session.id} at ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      await this.helper.createSystemLog(
        `User ${user.email} checked in to session ${session.id} at ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      console.log(getRecognition);

      return { attendance: attendance, score: getRecognition.score };
    } else if (session.mode === SessionMode.CHECK_OUT) {
      const existing = await this.prisma.attendance.findUnique({
        where: {
          sessionId_userId: {
            sessionId: sessionId,
            userId: user.id,
          },
        },
      });

      if (!existing) {
        throw new ForbiddenException('User has not checked in');
      }

      if (!existing.checkInTime) {
        throw new ForbiddenException(
          'Check-in time is missing for this record',
        );
      }

      if (existing.checkOutTime && session.mode === SessionMode.CHECK_OUT) {
        throw new ForbiddenException('User has already checked out');
      }

      // Skip minimum stay check for lecturers
      if (!user.lecturer) {
        const MIN_STAY_MINUTES = 30;
        const stayedMinutes =
          (nowUtc.getTime() - existing.checkInTime.getTime()) / 60000;

        if (stayedMinutes < MIN_STAY_MINUTES) {
          throw new ForbiddenException('Minimum attendance duration not met');
        }
      }

      let finalStatus = existing.status;

      if (existing.status === AttendanceStatus.CHECKED_IN) {
        finalStatus = AttendanceStatus.PRESENT;
      }

      const attendance = await this.prisma.attendance.update({
        where: { id: existing.id },
        data: {
          checkOutTime: nowUtc,
          confidence: getRecognition.confidence,
          status: finalStatus,
          source,
        },
      });

      console.log('Checkout' + '' + getRecognition);

      await this.helper.createUserLog(
        user.email,
        `You checked out of session ${session.id} at ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      await this.helper.createSystemLog(
        `User ${user.email} checked out of session ${session.id} at ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );
      return { attendance, score: getRecognition.score };
    }
  }

  async getUserAttendance(email: string) {
    const user = await this.helper.getUser(email);

    const attendance = await this.prisma.attendance.findMany({
      where: { userId: user.id },
      include: {
        session: {
          include: {
            course: true,
            createdBy: { select: { id: true, email: true, name: true } },
          },
        },
      },
      orderBy: { checkInTime: 'desc' },
    });

    return attendance;
  }

  async getAllAttendance(email: string) {
    const user = await this.helper.getUser(email);

    if (
      user.role !== 'ADMIN' &&
      user.role !== 'SYSTEM_ADMIN' &&
      user.role !== 'LECTURER' &&
      user.role !== 'STAFF' &&
      user.role !== 'REP' &&
      user.role !== 'STUDENT'
    ) {
      throw new ForbiddenException('Access denied');
    }

    const attendance = await this.prisma.attendance.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        session: {
          include: {
            course: true,
            createdBy: { select: { id: true, email: true, name: true } },
          },
        },
      },
      orderBy: { checkInTime: 'desc' },
    });

    return attendance;
  }

  async deleteUserAttendance(attendanceId: string, email: string) {
    const user = await this.helper.getUser(email);

    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      if (attendance.userId !== user.id) {
        throw new ForbiddenException(
          'You can only delete your own attendance records',
        );
      }
    }

    await this.prisma.attendance.delete({
      where: { id: attendanceId },
    });

    if (!user.email) {
      throw new NotFoundException('User email not found');
    }

    await this.helper.createUserLog(
      user.email,
      `You deleted attendance record ${attendanceId} at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helper.createSystemLog(
      `User ${user.email} deleted attendance record ${attendanceId} at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { message: 'Attendance record deleted successfully' };
  }

  /**
   * Manual attendance marking by REPs
   * Allows reps to mark attendance for students and lecturers manually
   */
  async markManualAttendance(
    sessionId: string,
    userId: string,
    status: AttendanceStatus,
    remarks: string | undefined,
    repEmail: string,
  ) {
    const rep = await this.helper.getUser(repEmail);

    if (
      rep.role !== 'REP' &&
      rep.role !== 'ADMIN' &&
      rep.role !== 'SYSTEM_ADMIN'
    ) {
      throw new ForbiddenException(
        'Only reps and admins can mark manual attendance',
      );
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        course: { select: { moduleId: true } },
        module: { select: { id: true, level: true, name: true } },
        subtopic: {
          include: { lecturer: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (
      session.status !== SessionStatus.OPEN &&
      session.status !== SessionStatus.CLOSED
    ) {
      throw new ForbiddenException(
        'Session must be open or closed to mark manual attendance',
      );
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new ForbiddenException(
        'Session is closed for attendance. You can only mark manual attendance for open sessions',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: { include: { enrollments: true } },
        lecturer: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify user is enrolled in the course/module or is a lecturer
    if (user.student) {
      if (session.courseId) {
        // Course-based session: check course enrollment
        const isEnrolledInCourse = user.student.enrollments.some(
          (enr) => enr.courseId === session.courseId,
        );

        if (!isEnrolledInCourse) {
          throw new ForbiddenException('Student not enrolled in this course');
        }
      } else if (session.moduleId && session.module) {
        // Module-based session (rep-started): check student level matches module level
        if (user.student.level !== session.module.level) {
          throw new ForbiddenException(
            `Student level ${user.student.level} does not match module level ${session.module.level}`,
          );
        }
      }
    }

    // Lecturer validation: check if assigned to subtopic
    if (user.lecturer && session.subtopic) {
      if (session.subtopic.lecturerId !== user.id) {
        throw new ForbiddenException('Lecturer not assigned to this subtopic');
      }
    }

    // For lecturers, no enrollment check needed (part-time lecturers)
    if (!user.student && !user.lecturer) {
      throw new ForbiddenException('User must be a student or lecturer');
    }

    const nowUtc = new Date(new Date().toISOString());

    // Determine checkIn/checkOut times based on status
    let checkInTime: Date | null = null;
    let checkOutTime: Date | null = null;

    if (
      status === AttendanceStatus.PRESENT ||
      status === AttendanceStatus.CHECKED_IN ||
      status === AttendanceStatus.LATE
    ) {
      checkInTime = session.startTime;
      if (status === AttendanceStatus.PRESENT) {
        checkOutTime = session.endTime || nowUtc;
      }
    }

    const attendance = await this.prisma.attendance.upsert({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId: user.id,
        },
      },
      update: {
        status,
        checkInTime,
        checkOutTime,
        remarks,
        source: 'manual',
      },
      create: {
        sessionId: session.id,
        userId: user.id,
        status,
        checkInTime,
        checkOutTime,
        remarks,
        source: 'manual',
      },
    });

    await this.helper.createUserLog(
      user.email || user.id,
      `Your attendance was manually marked as ${status} for session ${session.id} by rep ${rep.email}`,
      Priority.MEDIUM,
    );

    await this.helper.createSystemLog(
      `Rep ${rep.email} manually marked attendance for user ${user.email || user.id} as ${status} for session ${session.id}`,
      Priority.MEDIUM,
    );

    return attendance;
  }

  /**
   * Bulk manual attendance marking
   * Allows reps to mark attendance for multiple users at once
   */
  async markBulkManualAttendance(
    sessionId: string,
    attendanceRecords: {
      userId: string;
      status: AttendanceStatus;
      remarks?: string;
    }[],
    repEmail: string,
  ) {
    const results: {
      userId: string;
      success: boolean;
      attendance?: any;
    }[] = [];
    const errors: {
      userId: string;
      success: boolean;
      error: string;
    }[] = [];

    for (const record of attendanceRecords) {
      try {
        const attendance = await this.markManualAttendance(
          sessionId,
          record.userId,
          record.status,
          record.remarks,
          repEmail,
        );
        results.push({ userId: record.userId, success: true, attendance });
      } catch (error) {
        errors.push({
          userId: record.userId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { results, errors, totalProcessed: attendanceRecords.length };
  }
}
