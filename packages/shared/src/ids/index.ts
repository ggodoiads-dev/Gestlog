import { z } from 'zod';

/** CPF normalizado (apenas dígitos). Validação completa fica em domínio Core. */
export const cpfSchema = z
  .string()
  .regex(/^\d{11}$/, 'CPF deve conter 11 dígitos');

/** CNPJ normalizado (apenas dígitos). Validação completa fica em domínio Core. */
export const cnpjSchema = z
  .string()
  .regex(/^\d{14}$/, 'CNPJ deve conter 14 dígitos');

/** Placa Mercosul ou antigo padrão. */
export const licensePlateSchema = z
  .string()
  .regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, 'Placa inválida');

export const chassisSchema = z
  .string()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Chassi inválido (17 caracteres, sem I/O/Q)');

export type CPF = z.infer<typeof cpfSchema>;
export type CNPJ = z.infer<typeof cnpjSchema>;
export type LicensePlate = z.infer<typeof licensePlateSchema>;
export type Chassis = z.infer<typeof chassisSchema>;
