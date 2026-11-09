-- Garante atomicidade na designação de ScheduledTrip (AT-08).
--
-- Invariante: no máximo UMA designação "viva" (nao terminal) por
-- ScheduledTrip. Estados terminais sao CANCELLED e SUPERSEDED.
--
-- O indice unico parcial faz com que duas inserções concorrentes do
-- primeiro ato (state=PROPOSED | CONVOKED | ACCEPTED | PRESENTED) só
-- possam ter uma vencedora — a outra bate contra o indice e falha com
-- unique_violation (23505), que a aplicação traduz para 409 Conflict.

CREATE UNIQUE INDEX IF NOT EXISTS assignments_one_alive_per_trip
  ON operations.assignments (scheduled_trip_id)
  WHERE state NOT IN ('CANCELLED', 'SUPERSEDED');

-- Indice auxiliar para a projeção de elegibilidade do motorista
-- (jornada/overlap virá em iteração seguinte; por ora facilitamos lookup).
CREATE INDEX IF NOT EXISTS assignments_driver_alive
  ON operations.assignments (tenant_id, driver_id)
  WHERE state NOT IN ('CANCELLED', 'SUPERSEDED');

CREATE INDEX IF NOT EXISTS assignments_vehicle_alive
  ON operations.assignments (tenant_id, vehicle_id)
  WHERE state NOT IN ('CANCELLED', 'SUPERSEDED');
