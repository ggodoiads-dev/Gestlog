# @gestlog/driver — App do motorista

PWA Next.js separado do admin. Alvo: offline-first, poucos toques,
nunca pedir interação durante direção.

## Princípios

- Botões grandes, contraste elevado, hierarquia forte.
- Modo offline transparente com fila idempotente (IndexedDB).
- Checklist por **nova custódia** (não por viagem).
- Eventos operacionais distintos: apresentação, posicionamento, início,
  chegada, encerramento, retorno, fim de jornada.
- Nunca mostrar dado financeiro ou de outros motoristas.

Ver `docs/PRODUCT_REQUIREMENTS.md` §3.7.
