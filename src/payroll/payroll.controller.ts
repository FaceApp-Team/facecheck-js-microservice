import { Controller, Get, UseGuards } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { RolesGuard } from '../guards/roles.guard';
import { Role } from '../../generated/prisma/enums';
import { Roles } from '../decorators/roles.decorator';

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
}
