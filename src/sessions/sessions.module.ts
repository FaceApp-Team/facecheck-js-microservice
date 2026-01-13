import { HttpModule } from '@nestjs/axios';
import { HelpersService } from '../helpers/helpers.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule],
  controllers: [],
  providers: [SessionsService, PrismaService, HelpersService],
})
export class SessionsModule {}
