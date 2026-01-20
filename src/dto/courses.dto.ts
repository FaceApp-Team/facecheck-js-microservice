import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CoursesDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsString()
  @IsNotEmpty()
  courseCode: string;

  @IsString()
  @IsOptional()
  lecturerId: string;
}
