import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class UsersDto {
  @IsNotEmpty()
  @IsEnum(Role)
  @ApiProperty({ enum: Role })
  role: Role;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'johndoe' })
  @ApiProperty({ example: 'John Doe' })
  fullName: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ example: 50 })
  lecturerHourlyRate: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ example: 120 })
  lecturerCreditHours: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'johndoe@gmail.com' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '+1234567890' })
  phone: string;

  @IsString()
  @ApiProperty({ example: 'secureP@ss' })
  @IsOptional()
  password: string;

  @IsString()
  @ApiProperty({ example: 'STUDENT123' })
  @IsOptional()
  studentId: string;

  @IsString()
  @ApiProperty({ example: 'STAFF456' })
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'LECTURER456' })
  lecturerId: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'ADMIN789' })
  staff: string;

  @IsArray()
  @IsOptional()
  @ApiProperty({ example: ['COURSE123', 'COURSE456'], required: false })
  courses?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Computer Science', required: false })
  programOfStudy?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: '400 Level', required: false })
  level?: string;
}
