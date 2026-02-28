import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SessionMode, SessionType } from '../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class SessionsDto {
  @IsEnum(SessionMode)
  @IsOptional()
  @ApiProperty({ enum: SessionMode, required: false })
  mode?: SessionMode;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Morning Lecture on Anatomy' })
  name!: string;

  @IsEnum(SessionType)
  @IsNotEmpty()
  type!: SessionType;

  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'MODULE123',
    required: false,
    description: 'Module ID for the session',
  })
  moduleId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'COURSE123', required: false })
  courseId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'LECTURER456', required: false })
  lecturerId?: string;

  @IsString()
  @ApiProperty({ example: 'Room 101', required: false })
  @IsOptional()
  location?: string;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ example: '2024-07-01T09:00:00Z' })
  startTime!: Date;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ example: '2024-07-01T11:00:00Z' })
  endTime!: Date;

  // Geofencing and subtopic linking fields
  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'SUBTOPIC123',
    required: false,
    description: 'Subtopic ID for the session',
  })
  subtopicId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'SLOT123',
    required: false,
    description: 'Timetable slot ID for the session',
  })
  timetableSlotId?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    example: 5.6037,
    required: false,
    description: 'Latitude for geofencing',
  })
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    example: -0.187,
    required: false,
    description: 'Longitude for geofencing',
  })
  longitude?: number;

  @IsNumber()
  @IsOptional()
  @Min(10)
  @Max(500)
  @ApiProperty({
    example: 100,
    required: false,
    description: 'Geofence radius in meters (10-500)',
  })
  geofenceRadius?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    example: 1,
    required: false,
    description: 'Week number for the session',
  })
  week?: number;
}

export class MarkAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'SESSION123',
    required: true,
    description: 'Session ID to mark attendance for',
  })
  sessionId!: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    example: 5.6037,
    required: false,
    description: 'User latitude for geofencing verification',
  })
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    example: -0.187,
    required: false,
    description: 'User longitude for geofencing verification',
  })
  longitude?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    example: 0.95,
    required: false,
    description: 'Face recognition confidence (0-1)',
  })
  confidence?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'mobile',
    required: false,
    description: 'Source of attendance (mobile, kiosk, manual, etc.)',
  })
  source?: string;
}
