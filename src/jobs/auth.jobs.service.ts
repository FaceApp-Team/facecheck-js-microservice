import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class AuthJobs {
  constructor(private readonly prisma: PrismaService) {}
  @Cron('*/1 */1 * * *')
  async unlockUserAccounts(): Promise<void> {
    const now = new Date();
    await this.prisma.user.updateMany({
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
  }
}
