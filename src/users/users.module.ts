import { HttpModule } from '@nestjs/axios';
import { HelpersService } from '../helpers/helpers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';
import { Module } from '@nestjs/common';
import { ImageProducer } from '../producers/image.producer';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [HttpModule, BullModule.registerQueue({ name: 'image' })],
  controllers: [],
  providers: [
    UsersService,
    PrismaService,
    HelpersService,
    ImageProducer,
    ConfigService,
  ],
})
export class UsersModule {}
