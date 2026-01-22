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
import { Priority, Role, User } from '../../generated/prisma/browser';
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
      this.logger.log(
        `Attempting to send email to ${to} with template: ${template}`,
      );

      const mail = await this.mailer.sendMail({
        to,
        subject,
        template,
        context,
        html,
      });

      this.logger.log(`Email sent successfully to ${to}`);
      this.logger.debug(
        'Mail response:',
        JSON.stringify(
          {
            accepted: mail.accepted,
            rejected: mail.rejected,
            messageId: mail.messageId,
            response: mail.response,
          },
          null,
          2,
        ),
      );

      await this.createSystemLog(
        `Sent email to ${to} with subject: ${subject} on ${new Date().toISOString()}`,
        Priority.LOW,
      );

      return mail;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error.message);
      this.logger.error('Error details:', error.stack);

      await this.createSystemLog(
        `Failed to send email to ${to}: ${error.message} at ${new Date().toISOString()}`,
        Priority.HIGH,
      );

      throw error;
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

    try {
      const response = await firstValueFrom(
        this.fetch.post(templateUrl, data, { headers }),
      );

      if (response.status !== 200) {
        this.logger.error(
          `SMS sending failed: ${JSON.stringify(response.data)}`,
        );
        await this.createSystemLog(
          `Failed to send SMS to ${recipients.join(
            ', ',
          )}: ${JSON.stringify(response.data)} on ${new Date().toISOString()}`,
          Priority.CRITICAL,
        );
        throw new InternalServerErrorException(
          response.data.message || 'Failed to send SMS. Try again later.',
        );
      }

      return response;
    } catch (error) {
      this.logger.error(`SMS sending error: ${error.message}`);
      await this.createSystemLog(
        `Error sending SMS to ${recipients.join(
          ', ',
        )}: ${error.message} on ${new Date().toISOString()}`,
        Priority.CRITICAL,
      );
      throw new InternalServerErrorException(
        `SMS sending failed: ${error.message}`,
      );
    }
  }

  async createUserLog(
    email: string,
    action: string,
    priority: Priority,
    ipAddress?: string,
  ) {
    await this.getUser(email);

    try {
      await this.prisma.user.update({
        where: {
          email,
        },
        data: {
          logs: {
            create: {
              action,
              ipAddress,
              priority: priority,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create user log: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to create user log: ${error.message}`,
      );
    }
  }

  async createSystemLog(
    action: string,
    priority: Priority,
    ipAddress?: string,
  ) {
    try {
      await this.prisma.systemLogs.create({
        data: {
          action,
          ipAddress,
          priority: priority,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create system log: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to create system log: ${error.message}`,
      );
    }
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
    try {
      const { data, error } = await supabase.storage
        .from(this.buckcetName)
        .upload(imagePath, buffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: mimetype,
        });

      if (error) {
        this.logger.error(`Image upload failed: ${error}`);
        await this.createSystemLog(
          `Image upload failed: ${error.message} on ${new Date().toISOString()}`,
          Priority.MEDIUM,
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
    } catch (error) {
      this.logger.error(`Image upload error: ${error.message}`);
      await this.createSystemLog(
        `Image upload error: ${error.message} on ${new Date().toISOString()}`,
        Priority.MEDIUM,
      );
      throw new InternalServerErrorException(
        `Image upload failed: ${error.message}`,
      );
    }
  }

  generateRandomCode(length: number) {
    const id = new ShortUniqueId({ dictionary: 'hex', length });
    return id.rnd();
  }

  async enrollFace(userId: string, imageUrl: string) {
    const faceEnrollEndpoint =
      this.config.get<string>('app.env') === 'production'
        ? `${this.config.get<string>('face.prodEnrollUrl')}?user_id=${userId}&image_url=${imageUrl}`
        : `${this.config.get<string>('face.enrollUrl')}?user_id=${userId}&image_url=${imageUrl}`;

    if (!faceEnrollEndpoint) {
      throw new InternalServerErrorException(
        'Face enroll endpoint is not configured',
      );
    }

    if (!userId || !imageUrl) {
      throw new BadRequestException('User ID and Image URL are required');
    }

    try {
      const response = await firstValueFrom(
        this.fetch.post(faceEnrollEndpoint, {
          userId,
          imageUrl,
        }),
      );

      if (response.status !== 200) {
        this.logger.error(
          `Face enrollment failed: ${JSON.stringify(response.data)}`,
        );
        throw new InternalServerErrorException(
          response.data.message || 'Face enrollment failed. Try again later.',
        );
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Face enrollment error: ${error.message}`);
      throw new InternalServerErrorException(
        `Face enrollment failed: ${error.message}`,
      );
    }
  }

  async recognizeFace(imageUrl: string) {
    const faceRecognizeEndpoint =
      this.config.get<string>('app.env') === 'production'
        ? `${this.config.get<string>('face.prodRecognizeUrl')}?image_url=${imageUrl}`
        : `${this.config.get<string>('face.recognizeUrl')}?image_url=${imageUrl}`;

    if (!faceRecognizeEndpoint) {
      throw new InternalServerErrorException(
        'Face recognition endpoint is not configured',
      );
    }

    if (!imageUrl) {
      throw new BadRequestException('Image URL is required');
    }

    try {
      const response = await firstValueFrom(
        this.fetch.post(faceRecognizeEndpoint, {
          imageUrl,
        }),
      );

      if (response.status !== 200) {
        this.logger.error(
          `Face recognition failed: ${JSON.stringify(response.data)}`,
        );
        throw new InternalServerErrorException(
          response.data.message || 'Face recognition failed. Try again later.',
        );
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Face recognition error: ${error.message}`);
      throw new InternalServerErrorException(
        `Face recognition failed: ${error.message}`,
      );
    }
  }

  enforceRightContentUpload(incoming: any, allowed: any) {
    const incomingKeys = Object.keys(incoming);
    // Get allowed keys from class prototype, not the class itself
    const allowedKeys = Object.getOwnPropertyNames(allowed.prototype);

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
