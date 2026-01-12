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
    @Body() userDto: Partial<UsersDto>,
    @Body() authDto: Partial<UsersDto>,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;

    const response = await this.users.updateUserDetails(email, authDto);
    return response;
  }
}
