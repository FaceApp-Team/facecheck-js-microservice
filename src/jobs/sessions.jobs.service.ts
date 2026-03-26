import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Priority, SessionStatus } from '../../generated/prisma/enums';
import { Cron } from '@nestjs/schedule';
import { HelpersService } from '../helpers/helpers.service';

@Injectable()
export class SessionJobs {
  private readonly logger = new Logger(SessionJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
  ) {}

  // Runs every hour on Saturday (6) and Sunday (0)
  @Cron('0 * * * 0,6')
  async autoCloseWeekendStaleSessions(): Promise<void> {
    try {
      const now = new Date();

      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const result = await this.prisma.session.updateMany({
        where: {
          status: SessionStatus.OPEN,
          createdAt: {
            gte: sevenDaysAgo,
            lt: sixDaysAgo,
          },
        },
        data: {
          status: SessionStatus.CLOSED,
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Weekend cleanup: closed ${result.count} stale sessions`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to close weekend stale sessions', error);
    }
  }

  // Close sessions whose endtime has passed every 15 minutes
  @Cron('*/15 * * * *')
  async autoCloseEndedSessions(): Promise<void> {
    try {
      const now = new Date();

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
        this.logger.log(`Auto-closed ${result.count} sessions that have ended`);
        await this.helpers.createSystemLog(
          `Auto-closed ${result.count} sessions that have ended`,
          Priority.LOW,
        );
      }
    } catch (error) {
      this.logger.error('Failed to auto-close ended sessions', error);
    }
  }
}
