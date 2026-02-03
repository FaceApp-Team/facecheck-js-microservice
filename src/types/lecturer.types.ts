// Backend type (e.g., in payroll.service.ts or a separate types file)
export interface LecturerEarning {
  lecturerId: string;
  name: string;
  email: string;
  staffNo: string | null;
  hourlyRate: number;
  totalHours: number;
  earnings: number;
}
