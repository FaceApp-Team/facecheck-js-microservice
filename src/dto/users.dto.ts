import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums';

export class UsersDto {
  @IsNotEmpty()
  @IsEnum(Role)
  role: Role;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsNumber()
  @IsOptional()
  lecturerHourlyRate: number;

  @IsNumber()
  @IsOptional()
  lecturerCreditHours: number;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  password: string;

  @IsString()
  @IsOptional()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsOptional()
  lecturerId: string;

  @IsString()
  @IsOptional()
  staff: string;

  @IsArray()
  @IsOptional()
  courses?: string[];

  @IsString()
  @IsOptional()
  programOfStudy?: string;

  @IsString()
  @IsOptional()
  level?: string;
}
