import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpersService } from '../helpers/helpers.service';
import { TransferRecipientDto } from '../dto/transfer-recipient.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { LecturerEarning } from '../types/lecturer.types';

@Injectable()
export class PayrollService {
  logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private helper: HelpersService,
    private readonly httpService: HttpService,
  ) {}

  private readonly TAX_RATE = 0.1; // 10% tax deduction

  private toHours(milliseconds: number): number {
    return milliseconds / (1000 * 60 * 60);
  }

  private roundHours(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private getAttendanceHourBreakdown(attendance: {
    checkInTime: Date | null;
    checkOutTime: Date | null;
    session?: { startTime: Date; endTime: Date } | null;
  }): {
    totalWorkedHours: number;
    regularHours: number;
    overtimeHours: number;
  } {
    if (!attendance.checkInTime || !attendance.checkOutTime) {
      return {
        totalWorkedHours: 0,
        regularHours: 0,
        overtimeHours: 0,
      };
    }

    const actualStart = new Date(attendance.checkInTime).getTime();
    const actualEnd = new Date(attendance.checkOutTime).getTime();

    if (actualEnd <= actualStart) {
      return {
        totalWorkedHours: 0,
        regularHours: 0,
        overtimeHours: 0,
      };
    }

    const actualMillis = actualEnd - actualStart;
    const totalWorkedHours = this.toHours(actualMillis);

    if (!attendance.session) {
      return {
        totalWorkedHours,
        regularHours: totalWorkedHours,
        overtimeHours: 0,
      };
    }

    const sessionStart = new Date(attendance.session.startTime).getTime();
    const sessionEnd = new Date(attendance.session.endTime).getTime();
    const overlapStart = Math.max(actualStart, sessionStart);
    const overlapEnd = Math.min(actualEnd, sessionEnd);
    const overlapMillis = Math.max(0, overlapEnd - overlapStart);
    const regularHours = this.toHours(overlapMillis);
    const overtimeHours = Math.max(0, totalWorkedHours - regularHours);

    return {
      totalWorkedHours,
      regularHours,
      overtimeHours,
    };
  }

  private getEarningsBreakdown(
    regularHours: number,
    overtimeHours: number,
    hourlyRate: number,
  ): {
    overtimeRate: number;
    regularEarnings: number;
    overtimeEarnings: number;
    grossEarnings: number;
    taxDeduction: number;
    netEarnings: number;
  } {
    // Overtime is tracked separately but paid at the same base hourly rate.
    const overtimeRate = hourlyRate;
    const regularEarnings = regularHours * hourlyRate;
    const overtimeEarnings = overtimeHours * overtimeRate;
    const grossEarnings = regularEarnings + overtimeEarnings;
    const taxDeduction = grossEarnings * this.TAX_RATE;
    const netEarnings = grossEarnings - taxDeduction;

    return {
      overtimeRate,
      regularEarnings,
      overtimeEarnings,
      grossEarnings,
      taxDeduction,
      netEarnings,
    };
  }

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

  async getLecturerEarnings(): Promise<LecturerEarning[]> {
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
      const attendances = await this.prisma.attendance.findMany({
        where: {
          userId: lecturer.userId,
          checkOutTime: { not: null },
        },
        select: {
          checkInTime: true,
          checkOutTime: true,
          session: {
            select: {
              startTime: true,
              endTime: true,
            },
          },
        },
      });

      let totalHours = 0;
      let regularHours = 0;
      let overtimeHours = 0;

      for (const attendance of attendances) {
        const breakdown = this.getAttendanceHourBreakdown(attendance);
        totalHours += breakdown.totalWorkedHours;
        regularHours += breakdown.regularHours;
        overtimeHours += breakdown.overtimeHours;
      }

      const hourlyRate = lecturer.hourlyRate ?? 0;
      const earningsBreakdown = this.getEarningsBreakdown(
        regularHours,
        overtimeHours,
        hourlyRate,
      );

      result.push({
        lecturerId: lecturer.id,
        name: lecturer.user.name,
        email: lecturer.user.email,
        staffNo: lecturer.staffNo,
        hourlyRate,
        totalHours: this.roundHours(totalHours),
        regularHours: this.roundHours(regularHours),
        overtimeHours: this.roundHours(overtimeHours),
        overtimeRate: this.roundHours(earningsBreakdown.overtimeRate),
        regularEarnings: this.roundHours(earningsBreakdown.regularEarnings),
        overtimeEarnings: this.roundHours(earningsBreakdown.overtimeEarnings),
        grossEarnings: this.roundHours(earningsBreakdown.grossEarnings),
        taxDeduction: this.roundHours(earningsBreakdown.taxDeduction),
        taxRate: this.TAX_RATE,
        earnings: this.roundHours(earningsBreakdown.netEarnings),
      });
    }

    return result;
  }

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
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;

    const sessions: {
      sessionId: string;
      sessionName: string;
      hours: number;
      regularHours: number;
      overtimeHours: number;
      date?: Date;
    }[] = [];

    for (const attendance of attendances) {
      if (attendance.checkInTime && attendance.checkOutTime) {
        const breakdown = this.getAttendanceHourBreakdown(attendance);
        totalHours += breakdown.totalWorkedHours;
        regularHours += breakdown.regularHours;
        overtimeHours += breakdown.overtimeHours;

        sessions.push({
          sessionId: attendance.session.id,
          sessionName: attendance.session.name,
          hours: this.roundHours(breakdown.totalWorkedHours),
          regularHours: this.roundHours(breakdown.regularHours),
          overtimeHours: this.roundHours(breakdown.overtimeHours),
        });
      }
    }

    const hourlyRate = lecturer.hourlyRate ?? 0;
    const earningsBreakdown = this.getEarningsBreakdown(
      regularHours,
      overtimeHours,
      hourlyRate,
    );

    return {
      lecturerId: lecturer.id,
      name: lecturer.user.name,
      email: lecturer.user.email,
      staffNo: lecturer.staffNo,
      hourlyRate,
      totalHours: this.roundHours(totalHours),
      regularHours: this.roundHours(regularHours),
      overtimeHours: this.roundHours(overtimeHours),
      overtimeRate: this.roundHours(earningsBreakdown.overtimeRate),
      regularEarnings: this.roundHours(earningsBreakdown.regularEarnings),
      overtimeEarnings: this.roundHours(earningsBreakdown.overtimeEarnings),
      grossEarnings: this.roundHours(earningsBreakdown.grossEarnings),
      taxDeduction: this.roundHours(earningsBreakdown.taxDeduction),
      taxRate: this.TAX_RATE,
      earnings: this.roundHours(earningsBreakdown.netEarnings),
      sessions,
    };
  }

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

  private getPeriodDates(
    year: number,
    month: number,
  ): { start: Date; end: Date } {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }

  async getLecturerEarningsByPeriod(
    year: number,
    month: number,
  ): Promise<{
    period: { year: number; month: number; startDate: Date; endDate: Date };
    earnings: LecturerEarning[];
  }> {
    const { start, end } = this.getPeriodDates(year, month);

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

    const earnings: LecturerEarning[] = [];

    for (const lecturer of lecturers) {
      const attendances = await this.prisma.attendance.findMany({
        where: {
          userId: lecturer.userId,
          checkOutTime: { gte: start, lte: end },
          checkInTime: { not: null },
        },
        select: {
          checkInTime: true,
          checkOutTime: true,
          session: {
            select: {
              startTime: true,
              endTime: true,
            },
          },
        },
      });

      let totalHours = 0;
      let regularHours = 0;
      let overtimeHours = 0;

      for (const attendance of attendances) {
        const breakdown = this.getAttendanceHourBreakdown(attendance);
        totalHours += breakdown.totalWorkedHours;
        regularHours += breakdown.regularHours;
        overtimeHours += breakdown.overtimeHours;
      }

      const hourlyRate = lecturer.hourlyRate ?? 0;
      const earningsBreakdown = this.getEarningsBreakdown(
        regularHours,
        overtimeHours,
        hourlyRate,
      );

      earnings.push({
        lecturerId: lecturer.id,
        name: lecturer.user.name,
        email: lecturer.user.email,
        staffNo: lecturer.staffNo,
        hourlyRate,
        totalHours: this.roundHours(totalHours),
        regularHours: this.roundHours(regularHours),
        overtimeHours: this.roundHours(overtimeHours),
        overtimeRate: this.roundHours(earningsBreakdown.overtimeRate),
        regularEarnings: this.roundHours(earningsBreakdown.regularEarnings),
        overtimeEarnings: this.roundHours(earningsBreakdown.overtimeEarnings),
        grossEarnings: this.roundHours(earningsBreakdown.grossEarnings),
        taxDeduction: this.roundHours(earningsBreakdown.taxDeduction),
        taxRate: this.TAX_RATE,
        earnings: this.roundHours(earningsBreakdown.netEarnings),
      });
    }

    return {
      period: {
        year,
        month,
        startDate: start,
        endDate: end,
      },
      earnings,
    };
  }

  async getLecturerPayrollByPeriod(
    lecturerId: string,
    year: number,
    month: number,
  ): Promise<{
    period: { year: number; month: number; startDate: Date; endDate: Date };
    payroll: LecturerEarning;
  } | null> {
    const { start, end } = this.getPeriodDates(year, month);

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

    const attendances = await this.prisma.attendance.findMany({
      where: {
        userId: lecturer.userId,
        checkOutTime: { not: null },
        checkInTime: {
          gte: start,
          lte: end,
        },
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
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;

    const sessions: {
      sessionId: string;
      sessionName: string;
      hours: number;
      regularHours: number;
      overtimeHours: number;
      date: Date;
    }[] = [];

    for (const attendance of attendances) {
      if (attendance.checkInTime && attendance.checkOutTime) {
        const breakdown = this.getAttendanceHourBreakdown(attendance);
        totalHours += breakdown.totalWorkedHours;
        regularHours += breakdown.regularHours;
        overtimeHours += breakdown.overtimeHours;

        sessions.push({
          sessionId: attendance.session.id,
          sessionName: attendance.session.name,
          hours: this.roundHours(breakdown.totalWorkedHours),
          regularHours: this.roundHours(breakdown.regularHours),
          overtimeHours: this.roundHours(breakdown.overtimeHours),
          date: new Date(attendance.checkInTime),
        });
      }
    }

    const hourlyRate = lecturer.hourlyRate ?? 0;
    const earningsBreakdown = this.getEarningsBreakdown(
      regularHours,
      overtimeHours,
      hourlyRate,
    );

    return {
      period: {
        year,
        month,
        startDate: start,
        endDate: end,
      },
      payroll: {
        lecturerId: lecturer.id,
        name: lecturer.user.name,
        email: lecturer.user.email,
        staffNo: lecturer.staffNo,
        hourlyRate,
        totalHours: this.roundHours(totalHours),
        regularHours: this.roundHours(regularHours),
        overtimeHours: this.roundHours(overtimeHours),
        overtimeRate: this.roundHours(earningsBreakdown.overtimeRate),
        regularEarnings: this.roundHours(earningsBreakdown.regularEarnings),
        overtimeEarnings: this.roundHours(earningsBreakdown.overtimeEarnings),
        grossEarnings: this.roundHours(earningsBreakdown.grossEarnings),
        taxDeduction: this.roundHours(earningsBreakdown.taxDeduction),
        taxRate: this.TAX_RATE,
        earnings: this.roundHours(earningsBreakdown.netEarnings),
        sessions,
      },
    };
  }

  async getLecturerPayrollByDateRange(
    lecturerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    period: { startDate: Date; endDate: Date };
    payroll: LecturerEarning;
  } | null> {
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

    const attendances = await this.prisma.attendance.findMany({
      where: {
        userId: lecturer.userId,
        checkOutTime: { not: null },
        checkInTime: {
          gte: startDate,
          lte: endDate,
        },
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
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;

    const sessions: {
      sessionId: string;
      sessionName: string;
      hours: number;
      regularHours: number;
      overtimeHours: number;
      date: Date;
    }[] = [];

    for (const attendance of attendances) {
      if (attendance.checkInTime && attendance.checkOutTime) {
        const breakdown = this.getAttendanceHourBreakdown(attendance);
        totalHours += breakdown.totalWorkedHours;
        regularHours += breakdown.regularHours;
        overtimeHours += breakdown.overtimeHours;

        sessions.push({
          sessionId: attendance.session.id,
          sessionName: attendance.session.name,
          hours: this.roundHours(breakdown.totalWorkedHours),
          regularHours: this.roundHours(breakdown.regularHours),
          overtimeHours: this.roundHours(breakdown.overtimeHours),
          date: new Date(attendance.checkInTime),
        });
      }
    }

    const hourlyRate = lecturer.hourlyRate ?? 0;
    const earningsBreakdown = this.getEarningsBreakdown(
      regularHours,
      overtimeHours,
      hourlyRate,
    );

    return {
      period: {
        startDate,
        endDate,
      },
      payroll: {
        lecturerId: lecturer.id,
        name: lecturer.user.name,
        email: lecturer.user.email,
        staffNo: lecturer.staffNo,
        hourlyRate,
        totalHours: this.roundHours(totalHours),
        regularHours: this.roundHours(regularHours),
        overtimeHours: this.roundHours(overtimeHours),
        overtimeRate: this.roundHours(earningsBreakdown.overtimeRate),
        regularEarnings: this.roundHours(earningsBreakdown.regularEarnings),
        overtimeEarnings: this.roundHours(earningsBreakdown.overtimeEarnings),
        grossEarnings: this.roundHours(earningsBreakdown.grossEarnings),
        taxDeduction: this.roundHours(earningsBreakdown.taxDeduction),
        taxRate: this.TAX_RATE,
        earnings: this.roundHours(earningsBreakdown.netEarnings),
        sessions,
      },
    };
  }

  async getLecturerPayrollByEmailAndPeriod(
    email: string,
    year: number,
    month: number,
  ): Promise<{
    period: { year: number; month: number; startDate: Date; endDate: Date };
    payroll: LecturerEarning;
  } | null> {
    const user = await this.helper.getUser(email);

    const lecturer = await this.prisma.lecturer.findUnique({
      where: { userId: user.id },
    });

    if (!lecturer) {
      throw new BadRequestException('User is not a lecturer');
    }

    return this.getLecturerPayrollByPeriod(lecturer.id, year, month);
  }
}
