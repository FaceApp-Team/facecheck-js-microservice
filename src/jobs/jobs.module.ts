import { Module } from '@nestjs/common';
import { AttendanceJobs } from './attendance.jobs.service';

@Module({
  imports: [],
  controllers: [],
  providers: [AttendanceJobs],
})
export class JobsModule {}
