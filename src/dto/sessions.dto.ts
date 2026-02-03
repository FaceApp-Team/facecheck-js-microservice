import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
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
  name: string;

  @IsEnum(SessionType)
  @IsNotEmpty()
  type: SessionType;

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
  startTime: Date;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ example: '2024-07-01T11:00:00Z' })
  endTime: Date;
}
