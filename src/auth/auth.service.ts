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
import * as bcrypt from 'bcrypt';
import { Role } from '../../generated/prisma/enums';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';

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
    if (process.env.NODE_ENV === 'production') {
      this.helpers.enforceMailType(
        /^[a-z0-9A-Z]+@st\.comas\.edu\.gh$/,
        payload.email,
      );
    } else {
      this.helpers.enforceMailType(
        /^[a-z0-9A-Z]+@comas\.edu\.gh$/,
        payload.email,
      );
    }

    // hash password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(payload.password, salt);

    //generate 6 digit code
    const code = randomInt(100000, 1_000_000).toString();

    //send the email verification code
    await this.sendVerificationCode(payload.email, payload.name, code);

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

    //update user with email verification code and timestamp
    await this.prisma.user.update({
      where: { email: payload.email },
      data: {
        emailVerificationCode: code,
        emailCodeCreatedAt: new Date(),
      },
    });

    return {
      message: 'User registered successfully. Please verify your email.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async login(payload: Partial<AuthDto>) {
    if (!payload.email || !payload.password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = await this.helpers.getUser(payload.email);

    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      throw new ForbiddenException('Account is temporarily locked');
    }

    if ((user.loginRetries || 0) >= 3) {
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

    //compare passwords
    if (!user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(payload.password, user.password);

    console.log(payload.password, user.password, passwordMatch);

    //check login retries
    if (!passwordMatch) {
      //increment login retries
      await this.prisma.user.update({
        where: { email: payload.email },
        data: {
          loginRetries: { increment: 1 },
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwt.sign(
      { id: user.id, email: user.email },
      { secret: process.env.JWT_SECRET },
    );

    //reset login retries on successful login
    await this.prisma.user.update({
      where: { email: payload.email },
      data: {
        loginRetries: 0,
      },
    });

    return { token, role: user.role };
  }

  private async sendVerificationCode(
    email: string,
    name: string,
    code?: string,
  ) {
    //get base URL from environment or use default
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.APP_PROD_URL || 'http://localhost:3000'
        : process.env.APP_DEV_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/api/auth/verify-email?email=${encodeURIComponent(email)}&code=${code}`;

    //send email with verification link
    const mail = await this.helpers.sendMail(
      email,
      'Verify Your Email Address',
      'email-verify',
      {
        name,
        verificationCode: code,
        verificationLink,
        baseUrl,
      },
    );

    if (mail.rejected.length > 0) {
      throw new PreconditionFailedException(
        'Failed to send verification email',
      );
    }

    return { message: 'Verification code sent to email' };
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.helpers.getUser(email);

    const emailToken = user.emailVerificationCode;

    if (user.isActive) {
      //check if user is already verified
      throw new ConflictException('Email already verified');
    }

    if (!emailToken) {
      throw new BadRequestException(
        'No verification code found for this email',
      );
    }

    const retries = user.emailVerificationRetries || 0;

    //check if retries exceeded
    if (retries >= 3) {
      //delete user data after max retries exceeded
      await this.prisma.user.delete({
        where: { email },
      });
      throw new ForbiddenException(
        'Maximum email verification attempts exceeded. Data will be deleted',
      );
    }

    //check if email codes match
    if (emailToken !== code) {
      await this.prisma.user.update({
        where: { email },
        data: { emailVerificationRetries: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid email verification code');
    }

    if (!user.emailCodeCreatedAt) {
      throw new BadRequestException('Verification code missing');
    }

    const hours = (Date.now() - user.emailCodeCreatedAt.getTime()) / 3_600_000;

    if (hours > 24) {
      //resend verification code
      const code = randomInt(100000, 1_000_000).toString();
      await this.prisma.user.update({
        where: { email },
        data: {
          emailVerificationCode: code,
          emailCodeCreatedAt: new Date(),
          emailVerificationRetries: {
            increment: 1,
          },
        },
      });
      await this.sendVerificationCode(email, user.name ?? 'User', code);
      throw new BadRequestException('Verification code expired');
    }

    //update user to set email as verified
    await this.prisma.user.update({
      where: { email },
      data: {
        emailVerificationCode: null,
        emailVerificationRetries: 0,
        emailCodeCreatedAt: null,
        isActive: true,
      },
    });
    return { message: 'Email verified successfully' };
  }

  async requestResetCode(email: string) {
    const user = await this.helpers.getUser(email);

    if (!user.phone) {
      throw new BadRequestException('Phone number not found for this user');
    }

    //generate 6 digit code
    const code = randomInt(100000, 1_000_000).toString();
    const recipients = Array.from([user.phone]);

    //send the password reset code
    await this.helpers.sendSMS(
      recipients,
      `Hello! Requested password reset code: ${code}. Ignore if you did not request.`,
    );
    //update user with password reset code and timestamp
    await this.prisma.user.update({
      where: { email },
      data: {
        passwordResetCode: code,
        resetCodeCreatedAt: new Date(),
      },
    });

    return { message: 'Password reset code sent to phone' };
  }

  async resetPassword(
    newPassword: string,
    oldPassword: string,
    email: string,
    resetCode?: string,
  ) {
    //compare old password
    const user = await this.helpers.getUser(email);

    const passwordMatch = await bcrypt.compare(oldPassword, user.password!);

    const passwordResetCode = user.passwordResetCode;

    if (passwordResetCode && resetCode) {
      const hours =
        (Date.now() - (user.resetCodeCreatedAt?.getTime() || 0)) / 3_600_000;

      if (hours > 1) {
        throw new BadRequestException('Password reset code has expired');
      }

      if (resetCode !== passwordResetCode) {
        throw new UnauthorizedException('Invalid password reset code');
      }

      if (!passwordMatch) {
        throw new UnauthorizedException('Old password is incorrect');
      }

      //hash new password
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(newPassword, salt);

      //update user password
      await this.prisma.user.update({
        where: {
          email: email,
        },
        data: {
          password: hash,
        },
      });
      console.log('Yeahhhhhhhhhhhhhhhhhhhh');

      return { message: 'Password reset successfully' };
    }
  }
}
