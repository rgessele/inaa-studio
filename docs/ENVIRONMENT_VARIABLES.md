# Variáveis de Ambiente (`.env.local`)

Este documento descreve, de forma prática, o que cada variável faz no Inaá Studio, quais valores são aceitos e quando usar cada opção.

## Resumo rápido

Estas são as variáveis atualmente presentes no seu `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_E2E_TESTS`
- `DEBUG`

## Tabela principal

| Variável | Escopo | Obrigatória | Valores/opções | Default implícito | O que controla |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + Servidor | Sim | URL do projeto Supabase (`https://<project-ref>.supabase.co`) | sem default | Inicialização dos clients Supabase (browser/server/middleware) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + Servidor | Sim | Chave pública `anon` do Supabase | sem default | Autenticação e acesso padrão no cliente/SSR |
| `SUPABASE_SECRET_KEY` | Servidor | Sim (ou uma alternativa) | Chave administrativa secreta do Supabase | fallback para outras chaves | Operações admin (`createAdminClient`) |
| `NEXT_PUBLIC_E2E_TESTS` | Cliente | Não | `"1"` ou `"0"` | `"0"` (quando ausente) | Ativa comportamentos auxiliares de E2E no editor |
| `DEBUG` | Servidor (+ espelhada para cliente) | Não | `"true"` ou `"false"` | desativado | Liga endpoint de debug-log em ambiente não-prod |

## Detalhamento por variável

### `NEXT_PUBLIC_SUPABASE_URL`

- Onde é usada:
  - `lib/supabase/client.ts`
  - `lib/supabase/server.ts`
  - `lib/supabase/middleware.ts`
  - `app/auth/signout/route.ts`
  - `lib/supabase/admin.ts`
- Efeito se faltar:
  - Em `client.ts`/`server.ts` ocorre erro explícito de configuração ausente.
  - No middleware, em `production`, rotas protegidas redirecionam para login.
- Recomendação:
  - Use a URL exata do projeto Supabase.
  - Evite whitespace e valores com barra extra no fim.

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- Onde é usada:
  - Mesmos pontos do `NEXT_PUBLIC_SUPABASE_URL` (exceto admin key).
- Observação de segurança:
  - Essa chave é pública por desenho (client-side), mas ainda representa identidade do app.
- Efeito se faltar:
  - Mesmo comportamento de falha de configuração nas factories Supabase.

### `SUPABASE_SECRET_KEY`

- Onde é usada:
  - `lib/supabase/admin.ts`
- Prioridade de leitura no código:
  1. `SUPABASE_SECRET_KEY`
  2. `SUPABASE_SECRET_API_KEY`
  3. `SUPABASE_SERVICE_ROLE_KEY`
- Opções:
  - Você pode usar qualquer uma das 3 variáveis acima, mas **somente uma já resolve**.
  - Recomendada no projeto atual: `SUPABASE_SECRET_KEY`.
- Segurança:
  - Nunca expor em código cliente ou logs.

### `NEXT_PUBLIC_E2E_TESTS`

- Onde é usada:
  - `components/editor/EditorContext.tsx`
  - `components/editor/EditorHeader.tsx`
- Valores:
  - `"1"`: ativa utilitários de teste no cliente.
  - `"0"` ou ausente: comportamento normal.
- Nota importante:
  - Auto-save só é bloqueado quando há automação real de browser (`navigator.webdriver === true`).
  - Ou seja, manter essa variável em `1` não deve mais desligar auto-save durante uso manual.
- Recomendação para dia a dia:
  - `NEXT_PUBLIC_E2E_TESTS=0`

### `DEBUG`

- Onde é usada:
  - `app/api/debug-log/route.ts`
  - `next.config.ts` (repassa para `NEXT_PUBLIC_DEBUG`)
- Valores:
  - `"true"`: endpoint de debug-log ativo em desenvolvimento.
  - qualquer outro valor: endpoint responde sem gravar log.
- Regra de produção:
  - Em `production`, o debug-log fica desativado mesmo com `DEBUG=true`.
- Override em runtime (sem restart):
  - `localStorage.setItem("inaa:debugLogsEnabled", "off")` desliga envio no cliente.
  - `localStorage.setItem("inaa:debugLogsEnabled", "on")` religa envio no cliente.
  - Remover chave volta ao comportamento do env: `localStorage.removeItem("inaa:debugLogsEnabled")`.
- Observação E2E:
  - Durante automação Playwright (`NEXT_PUBLIC_E2E_TESTS=1` + `navigator.webdriver=true`), debug logs ficam forçados para manter os testes determinísticos.

## Variáveis relacionadas (não obrigatórias no seu `.env.local` atual)

Estas variáveis aparecem no código e podem ser úteis em cenários específicos:

| Variável | Uso |
|---|---|
| `E2E_TESTS` | Habilita bypass de autenticação controlado para Playwright no servidor/middleware |
| `E2E_TOKEN` | Token esperado no header `x-e2e-token` para bypass E2E |
| `E2E_PORT` | Porta usada pelo `playwright.config.ts` para subir o app de teste |
| `NEXT_DIST_DIR` | Diretório de build do Next (útil para separar `.next` e `.next-e2e`) |
| `CI` | Ajusta retries/workers no Playwright |
| `VERCEL_ENV` | Metadado de ambiente exibido no rodapé de versão |
| `VERCEL_GIT_COMMIT_SHA` | Metadado de commit exibido no rodapé de versão |
| `VERCEL_GIT_COMMIT_REF` | Metadado de branch/tag exibido no rodapé de versão |

## Perfis recomendados

### Desenvolvimento normal

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...
NEXT_PUBLIC_E2E_TESTS=0
DEBUG=false
```

### Sessão de investigação local com logs

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...
NEXT_PUBLIC_E2E_TESTS=0
DEBUG=true
```

### Execução E2E local (Playwright)

Normalmente o próprio `playwright.config.ts` já injeta as variáveis necessárias ao iniciar o servidor de testes. Se quiser forçar manualmente:

```env
NEXT_PUBLIC_E2E_TESTS=1
E2E_TESTS=1
E2E_TOKEN=inaa-e2e-token
E2E_PORT=3100
NEXT_DIST_DIR=.next-e2e
```

## Checklist de diagnóstico rápido

1. Erro de Supabase ausente ao abrir o editor:
   - Verifique `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Funcionalidades admin quebradas:
   - Verifique `SUPABASE_SECRET_KEY` (ou alternativas).
3. Auto-save aparentemente inativo:
   - Confirme que o projeto já possui `projectId` (foi salvo ao menos uma vez).
   - Confirme se não está em sessão automatizada de browser.
4. Log de debug não grava:
   - Verifique `DEBUG=true` e `NODE_ENV` diferente de `production`.
