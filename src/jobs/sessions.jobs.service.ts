import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Priority, SessionStatus } from '../../generated/prisma/enums';
import { Cron } from '@nestjs/schedule';
import { HelpersService } from '../helpers/helpers.service';

@Injectable()
export class SessionJobs {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
  ) {}

  // Runs every hour on Saturday (6) and Sunday (0)
  @Cron('0 0 * * * 0,6')
  async autoCloseWeekendStaleSessions() {
    const now = new Date(new Date().toISOString()); // Use UTC time

    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.session.updateMany({
      where: {
        status: SessionStatus.OPEN,
        createdAt: {
          gte: sevenDaysAgo, // between 7 days ago
          lt: sixDaysAgo, // and 6 days ago
        },
      },
      data: {
        status: SessionStatus.CLOSED,
      },
    });

    if (result.count > 0) {
      console.log(`Weekend cleanup: closed ${result.count} stale sessions`);
    }
  }

  //close sessions whose endtime has passed every 15 minutes
  @Cron('*/15 * * * *')
  async autoCloseEndedSessions() {
    const now = new Date(new Date().toISOString()); // Use UTC time

    const result = await this.prisma.session.updateMany({
      where: {
        status: SessionStatus.OPEN,
        endTime: {
          lt: now,
        },
      },
      data: {
        status: SessionStatus.CLOSED,
      },
    });

    if (result.count > 0) {
      console.log(`Auto-closed ${result.count} sessions that have ended`);
      await this.helpers.createSystemLog(
        `Auto-closed ${result.count} sessions that have ended`,
        Priority.LOW,
      );
    }
  }
}
