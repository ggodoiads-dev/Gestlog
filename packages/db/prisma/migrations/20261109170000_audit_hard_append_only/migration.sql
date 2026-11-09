-- AT-28 (append-only duro). As RULEs DO INSTEAD NOTHING que existiam em
-- audit.audit_events silenciavam UPDATE/DELETE em vez de rejeitar: um
-- atacante com conexão como gestlog_app podia "parecer que atualizou"
-- (0 rows, sem erro) e nós não teríamos como diferenciar de uma
-- atualização legítima rejeitada. Substituímos por REVOKE explícito, que
-- produz "permission denied" rastreável nos logs.

DROP RULE IF EXISTS audit_no_update ON audit.audit_events;
DROP RULE IF EXISTS audit_no_delete ON audit.audit_events;
-- Nomes antigos (idempotente caso alguma instância tenha o padrão legado).
DROP RULE IF EXISTS audit_events_no_update ON audit.audit_events;
DROP RULE IF EXISTS audit_events_no_delete ON audit.audit_events;

REVOKE UPDATE, DELETE ON audit.audit_events FROM gestlog_app;
REVOKE UPDATE, DELETE ON audit.audit_events FROM PUBLIC;
