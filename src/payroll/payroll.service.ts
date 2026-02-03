import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { TransferRecipientDto } from '../dto/transfer-recipient.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { LecturerEarning } from '../types/lecturer.types';
// import { AttendanceStatus, Role } from '../../generated/prisma/enums';

@Injectable()
export class PayrollService {
  logger = new Logger(PayrollService.name);
  constructor(
    private readonly prisma: PrismaService,
    private helper: HelpersService,
    private readonly httpService: HttpService,
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

  // Backend: src/payroll/payroll.service.ts

  async getLecturerEarnings(): Promise<LecturerEarning[]> {
    // Get all lecturers with their user info
    const lecturers = await this.prisma.lecturer.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const result: LecturerEarning[] = [];

    for (const lecturer of lecturers) {
      // Get attendance records FOR the lecturer's user (where they attended sessions)
      const attendances = await this.prisma.attendance.findMany({
        where: {
          userId: lecturer.userId, // Lecturer's user ID for attendance
          checkOutTime: { not: null }, // Only completed attendances
        },
        select: {
          checkInTime: true,
          checkOutTime: true,
        },
      });

      // Calculate total hours from their attendance
      let totalHours = 0;
      for (const attendance of attendances) {
        if (attendance.checkInTime && attendance.checkOutTime) {
          const checkIn = new Date(attendance.checkInTime);
          const checkOut = new Date(attendance.checkOutTime);
          const hours =
            (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
          totalHours += hours;
        }
      }

      const hourlyRate = lecturer.hourlyRate ?? 0;
      const earnings = totalHours * hourlyRate;

      result.push({
        lecturerId: lecturer.id,
        name: lecturer.user.name,
        email: lecturer.user.email,
        staffNo: lecturer.staffNo, // Now correctly from Lecturer model
        hourlyRate,
        totalHours: Math.round(totalHours * 100) / 100,
        earnings: Math.round(earnings * 100) / 100,
      });
    }

    return result;
  }
}
