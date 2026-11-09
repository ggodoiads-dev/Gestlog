import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBankAccountDto {
  @IsUUID()
  legalEntityId!: string;

  @IsString() @MinLength(3)
  bankCode!: string;

  @IsString() @MinLength(1)
  branch!: string;

  @IsString() @MinLength(1)
  accountNumber!: string;

  @IsString() @MinLength(3)
  alias!: string;

  @IsOptional() @IsString()
  currency?: string;
}

export class ImportStatementLineDto {
  /** FITID do OFX ou id do movimento na API. Único por conta bancária. */
  @IsString() @MinLength(1)
  externalId!: string;

  @IsDateString()
  postedAt!: string;

  @IsEnum(['CREDIT', 'DEBIT'])
  kind!: 'CREDIT' | 'DEBIT';

  /** Sempre positivo em centavos. O sinal é dado por `kind`. */
  @IsInt() @Min(1)
  amountCents!: number;

  @IsString() @MinLength(1)
  description!: string;

  @IsOptional() @IsString()
  counterpartName?: string;

  @IsOptional() @IsString()
  counterpartDoc?: string;
}

export class ImportStatementDto {
  @IsIn(['ofx', 'api', 'manual'])
  source!: 'ofx' | 'api' | 'manual';

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsInt()
  openingBalanceCents!: number;

  @IsInt()
  closingBalanceCents!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportStatementLineDto)
  lines!: ImportStatementLineDto[];
}

export class MatchDto {
  @IsOptional() @IsUUID()
  receiptId?: string;

  @IsOptional() @IsUUID()
  paymentId?: string;
}
