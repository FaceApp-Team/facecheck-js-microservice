import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('/lecturer-earnings')
  @UseGuards(JwtAuthGuard)
  async getLecturersEarnings(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.payroll.getLecturersEarnings(email);
    return response;
  }
}
