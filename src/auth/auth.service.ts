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
import { AccountStatus, Priority, Role } from '../../generated/prisma/enums';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import { User } from '../../generated/prisma/browser';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  logger = new Logger(AuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly helpers: HelpersService,
    private readonly config: ConfigService,
  ) {}

  /*
    The register enpoint is for students only, so they can be able to register and 
    login, to be able to add and update their academic records. Staff and lecturers will be added by admin.
  */
  async registerUser(
    payload: AuthDto,
  ): Promise<{ message: string; user: Partial<User> }> {
    // validate inputs
    if (!payload.email || !payload.password) {
      throw new BadRequestException('Email and password are required');
    }

    // check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (existingUser)
      throw new ConflictException('User with this email already exists');

    // validate email
    if (this.config.get<string>('app.env') === 'production') {
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

    if (payload.role && payload.role !== Role.STUDENT) {
      throw new ForbiddenException('Invalid role for self-registration');
    }

    // hash password
    const hash = await bcrypt.hash(payload.password, 10);

    //generate 6 digit code
    const code = this.helpers.generateRandomCode(6);

    // create user first (before sending email)
    const user = await this.prisma.user.create({
      data: {
        email: payload.email,
        name: payload.name,
        password: hash,
        phone: payload.phone,
        role: Role.STUDENT,
        emailVerificationCode: code,
        emailCodeCreatedAt: new Date(),
      },
    });

    //send the email verification code (after user is created)
    try {
      await this.sendVerificationCode(payload.email, payload.name, code);
    } catch (emailError) {
      // Rollback: delete the user if email sending fails
      await this.prisma.user.delete({
        where: { email: payload.email },
      });
      this.logger.error(emailError.message);
      await this.helpers.createSystemLog(
        `User registration failed for email: ${payload.email} due to email sending error at ${new Date().toISOString()}`,
        Priority.LOW,
      );
      throw new PreconditionFailedException(
        'Failed to send verification email. Please try again.',
      );
    }

    //create system log
    await this.helpers.createSystemLog(
      `New user registered with email: ${payload.email} at ${new Date().toISOString()}`,
      Priority.LOW,
    );

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

  async login(payload: Partial<User>): Promise<{
    token: string;
    role: Role;
    profilePicture?: string;
    isPasswordChanged: boolean;
    isActive: boolean;
    accountStatus: AccountStatus;
  }> {
    if (!payload.email || !payload.password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = await this.helpers.getUser(payload.email);

    if (user.email !== payload.email) {
      throw new UnauthorizedException('Invalid email provided');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Email not verified');
    }

    if (
      user.accountStatus === AccountStatus.SUSPENDED ||
      user.accountStatus === AccountStatus.INACTIVE
    ) {
      throw new ForbiddenException(
        `Account is ${user.accountStatus.toLowerCase()}`,
      );
    }

    //compare passwords
    if (!user.password) {
      throw new UnauthorizedException('No password set for this user');
    }

    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      throw new ForbiddenException('Account is temporarily locked');
    }

    if ((user.loginRetries || 0) >= 5) {
      //lock account for 1 hour
      const now = new Date();
      await this.prisma.user.update({
        where: { email: payload.email },
        data: {
          accountLockedUntil: new Date(now.getTime() + 60 * 60 * 1000),
        },
      });
      await this.helpers.createSystemLog(
        `User account locked due to excessive login attempts: ${payload.email} at ${new Date().toISOString()}`,
        Priority.LOW,
      );

      await this.helpers.createUserLog(
        payload.email,
        `Account locked for 1 hr due to excessive login attempts at ${new Date().toISOString()}`,
        Priority.LOW,
      );
      throw new ForbiddenException(
        'Maximum login attempts exceeded. Account will be locked for 1 hr.',
      );
    }

    const passwordMatch = await bcrypt.compare(payload.password, user.password);

    //check login retries
    if (!passwordMatch) {
      //increment login retries
      await this.prisma.user.update({
        where: { email: payload.email },
        data: {
          loginRetries: { increment: 1 },
        },
      });
      throw new UnauthorizedException('Incorrect password provided');
    }

    const token = this.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { secret: this.config.get<string>('jwt.secret') },
    );

    //reset login retries on successful login
    await this.prisma.user.update({
      where: { email: payload.email },
      data: {
        loginRetries: 0,
        lastLoginAt: new Date(),
      },
    });

    //create user log
    await this.helpers.createUserLog(
      user.email,
      `Account logged in at ${new Date().toISOString()}`,
      Priority.LOW,
    );

    //create system log
    await this.helpers.createSystemLog(
      `User logged in with email: ${user.email} at ${new Date().toISOString()}`,
      Priority.LOW,
    );

    return {
      token,
      role: user.role ?? Role.STUDENT,
      profilePicture: user.profilePicture ?? undefined,
      isPasswordChanged: user.isPasswordChanged || false,
      isActive: user.isActive || false,
      accountStatus: user.accountStatus || AccountStatus.INACTIVE,
    };
  }

  private async sendVerificationCode(
    email: string,
    name: string,
    code?: string,
  ) {
    //get base URL from environment or use default
    const baseUrl =
      this.config.get<string>('app.env') === 'production'
        ? this.config.get<string>('app.prodUrl') || 'http://localhost:4000'
        : this.config.get<string>('app.devUrl') || 'http://localhost:4000';
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

    // Log full email response for debugging
    this.logger.log(`Email sent to ${email}: ${code}`);
    this.logger.debug('Mail response:', JSON.stringify(mail, null, 2));

    if (mail.rejected && mail.rejected.length > 0) {
      this.logger.error(`Email rejected for ${email}:`, mail.rejected);
      throw new PreconditionFailedException(
        'Failed to send verification email',
      );
    }

    if (!mail.accepted || mail.accepted.length === 0) {
      this.logger.error(`Email not accepted for ${email}:`, mail);
      throw new PreconditionFailedException(
        'Email was not accepted by mail server',
      );
    }

    //create system log
    await this.helpers.createSystemLog(
      `Verification code sent to email: ${email} at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

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
      //return on exceeded retries
      return;
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

    //create user log
    await this.helpers.createUserLog(
      email,
      `Email verified at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    //create system log
    await this.helpers.createSystemLog(
      `Email verified for user: ${email} at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { message: 'Email verified successfully' };
  }

  async requestResetCode(email: string): Promise<{ message: string }> {
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
      `Hello! Requested password reset code for ${this.config.get<string>('app.name')} : ${code}. Ignore if you did not request.`,
    );
    //update user with password reset code and timestamp
    await this.prisma.user.update({
      where: { email },
      data: {
        passwordResetCode: code,
        resetCodeCreatedAt: new Date(),
      },
    });

    //create user log
    await this.helpers.createUserLog(
      email,
      `Password reset code sent to phone at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    //create system log
    await this.helpers.createSystemLog(
      `Password reset code sent to phone for user: ${email} at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { message: 'Password reset code sent to phone' };
  }

  async resetPassword(
    newPassword: string,
    oldPassword: string,
    email: string,
    resetCode?: string,
  ) {
    const user = await this.helpers.getUser(email);

    // reset code must exist
    if (
      (!user.passwordResetCode && user.isPasswordChanged) ||
      (!resetCode && user.isPasswordChanged)
    ) {
      throw new BadRequestException('Password reset code is required');
    }

    // check reset code expiry
    if (!user.resetCodeCreatedAt && user.isPasswordChanged) {
      throw new BadRequestException('Reset code metadata missing');
    }

    const hours = resetCode
      ? (Date.now() - user.resetCodeCreatedAt!.getTime()) / 3_600_000
      : 0;

    if (hours > 1) {
      throw new BadRequestException('Password reset code has expired');
    }

    // validate reset code
    if (resetCode !== user.passwordResetCode && user.isPasswordChanged) {
      throw new UnauthorizedException('Invalid password reset code');
    }

    // validate old password
    const passwordMatch = await bcrypt.compare(oldPassword, user.password!);

    if (!passwordMatch) {
      throw new UnauthorizedException('Old password is incorrect');
    }

    // hash new password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    // update password + clear reset state
    await this.prisma.user.update({
      where: { email },
      data: {
        password: hash,
        passwordResetCode: null,
        resetCodeCreatedAt: null,
        isPasswordChanged: true,
      },
    });

    // logs (non-blocking recommended)
    await this.helpers.createUserLog(
      email,
      `Password reset via code at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    await this.helpers.createSystemLog(
      `Password reset via code for user: ${email} at ${new Date().toISOString()}`,
      Priority.MEDIUM,
    );

    return { message: 'Password reset successful' };
  }
}
