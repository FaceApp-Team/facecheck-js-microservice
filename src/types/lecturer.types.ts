// Backend type (e.g., in payroll.service.ts or a separate types file)
export interface LecturerEarning {
  lecturerId: string;
  name: string;
  email: string;
  staffNo: string | null;
  hourlyRate: number;
  totalHours: number;
  grossEarnings?: number;
  taxDeduction?: number;
  taxRate?: number;
  earnings: number; // Net earnings after tax
  sessions?: { sessionId: string; sessionName: string; hours: number }[];
}
