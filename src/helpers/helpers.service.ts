import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  PreconditionFailedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '../../generated/prisma/browser';
import { MailerService } from '@nestjs-modules/mailer';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { supabase } from '../supabase/supabase-client';
import ShortUniqueId from 'short-unique-id';

@Injectable()
export class HelpersService {
  logger = new Logger(HelpersService.name);
  buckcetName = 'face-check-media';
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
    try {
      const mail = await this.mailer.sendMail({
        to,
        subject,
        template,
        context,
        html,
      });
      await this.createSystemLog(
        `Sent email to ${to} with subject: ${subject} on ${new Date().toISOString()}`,
      );
      return mail;
    } catch (error) {
      this.logger.error(`Mail sending failed: ${error.message}`);
      await this.createSystemLog(
        `Failed to send email to ${to}: ${error.message} on ${new Date().toISOString()}`,
      );
      throw new InternalServerErrorException(
        'Failed to send email. Please try again later.',
      );
    }
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
      await this.createSystemLog(
        `Failed to send SMS to ${recipients.join(
          ', ',
        )}: ${JSON.stringify(response.data)} on ${new Date().toISOString()}`,
      );
      throw new InternalServerErrorException(
        response.data.message || 'Failed to send SMS. Try again later.',
      );
    }

    return response;
  }

  async createUserLog(email: string, action: string, ipAddress?: string) {
    await this.getUser(email);

    await this.prisma.user.update({
      where: {
        email,
      },
      data: {
        logs: {
          create: {
            action,
            ipAddress,
          },
        },
      },
    });
  }

  async createSystemLog(action: string, ipAddress?: string) {
    await this.prisma.systemLogs.create({
      data: {
        action,
        ipAddress,
      },
    });
  }

  async uploadImage(
    buffer: Buffer<ArrayBufferLike>,
    originalname: string,
    mimetype: string,
  ): Promise<{ imageUrl: string }> {
    //check if buffer is empty
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Invalid file upload');
    }

    const ext = originalname.split('.').pop();

    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

    if (!ext || !allowedExtensions.includes(ext.toLowerCase())) {
      throw new BadRequestException('Unsupported file type');
    }

    //file name
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

    const imagePath = `images/${filename}`;

    //upload to supabase storage
    const { data, error } = await supabase.storage
      .from(this.buckcetName)
      .upload(imagePath, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: mimetype,
      });

    if (error) {
      this.logger.error(`Image upload failed: ${error.message}`);
      await this.createSystemLog(
        `Image upload failed: ${error.message} on ${new Date().toISOString()}`,
      );
      throw new InternalServerErrorException(
        'Image upload failed. Please try again later.',
      );
    }

    //get public url
    const { data: publicData } = supabase.storage
      .from(this.buckcetName)
      .getPublicUrl(data.path);

    //check if public url is available
    if (!publicData || !publicData.publicUrl) {
      this.logger.error(`Failed to retrieve public URL for uploaded image.`);
      throw new InternalServerErrorException(
        'Failed to retrieve image URL. Please try again later.',
      );
    }

    return { imageUrl: publicData.publicUrl };
  }

  generateRandomCode(length: number) {
    const id = new ShortUniqueId({ dictionary: 'hex', length });
    return id.rnd();
  }

  async getFaceEmbedding() {}

  compareFaceEmbeddings() {
    return {
      userId: '',
      confidence: 0,
    };
  }

  async detectFace() {}

  async verifyLiveness() {}

  enforceRightContentUpload(
    incoming: Record<string, string>,
    allowed: Record<string, string>,
  ) {
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = Object.keys(allowed);

    const hasOnlyAllowedKeys = incomingKeys.every((key) =>
      allowedKeys.includes(key),
    );

    if (!hasOnlyAllowedKeys) {
      throw new BadRequestException('Upload contains invalid fields');
    }
  }

  checkFileSize(file: Express.Multer.File) {
    const maxSizeInBytes = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSizeInBytes) {
      throw new PayloadTooLargeException('File size exceeds the 10MB limit');
    }
  }

  checkMediaType(file: Express.Multer.File, allowedTypes: string[]) {
    if (!allowedTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Unsupported media type');
    }
  }
}
