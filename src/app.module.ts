import { AppController } from './app/app.controller';
import { HealthModule } from './health/health.module';
import { PayrollModule } from './payroll/payroll.module';
import { PayrollController } from './payroll/payroll.controller';
import { AttendanceModule } from './attendance/attendance.module';
import { AttendanceController } from './attendance/attendance.controller';
import { NotifcationsModule } from './notifications/notifcations.module';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationsController } from './notifications/notifications.controller';
import { SessionsModule } from './sessions/sessions.module';
import { SessionsController } from './sessions/sessions.controller';
import { CoursesModule } from './courses/courses.module';
import { CoursesService } from './courses/courses.service';
import { CoursesController } from './courses/courses.controller';
import { ProducersModule } from './producers/producers.module';
import { ConsumersModule } from './consumers/consumers.module';
import { UsersModule } from './users/users.module';
import { UsersController } from './users/users.controller';
import { HelpersModule } from './helpers/helpers.module';
import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { HelpersService } from './helpers/helpers.service';
import appConfig from './config/app.config';
import { JwtService } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'path';
import { HttpModule } from '@nestjs/axios';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users/users.service';
import { ImageProducer } from './producers/image.producer';
import { SessionsService } from './sessions/sessions.service';
import { AttendanceService } from './attendance/attendance.service';
import { PayrollService } from './payroll/payroll.service';
import { SystemService } from './app/app.service';
import { TerminusModule } from '@nestjs/terminus';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600000,
      isGlobal: true,
    }),
    HealthModule,
    TerminusModule,
    PayrollModule,
    AttendanceModule,
    NotifcationsModule,
    SessionsModule,
    CoursesModule,
    ProducersModule,
    ConsumersModule,
    UsersModule,
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 5,
        },
      ],
    }),
    HttpModule,
    MulterModule.register({
      storage: memoryStorage(),
    }),
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

    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          username: 'default',
          password: config.get<string>('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),

    BullModule.registerQueue({ name: 'image' }),
    HelpersModule,
    AuthModule,
  ],
  controllers: [
    AppController,
    PayrollController,
    AttendanceController,
    NotificationsController,
    SessionsController,
    CoursesController,
    UsersController,
    AuthController,
    AppController,
  ],
  providers: [
    NotificationsService,
    CoursesService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
    AuthService,
    PrismaService,
    HelpersService,
    JwtService,
    UsersService,
    SessionsService,
    ImageProducer,
    AttendanceService,
    PayrollService,
    SystemService,
  ],
})
export class AppModule {}
