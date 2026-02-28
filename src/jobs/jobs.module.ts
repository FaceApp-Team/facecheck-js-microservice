import { Module } from '@nestjs/common';
import { AttendanceJobs } from './attendance.jobs.service';
import { AuthJobs } from './auth.jobs.service';
import { SessionJobs } from './sessions.jobs.service';
import { UsersJobs } from './users.jobs.service';
import { CourseJobs } from './courses.jobs.service';
import { HealthJobs } from './health.jobs.service';
import { NotificationJobs } from './notifications.jobs.service';
import { PayrollJobs } from './payroll.jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersModule } from '../helpers/helpers.module';

@Module({
  imports: [HelpersModule],
  controllers: [],
  providers: [
    PrismaService,
    AttendanceJobs,
    AuthJobs,
    SessionJobs,
    UsersJobs,
    CourseJobs,
    HealthJobs,
    NotificationJobs,
    PayrollJobs,
  ],
})
export class JobsModule {}
