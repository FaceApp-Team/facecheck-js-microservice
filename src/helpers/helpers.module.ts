import { MailerModule } from '@nestjs-modules/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from './helpers.service';
import { Module } from '@nestjs/common';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule,
    MailerModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        transport: `smtps://${config.get<string>('mailer.brevoUser')}:${config.get<string>('mailer.brevoSmtpKey')}@smtp-relay.brevo.com`,
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
  ],
  controllers: [],
  providers: [HelpersService, PrismaService, ConfigService],
})
export class HelpersModule {}
