import {
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

@Injectable()
export class HelpersService {
  logger = new Logger(HelpersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async getUser(email: string): Promise<Partial<User>> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
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

  async sendMail({
    to,
    subject,
    template,
    context,
    html,
  }: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, any>;
    html?: string;
  }) {
    const mail = await this.mailer.sendMail({
      to,
      subject,
      template,
      context,
      html: html,
    });
    return mail;
  }

  async sendSMS() {}
}
