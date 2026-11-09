# Testes de Aceitação — GESTLOG

> Esta lista é **vinculante**. Nenhum módulo é marcado como `homologated`
> sem o caso correspondente passando em suíte automatizada
> (Playwright ou Vitest integration) e registrado em
> [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).

## A. Isolamento, segurança e governança

- **AT-01** Dois tenants com placas/clientes homônimos não acessam
  dados um do outro por URL, exportação, relatório, IA ou arquivo.
- **AT-02** Usuário sem autoridade não aprova — nem manipulando HTTP.
- **AT-03** Solicitante não aprova o próprio pedido quando há SoD.
- **AT-04** Alterar preço/beneficiário após aprovação invalida a
  aprovação e exige reavaliação.
- **AT-05** Ausência de resposta dentro do SLA de plantão **nunca**
  aprova; escalona.
- **AT-06** Fracionamento para burlar alçada é detectado e bloqueado.

## B. Operação (Rotagrama, custódia, elegibilidade)

- **AT-07** Motorista assume veículo com avaria crítica existente;
  checklist não apaga ocorrência e bloqueio persiste.
- **AT-08** Duas tentativas simultâneas de designar o mesmo
  motorista/veículo em intervalos incompatíveis → só uma reserva válida.
- **AT-09** GPS desatualizado: sistema sinaliza incerteza, não inventa
  chegada.
- **AT-10** Veículo retorna à garagem sem entrega de custódia; não
  fica automaticamente disponível.
- **AT-11** Motorista offline envia evento duas vezes → um único fato
  persistido (idempotência).
- **AT-12** "Aparentemente resolvido" do motorista não libera defeito
  crítico; só autoridade técnica.

## C. Combustível e estoque

- **AT-13** Tanque recebe diesel e depois abastece ônibus: compra
  registrada uma vez, consumo e estoque coerentes.
- **AT-14** Compra emergencial de diesel sem aprovação prévia: sistema
  não regulariza autorização retroativamente.
- **AT-15** Transferência entre tanques **não** é compra.

## D. Compras e pagamentos

- **AT-16** Pedido parcialmente recebido, parcialmente faturado e
  parcialmente pago: saldos e compromissos não duplicam.
- **AT-17** Banco retorna estado desconhecido: sistema consulta antes
  de retry; não duplica pagamento.
- **AT-18** OFX e API trazem o mesmo movimento → importação não duplica.
- **AT-19** Pagamento bancário em timeout com status desconhecido:
  consulta antes de reenvio.

## E. Faturamento e AR

- **AT-20** Contrato mensal fixo com viagens incluídas gera uma única
  medição fixa, com extras elegíveis separados.
- **AT-21** Contrato reajustado no meio do período preserva preço
  histórico na competência.
- **AT-22** Faturamento externo com timeout e status desconhecido
  consulta antes de reemitir; não duplica documento.
- **AT-23** Fatura contestada separa valor contestado e incontroverso.
- **AT-24** Cliente atrasa pagamento: transporte **não** é
  automaticamente suspenso.
- **AT-25** Recebível já antecipado é oferecido novamente: bloqueia.

## F. Fechamento, orçamento e EBITDA

- **AT-26** Competência fechada recebe NF tardia: ajuste/reabertura
  com aprovação, versionamento e snapshot anterior preservado.
- **AT-27** Orçamento aprovado é consumido por pedido e depois por NF:
  disponibilidade não reduzida duas vezes.
- **AT-28** EBITDA anual mostra realizado YTD e forecast remanescente
  em segmentos distintos, com histórico as-of.
- **AT-29** EBITDA não inclui juros/depreciação/IR; compra de combustível
  para estoque **não consumido** não reduz EBITDA.

## G. Patrimônio e CAPEX

- **AT-30** Ativo financiado é proposto para venda: sistema consulta
  gravame e impede alienação irregular.
- **AT-31** Revisão de vida útil altera depreciação futura, sem
  reescrever passado fechado.
- **AT-32** CAPEX capitalizado **não** é lançado como OPEX por padrão;
  benefícios medidos em 3/6/12m, sem dupla contagem.

## H. Risco

- **AT-33** Perda de contrato no stress test reduz receita e recalcula
  custos evitáveis, sem duplicar impacto.
- **AT-34** Recomendação de IA não executa pagamento, rescisão, nem
  liberação técnica sem autoridade humana registrada.

## I. Rotagrama e portal

- **AT-35** Rotagrama recorrente permanece estável sem lista diária de
  passageiros; eventual importado respeita capacidade, acessibilidade
  e janela.
- **AT-36** Cliente A no portal não vê rotas, funcionários, contratos
  ou faturamento do cliente B.

## J. Operacional e dados

- **AT-37** Relatórios DRE/EBITDA/forecast exibem origem, competência,
  versão e frescor e reconciliam com os fatos gerenciais.
- **AT-38** Chegada GPS na garagem não encerra automaticamente
  custódia nem torna veículo disponível.
- **AT-39** Backups/restauração e reconciliação pós-incidente são
  testados; indisponibilidade de GPS não é apresentada como
  localização ao vivo.

## K. Driver app

- **AT-40** Evento gerado offline, enviado duas vezes após voltar
  online: idempotente + ordem preservada no servidor.
- **AT-41** Interfaces de ação não aceitam entrada enquanto o veículo
  reporta movimento (quando há leitura).
