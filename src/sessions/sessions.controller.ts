import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsDto } from '../dto/sessions.dto';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('/create')
  @UseGuards(JwtAuthGuard)
  async createSession(
    @Body() payload: Partial<SessionsDto>,
    @Query('mail') mail: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email
      ? (req.user as any)?.email
      : encodeURIComponent(mail ?? '');
    const response = await this.sessions.createSession(payload, email);
    return response;
  }

  @Get('/close')
  @UseGuards(JwtAuthGuard)
  async closeSession(
    @Query('sessionId') sessionId: string,
    @Query('mail') mail: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email
      ? (req.user as any)?.email
      : encodeURIComponent(mail ?? '');
    const response = await this.sessions.closeSession(sessionId, email);
    return response;
  }

  @Post('admin/all-sessions')
  async getAllSessionsAdmin() {
    const response = await this.sessions.getAllSessionsAdmin();
    return response;
  }

  @Get('creator-sessions')
  @UseGuards(JwtAuthGuard)
  async getSessionsCreatorSessions(
    @Query('mail') mail: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email
      ? (req.user as any)?.email
      : encodeURIComponent(mail ?? '');
    const creatorId = email;
    const response = await this.sessions.getSessionCreatorSessions(creatorId);
    return response;
  }
}
