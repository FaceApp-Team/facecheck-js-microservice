import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { TransferRecipientDto } from '../dto/transfer-recipient.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { AttendanceStatus, Priority, Role } from '../../generated/prisma/enums';
import { Cache } from '@nestjs/cache-manager';

@Injectable()
export class PayrollService {
  logger = new Logger(PayrollService.name);
  constructor(
    private readonly prisma: PrismaService,
    private helper: HelpersService,
    private readonly httpService: HttpService,
    @Inject('CACHE_MANAGER') private readonly cacheManager: Cache,
  ) {}

  async createTransferRecipient(
    payload: TransferRecipientDto,
  ): Promise<AxiosResponse<any>> {
    if (!payload.accountNumber || !payload.accountName || !payload.bankCode) {
      throw new BadRequestException(
        'Account number, account name, and bank code are required',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.paystack.co/transferrecipient',
          {
            type: 'mobile_money',
            name: payload.accountName,
            account_number: payload.accountNumber,
            bank_code: payload.bankCode,
            currency: 'GHS',
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response;
    } catch (error) {
      this.logger.error('Error creating transfer recipient', error);
      throw error.message;
    }
  }

  async getLecturersEarnings(email: string) {
    const user = await this.helper.getUser(email);

    if (user.role !== Role.ADMIN && user.role !== Role.SYSTEM_ADMIN) {
      throw new UnauthorizedException('Access denied. Admins only.');
    }

    const cacheKey = 'payroll:lecturers:earnings';

    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        this.logger.log('Cache hit: lecturer earnings');
        await this.helper.createSystemLog(
          `Lecturer earnings viewed by ${user.name} on ${new Date().toISOString()}`,
          Priority.CRITICAL,
        );
        return cached;
      }
    } catch (error) {
      this.logger.warn(
        'Cache read failed for lecturer earnings',
        error.message,
      );
    }

    const lecturers = await this.prisma.lecturer.findMany({
      include: {
        user: {
          select: { id: true, email: true, name: true },
          include: {
            attendances: {
              where: {
                status: AttendanceStatus.PRESENT,
                checkInTime: { not: null },
                checkOutTime: { not: null },
                session: {
                  lecturerId: { not: null },
                },
              },
              include: {
                session: true,
              },
            },
          },
        },
      },
    });

    const result = lecturers.map((lecturer) => {
      let totalHours = 0;

      for (const att of lecturer.user.attendances) {
        if (att.session.lecturerId !== lecturer.id) continue;

        const hours =
          (att.checkOutTime!.getTime() - att.checkInTime!.getTime()) /
          (1000 * 60 * 60);

        totalHours += hours;
      }
      const earnings = totalHours * lecturer.hourlyRate;

      return {
        lecturerId: lecturer.id,
        name: lecturer.user.name,
        email: lecturer.user.email,
        staffNo: lecturer.staffNo,
        hourlyRate: lecturer.hourlyRate,
        totalHours: Number(totalHours.toFixed(2)),
        earnings: Number(earnings.toFixed(2)),
      };
    });

    return { result };
  }
}
