/**
 * Variáveis de ambiente lidas no server. Fail fast quando faltar o essencial.
 */
export const env = {
  API_BASE_URL: process.env.API_BASE_URL ?? 'http://localhost:4000',
  APP_BASE_URL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
} as const;
