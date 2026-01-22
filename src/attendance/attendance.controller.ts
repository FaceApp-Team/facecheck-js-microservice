import {
  Controller,
  Get,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { FileInterceptor } from '@nestjs/platform-express';

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
}
