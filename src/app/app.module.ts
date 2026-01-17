import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemService } from './app.service';

@Module({
  imports: [],
  controllers: [],
  providers: [ConfigService, SystemService],
})
export class AppModule {}
