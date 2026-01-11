# Branch protection (main)

Este repo está configurado para rodar CI no GitHub Actions em PRs e em pushes.

> Observação: a proteção de branch (bloquear merge sem CI) é uma configuração do GitHub.
> Não é aplicada via código. Este arquivo documenta como habilitar.

## Regra recomendada

Em `Settings → Branches → Add branch protection rule`:

- **Branch name pattern**: `main`
- Marcar **Require a pull request before merging**
  - (Opcional) **Require approvals**: 1
- Marcar **Require status checks to pass before merging**
  - Selecionar: `Playwright Tests`
- Marcar **Require branches to be up to date before merging**
- (Opcional) Marcar **Do not allow bypassing the above settings**

## O que o check "Playwright Tests" cobre

O workflow `Playwright Tests` executa:

- `npm run lint`
- `npx playwright test` (matrix: chromium + firefox + webkit)
- Enforcement: se mexer em `components/editor/` ou `app/editor/` ou `lib/projects.ts`, exige atualizar `tests/catalog.json`

Arquivo do workflow:

- `.github/workflows/playwright.yml`
