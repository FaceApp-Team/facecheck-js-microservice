import {
  Controller,
  Get,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('/mark')
  @UseInterceptors(FileInterceptor('face'))
  async markAttendance(
    @Query('source') source: string,
    @Query('sessionId') sessionId: string,
    @UploadedFile() face: Express.Multer.File,
  ) {
    const response = await this.attendance.markAttendance(
      sessionId,
      face,
      source,
    );
    return response;
  }

  @Get('/user-attendance')
  @UseGuards(JwtAuthGuard)
  async getUserAttendane(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.attendance.getUserAttendance(email);
    return response;
  }

  @Get('/all-attendances')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  async getAllAttendances(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.attendance.getAllAttendance(email);
    return response;
  }

  async deleteUserAttendance(
    @Query('attendanceId') attendanceId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.attendance.deleteUserAttendance(
      attendanceId,
      email,
    );
    return response;
  }
}
