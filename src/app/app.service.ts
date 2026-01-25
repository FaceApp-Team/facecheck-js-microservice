import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppInstance } from '../main';

@Injectable()
export class SystemService {
  constructor(private readonly config: ConfigService) {}

  async shutDown(secretCode: string) {
    const configuredSecret = this.config.get<string>('app.secretCode');

    if (secretCode !== configuredSecret) {
      throw new UnauthorizedException('Access denied');
    }

    const app = getAppInstance();

    if (!app) {
      throw new Error('Application instance not found');
    }

    //check if app is already closing

    await app.close();
  }
}
