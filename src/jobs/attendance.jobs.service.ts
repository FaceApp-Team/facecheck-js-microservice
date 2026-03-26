import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus, SessionStatus } from '../../generated/prisma/enums';

@Injectable()
export class AttendanceJobs {
  private readonly logger = new Logger(AttendanceJobs.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs daily at midnight - mark absent students who didn't check in
  @Cron('0 0 * * *')
  async markAbsentStudents(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find closed sessions from yesterday
      const closedSessions = await this.prisma.session.findMany({
        where: {
          status: SessionStatus.CLOSED,
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
        include: {
          course: {
            include: {
              enrollments: {
                include: {
                  student: true,
                },
              },
            },
          },
          attendances: true,
        },
      });

      let totalMarkedAbsent = 0;

      for (const session of closedSessions) {
        if (!session.course) continue;

        const attendedUserIds = session.attendances.map((a) => a.userId);
        const enrolledStudents = session.course.enrollments;

        for (const enrollment of enrolledStudents) {
          if (!attendedUserIds.includes(enrollment.student.userId)) {
            // Student didn't attend - create absent record
            const existingAttendance = await this.prisma.attendance.findFirst({
              where: {
                sessionId: session.id,
                userId: enrollment.student.userId,
              },
            });

            if (!existingAttendance) {
              await this.prisma.attendance.create({
                data: {
                  sessionId: session.id,
                  userId: enrollment.student.userId,
                  status: AttendanceStatus.ABSENT,
                  remarks: 'Auto-marked absent by system',
                },
              });
              totalMarkedAbsent++;
            }
          }
        }
      }

      if (totalMarkedAbsent > 0) {
        this.logger.log(`Marked ${totalMarkedAbsent} students as absent`);
      }
    } catch (error) {
      this.logger.error('Failed to mark absent students', error);
    }
  }
}
