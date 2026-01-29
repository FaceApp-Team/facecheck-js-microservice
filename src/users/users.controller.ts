import {
  Body,
  Controller,
  Delete,
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
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { RolesGuard } from '../guards/roles.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('/enroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.STUDENT)
  @UseInterceptors(FileInterceptor('face'))
  async enrollUser(
    @Body() payload: Partial<UsersDto>,
    @UploadedFile() image: Express.Multer.File,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.users.enrollUser(payload, image, email);
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get('/job-status')
  async getJobStatus(@Query('jobId') jobId: string) {
    const response = await this.users.getJobStatus(jobId);
    return response;
  }

  @Patch('/update')
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.STUDENT,
    Role.LECTURER,
    Role.REP,
    Role.STAFF,
  )
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(FileInterceptor('profilePicture'))
  async updateUserDetails(
    @Body() authDto: Partial<UsersDto>,
    @Req() req: Request,
    @UploadedFile() image: Express.Multer.File,
  ) {
    const email = (req.user as any)?.email;

    const response = await this.users.updateUserDetails(email, image, authDto);
    return response;
  }

  @Patch('/update-records')
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.STUDENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateRecords(@Body() paylod: Partial<UsersDto>, @Req() req: Request) {
    const email = (req.user as any)?.email;

    const response = await this.users.updateRecords(email, paylod);
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('/remove')
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
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

  @Get('/assign-rep')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  async assignRep(
    @Query('courseId') courseId: string,
    @Query('studentId') studentId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;

    const response = await this.users.assignRep(courseId, studentId, email);
    return response;
  }

  @Post('/create-admin')
  async createAdmin(
    @Body()
    payload: {
      email: string;
      name: string;
      phone: string;
    },
    @Query('secretCode') secretCode: string,
  ) {
    const response = await this.users.createAdmin(
      payload.email,
      payload.name,
      payload.phone,
      secretCode,
    );
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  @Delete('remove/rep')
  async removeCourseRep(
    @Query('courseId') courseId: string,
    @Query('studentId') studentId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.users.removeCourseRep(
      courseId,
      studentId,
      email,
    );
    return response;
  }

  @Get('/fetch-students')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.LECTURER,
    Role.REP,
    Role.STAFF,
    Role.STUDENT,
  )
  async fetchStudents(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.users.fetchStudents(email);
    return response;
  }

  @Post('/update-thresholds')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.LECTURER, Role.REP)
  async updateThresholds(
    @Req() req: Request,
    @Body() thresholds: { lateThreshold: number; absentThreshold: number },
  ) {
    const email = (req.user as any)?.email;
    const response = await this.users.updateThresholds(email, thresholds);
    return response;
  }

  @Get('/by-email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.LECTURER,
    Role.REP,
    Role.STAFF,
    Role.STUDENT,
  )
  async getUserByEmail(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.users.getUserByEmail(email);
    return response;
  }

  @Get('/by-id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.LECTURER,
    Role.REP,
    Role.STAFF,
    Role.STUDENT,
  )
  async getUserById(@Req() req: Request) {
    const id = (req.user as any)?.id;
    const response = await this.users.getUserById(id);
    return response;
  }
}
