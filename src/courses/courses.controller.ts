import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesDto, ModulesDto } from '../dto/courses.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Request } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  // ==================== MODULE ENDPOINTS ====================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  @Post('/modules/add')
  async addModule(@Body() payload: ModulesDto, @Req() req: Request) {
    const email = (req.user as any)?.email;
    return this.courses.addModule(payload, email);
  }

  @Patch('/modules/update')
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateModule(
    @Body() payload: Partial<ModulesDto>,
    @Query('moduleId') moduleId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    return this.courses.updateModule(moduleId, payload, email);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.LECTURER,
    Role.STUDENT,
    Role.REP,
    Role.STAFF,
  )
  @Get('/modules/all')
  async getAllModules(@Req() req: Request) {
    const email = (req.user as any)?.email;
    return this.courses.getAllModules(email);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.LECTURER,
    Role.STUDENT,
    Role.REP,
    Role.STAFF,
  )
  @Get('/modules/by-id')
  async getModuleById(
    @Query('moduleId') moduleId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    return this.courses.getModuleById(moduleId, email);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('/modules/remove')
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  async removeModule(@Query('moduleId') moduleId: string, @Req() req: Request) {
    const email = (req.user as any)?.email;
    return this.courses.removeModule(moduleId, email);
  }

  // ==================== COURSE ENDPOINTS ====================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  @Post('/add')
  async addCourse(@Body() payload: CoursesDto, @Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.courses.addCourse(payload, email);
    return response;
  }

  @Patch('/update')
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateCourse(
    @Body() payload: Partial<CoursesDto>,
    @Query('courseId') courseId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.courses.updateCourse(courseId, payload, email);
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER, Role.STUDENT, Role.REP)
  @Get('/all')
  async getCourses(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.courses.getAllCourses(email);
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('/remove')
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  async removeCourse(@Query('courseId') courseId: string, @Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.courses.removeCourse(courseId, email);
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER, Role.STUDENT)
  @Get('/remove-student-course')
  async removeStudentCourse(
    @Query('courseId') courseId: string,
    @Query('studentId') studentId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.courses.removeStudentCourse(
      email,
      courseId,
      studentId,
    );
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER, Role.STUDENT)
  @Get('/remove-lecturer-course') // Fixed typo
  async removeLecturerCourse(
    @Query('courseId') courseId: string,
    @Query('lecturerId') lecturerId: string, // Fixed variable name
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.courses.removeLecturerCourse(
      // Call correct service
      email,
      courseId,
      lecturerId,
    );
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER, Role.STUDENT, Role.REP)
  @Get('/student-courses')
  async getStudentCourses(@Req() req: Request) {
    const id = (req.user as any)?.id;
    const response = await this.courses.getStudentCourses(id);
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  @Get('/lecturer-courses')
  async getLecturerCourses(@Req() req: Request) {
    const id = (req.user as any)?.id;
    const response = await this.courses.getLecturerCourses(id);
    return response;
  }
}
