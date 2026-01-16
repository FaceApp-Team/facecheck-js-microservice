import { PayrollService } from './payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [],
  providers: [PayrollService, PrismaService, HelpersService],
})
export class PayrollModule {}
