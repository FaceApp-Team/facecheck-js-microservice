import { Module } from '@nestjs/common';
import { ImageConsumer } from './image.consumer';
import { HelpersModule } from '../helpers/helpers.module';
import { HelpersService } from '../helpers/helpers.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HelpersModule, HttpModule],
  controllers: [],
  providers: [ImageConsumer, HelpersService, PrismaService],
})
export class ConsumersModule {}
