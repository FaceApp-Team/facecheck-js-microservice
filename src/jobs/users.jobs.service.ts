import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class UsersJobs {
  private readonly logger = new Logger(UsersJobs.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs daily at 2 AM - clear expired password reset codes
  @Cron('0 2 * * *')
  async clearExpiredResetCodes(): Promise<void> {
    try {
      const now = new Date();
      // Clear reset codes older than 1 hour
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const result = await this.prisma.user.updateMany({
        where: {
          resetCodeCreatedAt: {
            not: null,
            lt: oneHourAgo,
          },
        },
        data: {
          passwordResetCode: null,
          resetCodeCreatedAt: null,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleared ${result.count} expired password reset codes`);
      }
    } catch (error) {
      this.logger.error('Failed to clear expired reset codes', error);
    }
  }
}
