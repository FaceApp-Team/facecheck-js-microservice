import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationJobs {
  private readonly logger = new Logger(NotificationJobs.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs daily at 6 AM - clean up old logs
  @Cron('0 6 * * *')
  async cleanupOldLogs(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.prisma.logs.deleteMany({
        where: {
          createdAt: {
            lt: thirtyDaysAgo,
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} old user logs`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old logs', error);
    }
  }
}
