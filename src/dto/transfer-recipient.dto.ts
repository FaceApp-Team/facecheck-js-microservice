import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferRecipientDto {
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  accountName: string;

  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsOptional()
  bankName: string;

  @IsString()
  @IsNotEmpty()
  currency: string;
}
