import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export const FUEL_PRODUCTS = [
  'DIESEL_S10',
  'DIESEL_S500',
  'ARLA_32',
  'GASOLINE_COMMON',
  'GASOLINE_ADDITIVE',
  'ETHANOL',
] as const;

export class CreateTankDto {
  @IsString() @MinLength(2)
  code!: string;

  @IsString() @MinLength(2)
  name!: string;

  @IsEnum(FUEL_PRODUCTS)
  product!: (typeof FUEL_PRODUCTS)[number];

  /** Capacidade em mililitros. Ex.: 15 m³ = 15_000_000. */
  @IsInt() @Min(1)
  capacityMl!: number;

  @IsOptional() @IsUUID()
  garageId?: string;
}

export class RegisterPurchaseDto {
  @IsString() @MinLength(2)
  supplierName!: string;

  @IsOptional() @IsString()
  supplierCnpj?: string;

  @IsOptional() @IsString()
  invoiceNumber?: string;

  /** Quantidade em mililitros (1 L = 1_000). */
  @IsInt() @Min(1)
  quantityMl!: number;

  /** Custo total em centavos. */
  @IsInt() @Min(1)
  totalCostCents!: number;

  @IsDateString()
  purchasedAt!: string;

  @IsOptional() @IsBoolean()
  emergency?: boolean;

  @IsOptional() @IsString()
  reason?: string;
}

export class RegisterFillDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional() @IsUUID()
  driverId?: string;

  @IsInt() @Min(1)
  quantityMl!: number;

  @IsOptional() @IsInt() @Min(0)
  odometerKm?: number;

  @IsDateString()
  filledAt!: string;

  @IsOptional() @IsString()
  reference?: string;
}

export class RegisterTransferDto {
  @IsUUID()
  fromTankId!: string;

  @IsUUID()
  toTankId!: string;

  @IsInt() @Min(1)
  quantityMl!: number;

  @IsDateString()
  transferredAt!: string;

  @IsOptional() @IsString()
  reason?: string;
}
