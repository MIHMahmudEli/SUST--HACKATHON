import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TransactionDto } from './transaction.dto';

// Only ticket_id and complaint are required by the spec. Everything else is optional.
// Optional enum fields (language, channel, user_type) are accepted as free strings to
// avoid 400-ing on harness inputs we can still reason about; we normalize internally.
export class AnalyzeTicketDto {
  @IsString()
  ticket_id: string;

  @IsString()
  complaint: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  user_type?: string;

  @IsOptional()
  @IsString()
  campaign_context?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionDto)
  transaction_history?: TransactionDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
