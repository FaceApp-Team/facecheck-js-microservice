import { Controller, Get, Query } from '@nestjs/common';
import { SystemService } from './app.service';

@Controller('app')
export class AppController {
  constructor(private readonly appService: SystemService) {}

  @Get('shutdown')
  async shutDown(@Query('secretCode') secretCode: string) {
    const result = await this.appService.shutDown(secretCode);
    return result;
  }
}
