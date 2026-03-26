import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// ENUMS (matching Prisma schema)
// ============================================
export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
}

export enum ActivityType {
  LECTURE = 'LECTURE',
  PBL = 'PBL',
  SDL = 'SDL',
  TUTORIAL = 'TUTORIAL',
  PRACTICAL = 'PRACTICAL',
  CLIN_SKILLS = 'CLIN_SKILLS',
  ANATOMY_PRACTICAL = 'ANATOMY_PRACTICAL',
  BIOCHEMISTRY_PRACTICAL = 'BIOCHEMISTRY_PRACTICAL',
  SPORTS = 'SPORTS',
  COMMUNITY_VISIT = 'COMMUNITY_VISIT',
  EXAM = 'EXAM',
  OTHER = 'OTHER',
}

// ============================================
// MODULE DTOs
// ============================================
export class CreateModuleDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  credits!: number;

  @IsInt()
  @IsEnum([100, 200, 300, 400, 500, 600])
  level!: number;

  @IsInt()
  @Min(1)
  @Max(2)
  semester!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;
}

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  credits?: number;

  @IsOptional()
  @IsInt()
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semester?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;
}

export class ModuleQueryDto {
  @IsOptional()
  @IsInt()
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semester?: number;
}

// ============================================
// SUBTOPIC DTOs
// ============================================
export class CreateSubtopicDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  lecturerId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  weeks?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  hoursPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  // Optional: Timetable slot fields for auto-creation
  @IsOptional()
  @IsString()
  academicYear?: string; // Required if creating slot

  @IsOptional()
  @IsEnum(DayOfWeek)
  day?: DayOfWeek;

  @IsOptional()
  @IsString()
  startTime?: string; // e.g., "7:30"

  @IsOptional()
  @IsString()
  endTime?: string; // e.g., "9:30"

  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  slotWeek?: number; // Which week in the timetable

  @IsOptional()
  @IsInt()
  @Min(1)
  colSpan?: number;
}

export class UpdateSubtopicDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lecturerId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  weeks?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  hoursPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

// ============================================
// TIMETABLE DTOs
// ============================================
export class CreateTimetableDto {
  @IsString()
  @IsNotEmpty()
  moduleId!: string;

  @IsString()
  @IsNotEmpty()
  academicYear!: string; // e.g., "2024/2025"

  @IsOptional()
  @IsInt()
  @Min(1)
  totalWeeks?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateTimetableDto {
  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalWeeks?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class TimetableQueryDto {
  @IsOptional()
  @IsInt()
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semester?: number;

  @IsOptional()
  @IsString()
  academicYear?: string;
}

// ============================================
// TIMETABLE SLOT DTOs
// ============================================
export class CreateTimetableSlotDto {
  @IsString()
  @IsNotEmpty()
  moduleId!: string;

  @IsOptional()
  @IsString()
  subtopicId?: string;

  @IsEnum(DayOfWeek)
  day!: DayOfWeek;

  @IsString()
  @IsNotEmpty()
  startTime!: string; // e.g., "7:30"

  @IsString()
  @IsNotEmpty()
  endTime!: string; // e.g., "9:30"

  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @IsOptional()
  @IsString()
  lecturerId?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  week?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  colSpan?: number;
}

export class UpdateTimetableSlotDto {
  @IsOptional()
  @IsString()
  subtopicId?: string;

  @IsOptional()
  @IsEnum(DayOfWeek)
  day?: DayOfWeek;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @IsOptional()
  @IsString()
  lecturerId?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  week?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  colSpan?: number;
}

export class TimetableSlotQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  week?: number;
}

// ============================================
// BULK OPERATIONS DTOs
// ============================================
export class BulkCreateSubtopicsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubtopicDto)
  subtopics!: CreateSubtopicDto[];
}

export class BulkCreateSlotsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTimetableSlotDto)
  slots!: CreateTimetableSlotDto[];
}
