-- RLS + indices unicos parciais para Billing (AT-20).
--
-- Invariantes:
--   1. MENSAL FIXO: no maximo UMA measurement por (contract, competencia).
--      Garantido por unique index parcial: scheduled_trip_id IS NULL.
--   2. POR VIAGEM: no maximo UMA measurement por scheduled_trip (independente
--      da competencia). Garantido por unique index parcial:
--      scheduled_trip_id IS NOT NULL.

-- Grants + schema usage ------------------------------------------------------
GRANT USAGE ON SCHEMA billing TO gestlog_app, gestlog_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing
  TO gestlog_app, gestlog_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestlog_app;

-- RLS ------------------------------------------------------------------------
ALTER TABLE billing.billing_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_measurements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON billing.billing_measurements;
CREATE POLICY tenant_isolation ON billing.billing_measurements
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Indices unicos parciais ----------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS measurements_monthly_fixed_unique
  ON billing.billing_measurements (tenant_id, contract_id, competence_year, competence_month)
  WHERE kind = 'MONTHLY_FIXED' AND scheduled_trip_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS measurements_per_trip_unique
  ON billing.billing_measurements (tenant_id, scheduled_trip_id)
  WHERE kind = 'PER_TRIP' AND scheduled_trip_id IS NOT NULL;
