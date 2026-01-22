import {
  ForbiddenException,
  Inject,
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
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helper: HelpersService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async markAttendance(
    sessionId: string,
    face: Express.Multer.File,
    source: string,
  ) {
    const cacheKey = `session:${sessionId}:active`;
    let session: any;

    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        session = cached;
      }
    } catch (error) {
      this.helper.logger.warn(
        `Cache read failed for session ${sessionId}`,
        error.message,
      );
    }

    if (!session) {
      session = await this.prisma.session.findUnique({
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

      // Cache active sessions for 2 minutes only (they change frequently)
      try {
        await this.cacheManager.set(cacheKey, session, 120000);
      } catch (error) {
        this.helper.logger.warn(
          `Cache write failed for session ${sessionId}`,
          error.message,
        );
      }
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new ForbiddenException('Session is not open for attendance');
    }

    this.helper.checkFileSize(face);

    this.helper.checkMediaType(face, ['image/jpeg', 'image/png', 'image/jpg']);

    const today = new Date();
    const sessionDate = new Date(session.startTime);

    if (
      today.getFullYear() !== sessionDate.getFullYear() ||
      today.getMonth() !== sessionDate.getMonth() ||
      today.getDate() !== sessionDate.getDate()
    ) {
      throw new ForbiddenException('Session is not active today');
    }

    //check if attendance marking is within allowed time window

    if (today < session.startTime) {
      throw new ForbiddenException('Session has not started yet');
    }

    //upload face image to cloud storage
    const imageUrl = await this.helper.uploadImage(
      face.buffer,
      face.originalname,
      face.mimetype,
    );

    const sessionStartTime = session.startTime;
    const absentThreshold = session.absentThreshold;
    const lateThreshold = session.lateThreshold;
    const sessionEndTime = session.endTime;
    const currentTime = new Date();

    if (!session.createdBy) {
      throw new NotFoundException('Session creator not found');
    }

    if (sessionEndTime && currentTime > sessionEndTime) {
      throw new ForbiddenException('Session has ended');
    }

    if (!['kiosk', 'mobile'].includes(source)) {
      throw new ForbiddenException('Invalid attendance source');
    }

    const diffInMins =
      (currentTime.getTime() - sessionStartTime.getTime()) / 60000;

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

    const user = await this.prisma.user.findUnique({
      where: { id: getRecognition.user_id },
      include: { student: { include: { enrollments: true } }, lecturer: true },
    });

    if (!user) {
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
      const isCourseLecturer = await this.prisma.courseLecturer.findUnique({
        where: {
          lecturerId_courseId: {
            lecturerId: user.lecturer.id,
            courseId: session.courseId!,
          },
        },
      });

      if (!isCourseLecturer) {
        throw new ForbiddenException('User not assigned to this course');
      }
    }

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

    //update the user attendance for the session
    if (session.mode === SessionMode.CHECK_IN) {
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
          checkInTime: new Date(),
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
        (new Date().getTime() - existing.checkInTime!.getTime()) / 60000;

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
          checkOutTime: sessionEndTime ? sessionEndTime : new Date(),
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
}
