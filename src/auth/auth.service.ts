import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  PreconditionFailedException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthDto } from '../dto/auth.dto';
import { HelpersService } from '../helpers/helpers.service';
import bcrypt from 'bcrypt';
import { Role } from '../../generated/prisma/enums';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  logger = new Logger(AuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly helpers: HelpersService,
  ) {}

  /*
    The register enpoint is for students only, so they can be able to register and 
    login, to be able to add and update their academic records. Staff and lecturers will be added by admin.
  */
  async registerUser(payload: AuthDto) {
    try {
      // validate inputs
      if (!payload.email || !payload.password) {
        throw new BadRequestException('Email and password are required');
      }

      // check if user exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });
      if (existingUser) throw new ConflictException('User already exists');

      // validate email
      this.helpers.enforceMailType(
        /^[a-z0-9A-Z]+@st\.comas\.edu\.gh$/,
        payload.email,
      );

      // hash password
      const hash = await bcrypt.hash(payload.password, 10);

      //send the email verification code
      await this.sendVerificationCode(payload.email);

      // create user (no transaction needed)
      const user = await this.prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name,
          password: hash,
          phone: payload.phone,
          role: Role.STUDENT,
        },
      });

      return { user };
    } catch (error) {
      //retry email sending when an error occurs
      if (error instanceof PreconditionFailedException) {
        await this.sendVerificationCode(payload.email);
      }
      this.logger.error('Error during user registration', error);
      throw error;
    }
  }

  async login(payload: Partial<AuthDto>) {
    try {
      if (!payload.email || !payload.password) {
        throw new BadRequestException('Email and password are required');
      }

      const user = await this.helpers.getUser(payload.email);

      //compare passwords
      const passwordMatch = await bcrypt.compare(
        payload.password,
        user.password ?? '',
      );
      if (!passwordMatch) {
        throw new UnauthorizedException('Invalid credentials');
      }

      //check login retries
      if ((user.loginRetries || 0) > 5) {
        //lock account for 1 hour
        const now = new Date();
        await this.prisma.user.update({
          where: { email: payload.email },
          data: {
            accountLockedUntil: new Date(now.getTime() + 60 * 60 * 1000),
          },
        });
        throw new ForbiddenException(
          'Maximum login attempts exceeded. Account will be locked for 1 hr.',
        );
      }

      const token = this.jwt.sign({ id: user.id, email: user.email });

      //reset login retries on successful login
      await this.prisma.user.update({
        where: { email: payload.email },
        data: {
          loginRetries: 0,
        },
      });

      return { token, role: user.role };
    } catch (error) {
      const loginRetries = await this.prisma.user.findUnique({
        where: { email: payload.email },
        select: { loginRetries: true },
      });

      if (error instanceof UnauthorizedException) {
        //increment login retries
        if (loginRetries) {
          await this.prisma.user.update({
            where: { email: payload.email },
            data: {
              loginRetries: (loginRetries.loginRetries || 0) + 1,
            },
          });
        }
      }

      this.logger.error('Error during login', error);
      throw error;
    }
  }

  private async sendVerificationCode(email: string) {
    const user = await this.helpers.getUser(email);

    //generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    //update user with email verification code and timestamp
    await this.prisma.user.update({
      where: { email },
      data: {
        emailVerificationCode: code,
        emailCodeCreatedAt: new Date(),
        emailVerificationRetries: 0,
      },
    });

    //get base URL from environment or use default
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/api/auth/verify-email?email=${encodeURIComponent(email)}&code=${code}`;

    //send email with verification link
    const mail = await this.helpers.sendMail({
      to: email,
      subject: 'Verify Your Email Address',
      template: 'email-verify',
      context: {
        userName: user.name,
        verificationLink,
        baseUrl,
      },
    });

    if (mail.rejected.length > 0) {
      throw new PreconditionFailedException(
        'Failed to send verification email',
      );
    }

    return { message: 'Verification code sent to email' };
  }

  async verifyEmail(email: string, code: string) {
    try {
      const user = await this.helpers.getUser(email);

      const emailToken = user.emailVerificationCode;

      //check if user is already verified
      if (!emailToken && user.isActive) {
        throw new BadRequestException('Email is already verified');
      }

      //check if email codes match
      if (emailToken !== code) {
        await this.sendVerificationCode(email);
        throw new UnauthorizedException('Invalid email verification code');
      }

      const date = new Date();
      const codeCreatedAt = user.emailCodeCreatedAt;

      const differenceInHours =
        Math.abs(date.getTime() - (codeCreatedAt?.getTime() || 0)) / 36e5;

      const retries = user.emailVerificationRetries || 0;
      //check if retries exceeded
      if (retries > 5) {
        //delete user data after max retries exceeded
        await this.prisma.user.delete({
          where: { email },
        });
        throw new BadRequestException(
          'Maximum email verification attempts exceeded. Data will be deleted',
        );
      }

      //check if code is expired (valid for 24 hours)
      if (differenceInHours > 24) {
        await this.sendVerificationCode(email);
        throw new BadRequestException('Email verification code has expired');
      }
      //update user to set email as verified
      await this.prisma.user.update({
        where: { email },
        data: {
          emailVerificationCode: null,
          isActive: true,
        },
      });
      return { message: 'Email verified successfully' };
    } catch (error) {
      const retries = await this.prisma.user.findUnique({
        where: { email },
        select: { emailVerificationRetries: true },
      });

      //send email verification code again if retries not exceeded
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        if (retries && (retries.emailVerificationRetries || 0) <= 5) {
          await this.sendVerificationCode(email);
        }
      }
      //increment retries
      await this.prisma.user.update({
        where: { email },
        data: {
          emailVerificationRetries:
            (retries?.emailVerificationRetries || 0) + 1,
        },
      });
      this.logger.error('Error verifying email', error);
      throw error;
    }
  }
}
