import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'John Doe' })
  name: string;

  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({ example: 'johndoe@gmail.com' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(15)
  @ApiProperty({ example: 'secureP@ss' })
  password: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '+1234567890' })
  phone: string;

  @IsEnum(Role)
  @IsOptional()
  @ApiProperty({ enum: Role, required: false })
  role: Role;
}
