import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { SessionMode, SessionType } from '../../generated/prisma/enums';

export class SessionsDto {
  @IsEnum(SessionMode)
  @IsOptional()
  mode: SessionMode;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(SessionType)
  @IsNotEmpty()
  type: SessionType;

  @IsString()
  @IsOptional()
  courseId: string;

  @IsString()
  @IsOptional()
  lecturerId: string;

  @IsString()
  @IsOptional()
  location: string;

  @IsNumber()
  @IsNotEmpty()
  lateThreshold: number;

  @IsNumber()
  @IsNotEmpty()
  absentThreshold: number;

  @IsDateString()
  @IsNotEmpty()
  startTime: Date;

  @IsDateString()
  @IsNotEmpty()
  endTime: Date;
}
