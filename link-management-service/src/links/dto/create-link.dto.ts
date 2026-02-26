import {
  IsString,
  IsNotEmpty,
  IsUrl,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateLinkDto {
  @IsString()
  @IsNotEmpty()
  alias: string;

  @IsUrl()
  originalUrl: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  password?: string;
}
