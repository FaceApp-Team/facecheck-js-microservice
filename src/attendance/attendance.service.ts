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

  async markAttendance(
    sessionId: string,
    face: Express.Multer.File,
    source: string,
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
        createdBy: { select: { id: true } },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new ForbiddenException('Session is not open for attendance');
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
    if (nowUtc < sessionStartUtc || (sessionEndUtc && nowUtc > sessionEndUtc)) {
      throw new ForbiddenException('Session is not active now');
    }

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

    if (session.createdBy.id === getRecognition.user_id) {
      throw new ForbiddenException('Session creator cannot mark attendance');
    }

    if (!user.student && !user.lecturer) {
      throw new ForbiddenException('User is not a student or lecturer');
    }

    if (user.student) {
      if (
        !user.student.enrollments.some(
          (enr) => enr.courseId === session.courseId,
        )
      ) {
        throw new ForbiddenException('User not enrolled for this course');
      }
    }

    if (user.lecturer) {
      const isLecturer = await this.prisma.lecturer.findFirst({
        where: {
          id: user.lecturer.id,
        },
      });

      if (!isLecturer) {
        throw new ForbiddenException('User not assigned to this course');
      }
    }

    //update the user attendance for the session
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

      if (existing.checkOutTime && session.mode === SessionMode.CHECK_OUT) {
        throw new ForbiddenException('User has already checked out');
      }

      const MIN_STAY_MINUTES = 30;

      const stayedMinutes =
        (nowUtc.getTime() - existing.checkInTime!.getTime()) / 60000;

      if (stayedMinutes < MIN_STAY_MINUTES) {
        throw new ForbiddenException('Minimum attendance duration not met');
      }

      let finalStatus = existing.status;

      if (existing.status === AttendanceStatus.CHECKED_IN) {
        finalStatus = AttendanceStatus.PRESENT;
      }

      const attendance = await this.prisma.attendance.update({
        where: { id: existing.id },
        data: {
          checkOutTime: sessionEndUtc ? sessionEndUtc : nowUtc,
          confidence: getRecognition.confidence,
          status: finalStatus,
          source,
        },
      });

      await this.helper.createUserLog(
        user.email,
        `You checked out of session ${session.id} at ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );

      await this.helper.createSystemLog(
        `User ${user.email} checked out of session ${session.id} at ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );
      return attendance;
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
}
