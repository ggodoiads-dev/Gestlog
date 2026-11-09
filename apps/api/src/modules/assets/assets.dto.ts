import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export const ASSET_CATEGORIES = [
  'VEHICLE',
  'EQUIPMENT',
  'IT_HARDWARE',
  'REAL_ESTATE',
  'FURNITURE',
  'OTHER',
] as const;

export const DISPOSAL_KINDS = ['SALE', 'SCRAP', 'TOTAL_LOSS'] as const;

export class CreateAssetDto {
  @IsUUID()
  legalEntityId!: string;

  @IsString() @MinLength(2)
  code!: string;

  @IsString() @MinLength(2)
  name!: string;

  @IsEnum(ASSET_CATEGORIES)
  category!: (typeof ASSET_CATEGORIES)[number];

  @IsInt() @Min(1)
  acquisitionCostCents!: number;

  @IsDateString()
  acquisitionDate!: string;

  @IsOptional() @IsInt() @Min(0)
  residualCents?: number;

  @IsInt() @Min(1)
  usefulLifeMonths!: number;

  @IsOptional() @IsInt() @Min(0)
  openingAccumulatedCents?: number;

  @IsOptional() @IsUUID()
  vehicleId?: string;
}

export class CreateFinancingDto {
  @IsString() @MinLength(2)
  creditorName!: string;

  @IsOptional() @IsString()
  creditorCnpj?: string;

  @IsOptional() @IsString()
  contractNumber?: string;

  @IsInt() @Min(1)
  originalPrincipalCents!: number;

  @IsInt() @Min(0)
  interestRateBps!: number;

  @IsInt() @Min(1)
  termMonths!: number;

  @IsDateString()
  startDate!: string;
}

export class LifeReviewDto {
  @IsInt() @Min(1)
  newUsefulLifeMonths!: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsString() @MinLength(5)
  reason!: string;
}

export class DisposeDto {
  @IsEnum(DISPOSAL_KINDS)
  kind!: (typeof DISPOSAL_KINDS)[number];

  @IsDateString()
  disposedAt!: string;

  @IsOptional() @IsInt() @Min(0)
  proceedsCents?: number;

  @IsOptional() @IsString()
  reason?: string;

  /** AT-30: quando há financiamento ativo, obrigatório. */
  @IsOptional() @IsDateString()
  creditorConsentAt?: string;

  @IsOptional() @IsString()
  creditorConsentDoc?: string;
}
