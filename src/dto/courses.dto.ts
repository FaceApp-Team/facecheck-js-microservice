import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CoursesDto {
  @IsString()
  @ApiProperty({ example: 'Anatomy 101' })
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Introduction to Human Anatomy', required: false })
  description?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'ANAT101' })
  courseCode: string;

  @IsString()
  @ApiProperty({ example: 'LECTURER456' })
  @IsOptional()
  lecturerId?: string;

  @ApiProperty({ example: 3, required: false })
  @IsOptional()
  @IsNumber()
  creditHours?: number;
}
