// Backend type (e.g., in payroll.service.ts or a separate types file)
export interface LecturerEarning {
  lecturerId: string;
  name: string;
  email: string;
  staffNo: string | null;
  hourlyRate: number;
  totalHours: number;
  regularHours?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  regularEarnings?: number;
  overtimeEarnings?: number;
  grossEarnings?: number;
  taxDeduction?: number;
  taxRate?: number;
  earnings: number; // Net earnings after tax
  sessions?: {
    sessionId: string;
    sessionName: string;
    hours: number;
    regularHours?: number;
    overtimeHours?: number;
    date?: Date;
  }[];
}

export interface PayrollPeriod {
  year?: number;
  month?: number;
  startDate: Date;
  endDate: Date;
}

export interface PeriodPayrollResponse {
  period: PayrollPeriod;
  earnings?: LecturerEarning[];
  payroll?: LecturerEarning;
}
