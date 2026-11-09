-- Permissoes de AR adicionadas ao catalogo global.

INSERT INTO core.permissions (id, code, module_code, description) VALUES
  (gen_random_uuid(), 'ar.receivables.read',  'ar', 'Visualizar contas a receber'),
  (gen_random_uuid(), 'ar.receivables.issue', 'ar', 'Emitir contas a receber a partir de pre-fatura'),
  (gen_random_uuid(), 'ar.receivables.write', 'ar', 'Atualizar status ou marcar baixa')
ON CONFLICT (code) DO NOTHING;
