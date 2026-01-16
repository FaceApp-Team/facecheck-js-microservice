import {
  Controller,
  Get,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('/mark')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('face'))
  async markAttendance(
    @Query('source') source: string,
    @Query('sesionId') sessionId: string,
    @UploadedFile('face') face: Express.Multer.File,
  ) {
    const response = await this.attendance.markAttendance(
      sessionId,
      face,
      source,
    );
    return response;
  }
}
