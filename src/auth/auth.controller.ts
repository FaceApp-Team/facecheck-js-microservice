import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthDto } from '../dto/auth.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() payload: AuthDto) {
    const response = await this.auth.registerUser(payload);
    return response;
  }

  @Post('login')
  async login(@Body() payload: Partial<AuthDto>) {
    const response = await this.auth.login(payload);
    return response;
  }

  @Get('verify-email')
  async verifyEmail(
    @Query('code') code: string,
    @Query('email') email: string,
  ) {
    const response = await this.auth.verifyEmail(email, code);
    return response;
  }

  /**
   * Change password (logged-in user)
   * No reset token needed — user is already authenticated via JWT.
   * First-time password change (isPasswordChanged = false) does not require old password.
   */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Body()
    payload: {
      oldPassword?: string;
      newPassword: string;
    },
  ) {
    const email = (req.user as any)?.email;
    return this.auth.changePassword(
      email,
      payload.newPassword,
      payload.oldPassword,
    );
  }

  /**
   * Forgot password (not logged in)
   * Sends a 6-digit reset token to the user's phone via SMS.
   */
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.auth.forgotPassword(email);
  }

  /**
   * Reset password with token (not logged in)
   * Verifies the reset token sent via SMS and sets the new password.
   */
  @Post('reset-password-with-token')
  async resetPasswordWithToken(
    @Body() body: { email: string; token: string; newPassword: string },
  ) {
    return this.auth.resetPasswordWithToken(
      body.email,
      body.token,
      body.newPassword,
    );
  }
}
