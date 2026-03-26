import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsDto } from '../dto/sessions.dto';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { RolesGuard } from '../guards/roles.guard';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.LECTURER, Role.REP, Role.SYSTEM_ADMIN)
  async createSession(
    @Body() payload: Partial<SessionsDto>,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;

    const response = await this.sessions.createSession(payload, email);
    return response;
  }

  @Get('/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.LECTURER, Role.REP)
  async closeSession(
    @Query('sessionId') sessionId: string,

    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.sessions.closeSession(sessionId, email);
    return response;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SYSTEM_ADMIN,
    Role.STUDENT,
    Role.REP,
    Role.STAFF,
    Role.LECTURER,
  )
  @Get('admin/all-sessions')
  async getAllSessionsAdmin(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.sessions.getAllSessionsAdmin(email);
    return response;
  }

  @Get('creator-sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN, Role.LECTURER, Role.REP, Role.STAFF)
  async getSessionsCreatorSessions(@Req() req: Request) {
    const email = (req.user as any)?.email;

    const response = await this.sessions.getSessionCreatorSessions(email);
    return response;
  }

  @Get('lecturer-sessions')
  @UseGuards(JwtAuthGuard)
  async getLecturerSessions(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    const response = await this.sessions.getLecturerSessions(userId);
    return response;
  }

  @Patch('toggle-mode')
  @UseGuards(JwtAuthGuard)
  async toggleSessionMode(
    @Query('sessionId') sessionId: string,
    @Query('mail') mail: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email
      ? (req.user as any)?.email
      : (mail ?? '');
    const response = await this.sessions.toggleSessionMode(sessionId, email);
    return response;
  }

  @Get('/attend')
  async getSessionByLink(@Query('sessionId') sessionId: string) {
    const response = await this.sessions.getSessionByLink(sessionId);
    return response;
  }

  @Delete('/delete')
  @UseGuards(JwtAuthGuard)
  async deleteSession(
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.sessions.deleteSession(sessionId, email);
    return response;
  }

  @Patch('/update')
  @UseGuards(JwtAuthGuard)
  async updateSession(
    @Body() payload: Partial<SessionsDto>,
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const email = req.user ? (req.user as any)?.email : '';
    const response = await this.sessions.updateSession(
      sessionId,
      payload,
      email,
    );
    return response;
  }

  @Get('/approve')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  async approveSession(
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.sessions.approveSession(sessionId, email);
    return response;
  }

  @Get('/disprove')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.SYSTEM_ADMIN)
  async disproveSession(
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.sessions.disproveSession(sessionId, email);
    return response;
  }

  @Get('/generate-qrcode')
  async generateQRCode(@Query('sessionId') sessionId: string) {
    const response = await this.sessions.generateQrCode(sessionId);
    console.log(response);
    return response;
  }

  @Get('/session')
  async getSessionById(@Query('sessionId') sessionId: string) {
    const response = await this.sessions.getSessionById(sessionId);
    return response;
  }
}
