## Resumo

<!-- 1–3 bullets sobre o que este PR entrega. -->

## Escopo tocado

- [ ] Documentação (`docs/`)
- [ ] Core / Auth / RBAC
- [ ] Rotagrama / Operações
- [ ] Fleet / Manutenção
- [ ] Financeiro (AR / AP / Treasury / DRE / EBITDA)
- [ ] CAPEX / Patrimônio
- [ ] Governança (Aprovações, SoD)
- [ ] Integrações externas
- [ ] Driver app
- [ ] Portal do cliente

## Status na matriz

- [ ] `docs/IMPLEMENTATION_STATUS.md` atualizado
- [ ] Caso(s) de aceite atendido(s): `AT-__`
- [ ] Teste(s) automatizado(s) apontado(s): `arquivo:nome`

## Regras não-negociáveis

- [ ] Multi-tenant: nenhuma query bypassa `withTenantScope`
- [ ] SoD / aprovações: sem autoaprovação e sem aprovação tácita
- [ ] Idempotência: chaves tratadas onde aplicável
- [ ] Dinheiro: `Money` ou `MoneyDto`, nunca `number`
- [ ] Auditoria: eventos registrados onde aplicável
- [ ] LGPD: nenhum dado pessoal exposto em logs

## Como validar

<!-- Passos para reproduzir / testar localmente. -->
