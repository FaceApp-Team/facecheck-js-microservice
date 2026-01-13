import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesDto } from '../dto/courses.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/add')
  async addCourse(@Body() payload: CoursesDto) {
    const response = await this.courses.addCourse(payload);
    return response;
  }

  @Patch('/update')
  @UseGuards(JwtAuthGuard)
  async updateCourse(
    @Body() payload: Partial<CoursesDto>,
    @Query('courseId') courseId: string,
  ) {
    const response = await this.courses.updateCourse(courseId, payload);
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get('/all')
  async getCourses() {
    const response = await this.courses.getAllCourses();
    return response;
  }

  async removeCourse(@Query('courseId') courseId: string) {
    const response = await this.courses.removeCourse(courseId);
    return response;
  }
}
