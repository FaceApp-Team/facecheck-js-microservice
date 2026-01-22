import {
  Controller,
  Delete,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('/user-notifications')
  @UseGuards(JwtAuthGuard)
  async getUserNotifications(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.notifications.getUserNotifications(email);
    return response;
  }

  @Delete('user')
  @UseGuards(JwtAuthGuard)
  async deleteUserNotification(
    @Query('notificationId') notificationId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.notifications.deleteUserNotification(
      notificationId,
      email,
    );
    return response;
  }

  @Patch('mark-as-read')
  @UseGuards(JwtAuthGuard)
  async markNotificationAsRead(
    @Query('notificationId') notificationId: string,
    @Req() req: Request,
  ) {
    const email = (req.user as any)?.email;
    const response = await this.notifications.markNotificationAsRead(
      notificationId,
      email,
    );
    return response;
  }

  @Patch('mark-all-as-read')
  @UseGuards(JwtAuthGuard)
  async markAllNotificationsAsRead(@Req() req: Request) {
    const email = (req.user as any)?.email;
    const response = await this.notifications.markAllNotificationsAsRead(email);
    return response;
  }

  @Get('/system-notifications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.ADMIN)
  async getAllSystemNotifications(@Req() req: Request) {
    const mail = (req.user as any)?.email;
    const response = await this.notifications.getAllSystemNotifications(mail);
    return response;
  }
}
