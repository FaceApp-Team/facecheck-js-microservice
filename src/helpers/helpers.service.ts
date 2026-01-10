import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '../../generated/prisma/browser';
import { MailerService } from '@nestjs-modules/mailer';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

@Injectable()
export class HelpersService {
  logger = new Logger(HelpersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly fetch: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getUser(email: string): Promise<Partial<User>> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        phone: true,
        passwordResetCode: true,
        resetCodeCreatedAt: true,
        ipAddress: true,
        lastLoginAt: true,
        lastLoginIp: true,
        role: true,
        emailCodeCreatedAt: true,
        emailVerificationCode: true,
        phoneVerificationCode: true,
        accountStatus: true,
        loginRetries: true,
        accountLockedUntil: true,
        emailVerificationRetries: true,
        phoneVerificationRetries: true,
        phoneCodeCreatedAt: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User does not exist');
    }

    return user;
  }

  async checkRole(email: string, expectedRole: Role): Promise<true> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User does not exist');
    }

    if (user.role !== expectedRole) {
      throw new ForbiddenException('Access forbidden for this action');
    }

    return true;
  }

  enforceMailType(match: RegExp, email: string): true {
    let regex: RegExp;

    try {
      regex = new RegExp(match);
    } catch {
      throw new InternalServerErrorException('Invalid regex pattern');
    }

    if (!regex.test(email)) {
      throw new PreconditionFailedException('Email does not meet condition');
    }

    return true;
  }

  async sendMail(
    to: string,
    subject: string,
    template: string,
    context: any,
    html?: string,
  ) {
    const mail = await this.mailer.sendMail({
      to,
      subject,
      template,
      context,
      html,
    });
    return mail;
  }

  async sendSMS(
    recipients: string[],
    message: string,
  ): Promise<AxiosResponse<any>> {
    // Validate recipients
    if (!recipients || recipients.length === 0 || recipients.some((r) => !r)) {
      throw new BadRequestException('Invalid recipient(s) provided');
    }

    const apiKey = this.config.get<string>('arkesel.key');

    if (!apiKey) {
      throw new InternalServerErrorException(
        'Arkesel API key is not configured',
      );
    }

    this.logger.log(`Sending SMS to ${recipients.join(', ')}`);

    const data = {
      sender: 'CoMAS',
      message: message,
      recipients: recipients,
    };

    const templateUrl =
      this.config.get<string>('arkesel.url') ??
      'https://sms.arkesel.com/api/v2/sms/send';

    const headers = {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    };

    const response = await firstValueFrom(
      this.fetch.post(templateUrl, data, { headers }),
    );

    if (response.status !== 200) {
      this.logger.error(`SMS sending failed: ${JSON.stringify(response.data)}`);
      throw new InternalServerErrorException(
        response.data.message || 'Failed to send SMS',
      );
    }

    return response;
  }
}
