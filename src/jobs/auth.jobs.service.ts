import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class AuthJobs {
  private readonly logger = new Logger(AuthJobs.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs every hour at minute 0
  @Cron('0 * * * *')
  async unlockUserAccounts(): Promise<void> {
    try {
      const now = new Date();
      const result = await this.prisma.user.updateMany({
        where: {
          accountLockedUntil: {
            not: null,
            lt: now,
          },
        },
        data: {
          accountLockedUntil: null,
          loginRetries: 0,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Unlocked ${result.count} user accounts`);
      }
    } catch (error) {
      this.logger.error('Failed to unlock user accounts', error);
    }
  }
}
