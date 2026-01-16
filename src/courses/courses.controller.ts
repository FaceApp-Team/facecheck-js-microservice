import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesDto } from '../dto/courses.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/add')
  async addCourse(@Body() payload: CoursesDto, @Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.courses.addCourse(payload, email);
    return response;
  }

  @Patch('/update')
  @UseGuards(JwtAuthGuard)
  async updateCourse(
    @Body() payload: Partial<CoursesDto>,
    @Query('courseId') courseId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.courses.updateCourse(courseId, payload, email);
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get('/all')
  async getCourses(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.courses.getAllCourses(email);
    return response;
  }

  async removeCourse(@Query('courseId') courseId: string, @Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.courses.removeCourse(courseId, email);
    return response;
  }

  @UseGuards(JwtAuthGuard)
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
}
