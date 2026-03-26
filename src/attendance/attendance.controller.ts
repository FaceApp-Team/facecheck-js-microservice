import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
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
import { SkipThrottle } from '@nestjs/throttler';
import {
  ManualAttendanceDto,
  BulkManualAttendanceDto,
} from '../dto/attendance.dto';

@SkipThrottle()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('/mark')
  @UseInterceptors(FileInterceptor('face'))
  async markAttendance(
    @Query('source') source: string,
    @Query('sessionId') sessionId: string,
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @UploadedFile() face: Express.Multer.File,
  ) {
    const lat = latitude ? parseFloat(latitude) : undefined;
    const lon = longitude ? parseFloat(longitude) : undefined;
    const response = await this.attendance.markAttendance(
      sessionId,
      face,
      source,
      lat,
      lon,
    );
    return response;
  }

  @Get('/user-attendance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.STUDENT,
    Role.REP,
    Role.STAFF,
    Role.LECTURER,
  )
  async getUserAttendane(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.attendance.getUserAttendance(email);
    return response;
  }

  @Get('/all-attendances')
  @UseGuards(JwtAuthGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.LECTURER,
    Role.STAFF,
    Role.REP,
    Role.STUDENT,
  )
  async getAllAttendances(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.attendance.getAllAttendance(email);
    return response;
  }

  @Delete('/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
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

  @Post('/mark-manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.REP)
  async markManualAttendance(
    @Body() dto: ManualAttendanceDto,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const customStartTime = dto.startTime ? new Date(dto.startTime) : undefined;
    const customEndTime = dto.endTime ? new Date(dto.endTime) : undefined;
    const response = await this.attendance.markManualAttendance(
      dto.sessionId,
      dto.userId,
      dto.status,
      dto.remarks,
      email,
      customStartTime,
      customEndTime,
    );
    return response;
  }

  @Post('/mark-bulk-manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.REP)
  async markBulkManualAttendance(
    @Body() dto: BulkManualAttendanceDto,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.attendance.markBulkManualAttendance(
      dto.sessionId,
      dto.attendanceRecords,
      email,
    );
    return response;
  }
}
