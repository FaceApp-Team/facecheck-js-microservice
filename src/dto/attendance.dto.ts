import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsISO8601,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '../../generated/prisma/enums';
import { Type } from 'class-transformer';

export class AttendanceDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'session123' })
  sessionId!: string;
}

export class ManualAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'session123' })
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'user123',
    description: 'User ID of student or lecturer',
  })
  userId!: string;

  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  @ApiProperty({
    enum: AttendanceStatus,
    example: 'CHECKED_IN',
    description:
      'Manual status update: CHECKED_IN, CHECKED_OUT, PRESENT, ABSENT, LATE, EXCUSED',
  })
  status!: AttendanceStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'Student arrived late due to transport issues',
    required: false,
  })
  remarks?: string;

  @IsISO8601()
  @IsOptional()
  @ApiProperty({
    example: '2026-03-17T09:00:00Z',
    description:
      'Custom check-in time (ISO 8601 format). If provided, used instead of session startTime',
    required: false,
  })
  startTime?: string;

  @IsISO8601()
  @IsOptional()
  @ApiProperty({
    example: '2026-03-17T11:30:00Z',
    description:
      'Custom check-out time (ISO 8601 format). If provided, used instead of session endTime',
    required: false,
  })
  endTime?: string;
}

export class AttendanceRecordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'user123',
    description: 'User ID of student or lecturer',
  })
  userId!: string;

  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  @ApiProperty({
    enum: AttendanceStatus,
    example: 'CHECKED_OUT',
    description:
      'Bulk manual status update: CHECKED_IN, CHECKED_OUT, PRESENT, ABSENT, LATE, EXCUSED',
  })
  status!: AttendanceStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Notes for this record', required: false })
  remarks?: string;

  @IsISO8601()
  @IsOptional()
  @ApiProperty({
    example: '2026-03-24T08:00:00Z',
    required: false,
    description: 'Optional manual check-in datetime for this record',
  })
  startTime?: string;

  @IsISO8601()
  @IsOptional()
  @ApiProperty({
    example: '2026-03-24T11:30:00Z',
    required: false,
    description: 'Optional manual check-out datetime for this record',
  })
  endTime?: string;
}

export class BulkManualAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'session123' })
  sessionId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  @ApiProperty({
    type: [AttendanceRecordDto],
    description: 'Array of attendance records to mark',
  })
  attendanceRecords!: AttendanceRecordDto[];
}
