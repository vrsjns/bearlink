import { IsString, IsUrl, IsOptional, IsDateString } from 'class-validator';

export class UpdateLinkDto {
  @IsOptional()
  @IsUrl()
  originalUrl?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  password?: string;
}
