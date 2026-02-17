import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
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

  @Get('/lecturer/:lecturerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  async getLecturerPayroll(@Param('lecturerId') lecturerId: string) {
    const response = await this.payroll.getLecturerPayroll(lecturerId);
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
}
