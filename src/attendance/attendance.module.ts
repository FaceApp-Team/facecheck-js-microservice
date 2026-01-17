import { HttpModule } from '@nestjs/axios';
import { HelpersService } from '../helpers/helpers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';

import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule],
  controllers: [],
  providers: [AttendanceService, PrismaService, HelpersService],
})
export class AttendanceModule {}
