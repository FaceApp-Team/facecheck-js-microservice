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
    } catch (error: any) {
      this.logger.error('Error creating transfer recipient', error);
      throw error.message;
    }
  }

  // Backend: src/payroll/payroll.service.ts

  private readonly TAX_RATE = 0.1; // 10% tax deduction

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
      const grossEarnings = totalHours * hourlyRate;
      const taxDeduction = grossEarnings * this.TAX_RATE;
      const netEarnings = grossEarnings - taxDeduction;

      result.push({
        lecturerId: lecturer.id,
        name: lecturer.user.name,
        email: lecturer.user.email,
        staffNo: lecturer.staffNo, // Now correctly from Lecturer model
        hourlyRate,
        totalHours: Math.round(totalHours * 100) / 100,
        grossEarnings: Math.round(grossEarnings * 100) / 100,
        taxDeduction: Math.round(taxDeduction * 100) / 100,
        taxRate: this.TAX_RATE,
        earnings: Math.round(netEarnings * 100) / 100, // Net earnings after tax
      });
    }

    return result;
  }

  /**
   * Get individual lecturer's payroll record
   */
  async getLecturerPayroll(
    lecturerId: string,
  ): Promise<LecturerEarning | null> {
    const lecturer = await this.prisma.lecturer.findUnique({
      where: { id: lecturerId },
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

    if (!lecturer) {
      return null;
    }

    // Get attendance records FOR the lecturer's user
    const attendances = await this.prisma.attendance.findMany({
      where: {
        userId: lecturer.userId,
        checkOutTime: { not: null },
      },
      select: {
        id: true,
        checkInTime: true,
        checkOutTime: true,
        session: {
          select: {
            id: true,
            name: true,
            courseId: true,
            moduleId: true,
          },
        },
      },
    });

    // Calculate total hours from their attendance
    let totalHours = 0;
    const sessions: {
      sessionId: string;
      sessionName: string;
      hours: number;
    }[] = [];

    for (const attendance of attendances) {
      if (attendance.checkInTime && attendance.checkOutTime) {
        const checkIn = new Date(attendance.checkInTime);
        const checkOut = new Date(attendance.checkOutTime);
        const hours =
          (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        totalHours += hours;

        sessions.push({
          sessionId: attendance.session.id,
          sessionName: attendance.session.name,
          hours: Math.round(hours * 100) / 100,
        });
      }
    }

    const hourlyRate = lecturer.hourlyRate ?? 0;
    const grossEarnings = totalHours * hourlyRate;
    const taxDeduction = grossEarnings * this.TAX_RATE;
    const netEarnings = grossEarnings - taxDeduction;

    return {
      lecturerId: lecturer.id,
      name: lecturer.user.name,
      email: lecturer.user.email,
      staffNo: lecturer.staffNo,
      hourlyRate,
      totalHours: Math.round(totalHours * 100) / 100,
      grossEarnings: Math.round(grossEarnings * 100) / 100,
      taxDeduction: Math.round(taxDeduction * 100) / 100,
      taxRate: this.TAX_RATE,
      earnings: Math.round(netEarnings * 100) / 100,
      sessions,
    };
  }

  /**
   * Get payroll for a lecturer by their email
   */
  async getLecturerPayrollByEmail(
    email: string,
  ): Promise<LecturerEarning | null> {
    const user = await this.helper.getUser(email);

    const lecturer = await this.prisma.lecturer.findUnique({
      where: { userId: user.id },
    });

    if (!lecturer) {
      throw new BadRequestException('User is not a lecturer');
    }

    return this.getLecturerPayroll(lecturer.id);
  }
}
