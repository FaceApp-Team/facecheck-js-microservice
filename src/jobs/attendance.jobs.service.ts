import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class AttendanceJobs {
  @Cron('0 0 * * *')
  async sessionJob() {}
}
