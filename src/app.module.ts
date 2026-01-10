import { HelpersModule } from './helpers/helpers.module';
import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { HelpersService } from './helpers/helpers.service';
import appConfig from './config/app.config';
import { JwtService } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 5,
        },
      ],
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          auth: {
            user: process.env.BREVO_USER,
            pass: process.env.BREVO_PASS,
          },
        },
      }),
      inject: [ConfigService],
    }),
    HttpModule,
    MailerModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('mailer.brevoServer'),
          port: config.get<number>('mailer.brevoPort'),
          auth: {
            pass: config.get<string>('mailer.brevoSmtpKey'),
            user: config.get<string>('mailer.brevoUser'),
          },
        },
        defaults: {
          from: '"College of Medicine and Allied Sciences" <info@comas.edu.gh>',
        },
        template: {
          dir: join(__dirname, '..', 'views'),
          adapter: new EjsAdapter(),
        },
      }),
      inject: [ConfigService],
    }),

    HelpersModule,
    AuthModule,
  ],
  controllers: [AuthController, AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerModule,
    },
    AuthService,
    AppService,
    PrismaService,
    HelpersService,
    JwtService,
  ],
})
export class AppModule {}
