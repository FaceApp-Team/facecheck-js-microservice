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

  @Post('reset-password')
  @UseGuards(JwtAuthGuard)
  async resetPassword(
    @Req() req: Request,
    @Body()
    payload: {
      oldPassword: string;
      newPassword: string;
    },
  ) {
    const email = (req.user as any)?.email;
    const response = await this.auth.resetPassword(
      payload.newPassword,
      payload.oldPassword,
      email,
    );
    return response;
  }

  @Get('request-reset-code')
  @UseGuards(JwtAuthGuard)
  async requestResetCode(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.auth.requestResetCode(email);
    return response;
  }
}
