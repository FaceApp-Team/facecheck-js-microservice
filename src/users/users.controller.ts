import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersDto } from '../dto/users.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('/enroll')
  @UseInterceptors(FileInterceptor('image'))
  async enrollUser(
    @Body() payload: Partial<UsersDto>,
    @UploadedFile('image') image: Express.Multer.File,
  ) {
    const response = await this.users.enrollUser(payload, image);
    return response;
  }

  @Get('/job-status')
  async getJobStatus(@Query('jobId') jobId: string) {
    const response = await this.users.getJobStatus(jobId);
    return response;
  }

  @Patch('/update')
  @UseGuards(JwtAuthGuard)
  async updateUserDetails(
    @Body() authDto: Partial<UsersDto>,
    @Req() req: Request,
    @Query('mail') mail?: string,
  ) {
    const email = (req.user as any)?.email
      ? (req.user as any)?.email
      : encodeURIComponent(mail ?? '');

    const response = await this.users.updateUserDetails(email, authDto);
    return response;
  }

  @Patch('/update-records')
  @UseGuards(JwtAuthGuard)
  async updateRecords(
    @Body() paylod: Partial<UsersDto>,
    @Query('mail') mail: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email
      ? (req.user as any)?.email
      : encodeURIComponent(mail ?? '');

    const response = await this.users.updateRecords(email, paylod);
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get('/remove')
  async removeUser(@Query('email') email: string) {
    const response = await this.users.removeUser(email);
    return response;
  }

  @Get('/all')
  @UseGuards(JwtAuthGuard)
  async getAllUsers() {
    const response = await this.users.getAllUsers();
    return response;
  }

  @Post('/assign-rep')
  @UseGuards(JwtAuthGuard)
  async assignRep(
    @Query('courseId') courseId: string,
    @Query('studentId') studentId: string,
    @Query('mail') mail: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email
      ? (req.user as any)?.email
      : encodeURIComponent(mail ?? '');
    const response = await this.users.assignRep(courseId, studentId, email);
    return response;
  }

  async createAdmin(
    @Body()
    payload: {
      email: string;
      name: string;
      phone: string;
      adminNo?: string;
    },
  ) {
    const response = await this.users.createAdmin(
      payload.email,
      payload.name,
      payload.phone,
      payload.adminNo,
    );
    return response;
  }
}
