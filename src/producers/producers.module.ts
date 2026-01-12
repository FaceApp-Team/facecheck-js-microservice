import { Module } from '@nestjs/common';
import { ImageProducer } from './image.producer';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [BullModule.registerQueue({ name: 'image' })],
  controllers: [],
  providers: [ImageProducer],
})
export class ProducersModule {}
