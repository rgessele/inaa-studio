# Playwright (E2E)

## Objetivo

- Evitar regressões no editor (canvas/Konva) e nos fluxos principais.
- Cada funcionalidade nova deve vir com testes e atualização do catálogo.

## Bypass de autenticação (somente E2E)

Os testes E2E usam um bypass seguro no middleware, ativado **somente** quando:

- `E2E_TESTS=1`
- `x-e2e-token` == `E2E_TOKEN`

O Playwright já inicia o servidor com `E2E_TESTS=1` e injeta o header.

## Catálogo

A lista de funcionalidades e seus testes está em:

- `tests/catalog.json`

## Comandos

- `npm run test:e2e`
- `npm run test:e2e:ui`
- `npm run test:e2e:debug`

## Visual (screenshots)

- Os testes visuais rodam na matrix completa (`chromium`, `firefox`, `webkit`).
- Os snapshots ficam em `tests/*-snapshots/` e são específicos por browser e SO.
  - Ex.: `page-guides-a4-webkit-darwin.png`

Para atualizar snapshots localmente:

- `npm run test:e2e -- --update-snapshots`

Observação: o Playwright inicia um `next dev` próprio (porta padrão `3100`).
Se já existir outro `next dev` rodando neste repo, o Next.js pode bloquear com
um lock em `.next/dev/lock`. Nesse caso, pare o servidor atual antes de rodar
os testes E2E.

## CI

O workflow do Playwright roda no macOS para manter compatibilidade com os
snapshots `*-darwin.png`.

## Boas práticas

- Para cada feature nova:
  - adicionar/atualizar um spec em `tests/`
  - atualizar `tests/catalog.json`
  - garantir que o smoke do editor continua passando
