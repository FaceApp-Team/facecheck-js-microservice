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
import { UploadFile } from '../types/image.types';

@Injectable()
export class HelpersService {
  logger = new Logger(HelpersService.name);
  bucketName = 'face-check-media';
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
        profilePicture: true,
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
    } catch (error: any) {
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
        this.logger.error(response);
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      this.logger.error(`Failed to create system log: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to create system log: ${error.message}`,
      );
    }
  }

  async uploadImage(file: UploadFile): Promise<{ imageUrl: string }> {
    const { buffer, originalname, mimetype } = file;

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Invalid file upload');
    }

    const ext = originalname.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

    if (!ext || !allowedExtensions.includes(ext)) {
      throw new BadRequestException('Unsupported file type');
    }

    // Optional: basic mimetype check
    if (!mimetype.startsWith('image/')) {
      throw new BadRequestException('Invalid image mimetype');
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const imagePath = `images/${filename}`;

    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(imagePath, buffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: mimetype,
        });

      if (error) {
        this.logger.error(error.message, error);
        await this.createSystemLog(
          `Image upload failed: ${error.message}`,
          Priority.MEDIUM,
        );
        throw new InternalServerErrorException(
          'Image upload failed. Please try again later.',
        );
      }

      const { data: publicData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(data.path);

      if (!publicData?.publicUrl) {
        throw new InternalServerErrorException('Failed to retrieve image URL');
      }

      return { imageUrl: publicData.publicUrl };
    } catch (err: any) {
      this.logger.error(err.message, err);
      throw new InternalServerErrorException('Image upload failed');
    }
  }

  async uploadImages(files: UploadFile[]): Promise<string[]> {
    return Promise.all(
      files.map(async (file) => {
        const result = await this.uploadImage(file);
        return result.imageUrl;
      }),
    );
  }

  generateRandomCode(length: number) {
    const id = new ShortUniqueId({ dictionary: 'hex', length });
    return id.rnd();
  }

  async enrollFace(userId: string, imageUrls: string[]) {
    if (!userId || !imageUrls || imageUrls.length === 0) {
      throw new BadRequestException('User ID and Image URL are required');
    }

    // Build the endpoint URL and query params correctly
    const env = this.config.get<string>('app.env');
    const baseUrl =
      env === 'production'
        ? this.config.get<string>('face.prodEnrollUrl')
        : this.config.get<string>('face.enrollUrl');

    if (!baseUrl) {
      throw new InternalServerErrorException(
        'Face enroll endpoint is not configured',
      );
    }

    // imageUrls should be a comma-separated string in the query param

    const requestBody = { user_id: userId, image_urls: imageUrls };
    const faceEnrollEndpoint = `${baseUrl}`;

    try {
      const response = await firstValueFrom(
        this.fetch.post(faceEnrollEndpoint, requestBody),
      );

      if (response.status !== 200) {
        this.logger.error(
          `Face enrollment failed: ${JSON.stringify(response.data)}`,
        );
        throw new InternalServerErrorException(
          response.data?.message || 'Face enrollment failed. Try again later.',
        );
      }

      return response.data;
    } catch (error: any) {
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
    } catch (error: any) {
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

  async deleteFaceEmbeddings(userId: string) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const env = this.config.get<string>('app.env');
    const baseUrl =
      env === 'production'
        ? this.config.get<string>('face.prodDeletionUrl')
        : this.config.get<string>('face.devDeletionUrl');

    if (!baseUrl) {
      throw new InternalServerErrorException(
        'Face deletion endpoint is not configured',
      );
    }

    const deleteEndpoint = `${baseUrl}/${userId}`;

    try {
      const response = await firstValueFrom(this.fetch.delete(deleteEndpoint));

      if (response.status !== 200) {
        this.logger.error(
          `Face embeddings deletion failed: ${JSON.stringify(response.data)}`,
        );
        throw new InternalServerErrorException(
          response.data?.message ||
            'Face embeddings deletion failed. Try again later.',
        );
      }

      this.logger.log(`Face embeddings deleted for user ${userId}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Face embeddings deletion error: ${error.message}`);
      throw new InternalServerErrorException(
        `Face embeddings deletion failed: ${error.message}`,
      );
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

  async generateQRCode(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const apiNinjaBaseUrl = this.config.get<string>('apiNinjas.baseUrl');
    const apiNinjaApiKey = this.config.get<string>('apiNinjas.apiKey');

    if (!apiNinjaBaseUrl || !apiNinjaApiKey) {
      throw new InternalServerErrorException(
        'API Ninjas configuration is missing',
      );
    }
    const kioskModeUrl = this.config.get<string>('app.clientKioskUrl');

    if (!kioskModeUrl) {
      throw new InternalServerErrorException(
        'Kiosk mode URL is not configured',
      );
    }

    const response = await firstValueFrom(
      this.fetch.get(
        `${apiNinjaBaseUrl}/qrcode?data=${kioskModeUrl}/${sessionId}&format=png&bg_color=0000ff`,
        {
          headers: {
            'X-Api-Key': apiNinjaApiKey,
          },
        },
      ),
    );

    if (response.status !== 200) {
      this.logger.error(
        `QR code generation failed: ${JSON.stringify(response.data)}`,
      );
      throw new InternalServerErrorException(
        response.data?.message || 'QR code generation failed. Try again later.',
      );
    }

    return response.data;
  }
}
