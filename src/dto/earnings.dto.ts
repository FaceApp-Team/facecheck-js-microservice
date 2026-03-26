export type LecturerEarnings = {
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
  earnings: number;
};
