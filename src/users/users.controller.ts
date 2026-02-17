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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersDto, ModuleEnrollmentDto } from '../dto/users.dto';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { RolesGuard } from '../guards/roles.guard';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Separate face enrollment endpoint
   */
  @SkipThrottle({ default: false })
  @Post('/enroll-face')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.STUDENT, Role.LECTURER, Role.STAFF)
  @UseInterceptors(FilesInterceptor('faces'))
  async enrollFace(
    @UploadedFiles() faces: Express.Multer.File[],
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.users.enrollFace(email, faces);
    return response;
  }

  /**
   * Enroll student in modules and courses (separate from face enrollment)
   */
  @Post('/enroll-modules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.STUDENT)
  async enrollInModulesAndCourses(
    @Body() payload: ModuleEnrollmentDto,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.users.enrollInModulesAndCourses(payload, email);
    return response;
  }

  /**
   * Update student enrollments (replace all modules and courses)
   */
  @Patch('/update-enrollments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.STUDENT)
  async updateStudentEnrollments(
    @Body() payload: ModuleEnrollmentDto,
    @Req() req: Request,
  ) {
    const adminEmail = (req.user as any)?.email;
    const response = await this.users.updateStudentEnrollments(
      payload,
      adminEmail,
    );
    return response;
  }

  @SkipThrottle({ default: false })
  @Post('/enroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.STUDENT)
  @UseInterceptors(FilesInterceptor('faces'))
  async enrollUser(
    @Body() payload: Partial<UsersDto>,
    @UploadedFiles() faces: Express.Multer.File[],
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.users.enrollUser(payload, faces, email);
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
    const role = (req.user as any)?.role;

    const email =
      role === Role.ADMIN || role === Role.SYSTEM_ADMIN
        ? authDto.email
        : (req.user as any)?.email;

    console.log('Received authDto:', authDto);
    console.log('authDto.email:', authDto.email);
    console.log('Authenticated user role:', role);
    console.log('Determined email for update:', email);

    const response = await this.users.updateUserDetails(email, image, authDto);
    return response;
  }

  @Patch('/update-records')
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.STUDENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateRecords(@Body() paylod: Partial<UsersDto>, @Req() req: Request) {
    const role = (req.user as any)?.role;

    const email =
      role === Role.ADMIN || role === Role.SYSTEM_ADMIN
        ? paylod.email
        : (req.user as any)?.email;

    console.log('Received authDto:', paylod);
    console.log('authDto.email:', paylod.email);
    console.log('Authenticated user role:', role);

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

  @SkipThrottle({ default: false })
  @Post('/assign-rep')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  async assignRep(@Query('studentId') studentId: string, @Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.users.assignRep(studentId, email);
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN)
  @Post('/create-admin')
  async createAdmin(
    @Req() req: Request,
    @Body()
    payload: {
      email: string;
      name: string;
      phone: string;
    },
  ) {
    const email = req.user && (req.user as any).email;
    console.log('Requesting user email:', email);
    const response = await this.users.createAdmin(
      payload.email,
      payload.name,
      payload.phone,
      email,
    );
    return response;
  }

  @Get('/fetch-reps')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  async fetchReps(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.users.fetchAllReps(email);
    return response;
  }

  @Get('/all-reps')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER, Role.STAFF)
  async getAllReps(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.users.getAllReps(email);
    return response;
  }

  @Post('/create-super-admin')
  async createSuperAdmin(
    @Body()
    payload: {
      email: string;
      name: string;
      phone: string;
    },
    @Query('secretCode') secretCode: string,
  ) {
    const response = await this.users.createSuperAdmin(
      payload.email,
      payload.name,
      payload.phone,
      secretCode,
    );
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  @Delete('remove/rep')
  async removeRep(@Query('studentId') studentId: string, @Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.users.removeRep(studentId, email);
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
