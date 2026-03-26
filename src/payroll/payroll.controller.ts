import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { RolesGuard } from '../guards/roles.guard';
import { Role } from '../../generated/prisma/enums';
import { Roles } from '../decorators/roles.decorator';
import { Request } from 'express';

@SkipThrottle()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('/lecturer-earnings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.LECTURER, Role.ADMIN, Role.SYSTEM_ADMIN)
  async getLecturersEarnings() {
    const response = await this.payroll.getLecturerEarnings();
    return response;
  }

  @Get('/lecturer-earnings/:year/:month')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  async getLecturersEarningsByPeriod(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const response = await this.payroll.getLecturerEarningsByPeriod(
      year,
      month,
    );
    return response;
  }

  @Get('/lecturer/:lecturerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  async getLecturerPayroll(@Param('lecturerId') lecturerId: string) {
    const response = await this.payroll.getLecturerPayroll(lecturerId);
    return response;
  }

  @Get('/lecturer/:lecturerId/:year/:month')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  async getLecturerPayrollByPeriod(
    @Param('lecturerId') lecturerId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const response = await this.payroll.getLecturerPayrollByPeriod(
      lecturerId,
      year,
      month,
    );
    return response;
  }

  @Get('/lecturer/:lecturerId/range')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER)
  async getLecturerPayrollByDateRange(
    @Param('lecturerId') lecturerId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const response = await this.payroll.getLecturerPayrollByDateRange(
      lecturerId,
      new Date(startDate),
      new Date(endDate),
    );
    return response;
  }

  @Get('/my-payroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.LECTURER)
  async getMyPayroll(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.payroll.getLecturerPayrollByEmail(email);
    return response;
  }

  @Get('/my-payroll/:year/:month')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.LECTURER)
  async getMyPayrollByPeriod(
    @Req() req: Request,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.payroll.getLecturerPayrollByEmailAndPeriod(
      email,
      year,
      month,
    );
    return response;
  }
}
