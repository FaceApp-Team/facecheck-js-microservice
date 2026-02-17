import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
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
  @ApiProperty({ enum: AttendanceStatus, example: 'PRESENT' })
  status!: AttendanceStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'Student arrived late due to transport issues',
    required: false,
  })
  remarks?: string;
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
  @ApiProperty({ enum: AttendanceStatus, example: 'PRESENT' })
  status!: AttendanceStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Notes for this record', required: false })
  remarks?: string;
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
