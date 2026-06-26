import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from '../domain/enums';

// We validate shape loosely on input: the harness may send edge-case data, and we must
// not 400 on a slightly-off transaction. Required ids/amounts are checked; enum-ish
// fields are accepted as strings so reasoning can still run on imperfect data.
export class TransactionDto {
  @IsString()
  transaction_id: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  counterparty?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export const KNOWN_TRANSACTION_TYPES = TRANSACTION_TYPES;
export const KNOWN_TRANSACTION_STATUSES = TRANSACTION_STATUSES;
