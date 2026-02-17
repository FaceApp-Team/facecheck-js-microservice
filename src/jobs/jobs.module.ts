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
import { HelpersService } from '../helpers/helpers.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [],
  providers: [
    PrismaService,
    HelpersService,
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
