import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthJobs {
  private readonly logger = new Logger(HealthJobs.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs every 5 minutes - check database connectivity
  @Cron('*/5 * * * *')
  async checkDatabaseHealth(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Database health check failed', error);
    }
  }
}
