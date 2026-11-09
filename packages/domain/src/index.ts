/**
 * @gestlog/domain
 *
 * Núcleo puro de cada bounded context (core, routing, fleet, operations,
 * autodispatch, clm, workforce, billing, ar, procurement, ap, treasury,
 * budget, finance, assets, capex, governance, intelligence).
 *
 * Cada contexto segue a mesma estrutura hexagonal:
 *   core/         — entidades, VOs, invariantes (puro TS).
 *   application/  — casos de uso.
 *   ports/        — interfaces (repositórios, serviços externos).
 *   events/       — eventos de domínio.
 *
 * Nenhum pacote adaptador vive aqui: Prisma, HTTP, filas, etc. ficam em
 * `apps/api/src/modules/<context>/adapters`.
 */
export const __placeholder = true;
