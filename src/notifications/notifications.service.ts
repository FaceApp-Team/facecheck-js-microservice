import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { NotificationStatus, Role } from '../../generated/prisma/enums';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
  ) {}

  /**
   * Get notifications for the authenticated user
   */
  async getUserNotifications(email: string) {
    const user = await this.helpers.getUser(email);

    const notifications = await this.prisma.logs.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      data: notifications,
    };
  }

  /**
   * Delete a single notification belonging to the user
   */
  async deleteUserNotification(notificationId: string, email: string) {
    if (!notificationId) {
      throw new BadRequestException('Notification ID is required');
    }

    const user = await this.helpers.getUser(email);

    const notification = await this.prisma.logs.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to delete this notification',
      );
    }

    await this.prisma.logs.delete({
      where: { id: notificationId },
    });

    return {
      success: true,
      message: 'Notification deleted successfully',
    };
  }

  /**
   * Mark a single notification as READ
   */
  async markNotificationAsRead(notificationId: string, email: string) {
    if (!notificationId) {
      throw new BadRequestException('Notification ID is required');
    }

    const user = await this.helpers.getUser(email);

    const notification = await this.prisma.logs.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to update this notification',
      );
    }

    if (notification.status === NotificationStatus.READ) {
      return {
        success: true,
        message: 'Notification already marked as read',
      };
    }

    const updated = await this.prisma.logs.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.READ,
      },
    });

    return {
      success: true,
      data: updated,
    };
  }

  /**
   * Mark ALL user notifications as READ
   */
  async markAllNotificationsAsRead(email: string) {
    const user = await this.helpers.getUser(email);

    await this.prisma.logs.updateMany({
      where: {
        userId: user.id,
        status: NotificationStatus.UNREAD,
      },
      data: {
        status: NotificationStatus.READ,
      },
    });

    return {
      success: true,
      message: 'All notifications marked as read',
    };
  }

  /**
   * Get system-wide notifications (admins only)
   */
  async getAllSystemNotifications(email: string) {
    const user = await this.helpers.getUser(email);

    if (user.role !== Role.ADMIN && user.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only admins can view system notifications');
    }

    const systemLogs = await this.prisma.systemLogs.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      data: systemLogs,
    };
  }
}
