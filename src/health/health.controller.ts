import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get('app-health')
  @HealthCheck()
  checkAppHealth() {
    const env = this.config.get<string>('app.env');

    const appUrl =
      env === 'production'
        ? this.config.get<string>('app.prodUrl')
        : this.config.get<string>('app.devUrl');

    if (!appUrl) {
      throw new Error('App URL is not configured');
    }

    return this.health.check([() => this.http.pingCheck('app', appUrl)]);
  }

  @Get('docs')
  @HealthCheck()
  checkDocs() {
    const env = this.config.get<string>('app.env');

    const appUrl =
      env === 'production'
        ? this.config.get<string>('app.prodUrl')
        : this.config.get<string>('app.devUrl');

    if (!appUrl) {
      throw new Error('App URL is not configured');
    }

    return this.health.check([
      () => this.http.pingCheck('facecheck-docs', `${appUrl}`),
    ]);
  }
}
