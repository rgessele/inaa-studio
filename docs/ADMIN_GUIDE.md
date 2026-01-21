# Guia do Admin (Inaá Studio)

Este documento descreve o fluxo e as regras do painel `/admin`.

## Acesso e redirecionamento

- Usuários com `profiles.role = "admin"` podem acessar `/admin`.
- Após login, se o usuário for admin, a aplicação redireciona para `/admin` por padrão.
- Usuários não-admin continuam indo para `/dashboard`.

## Navegação rápida

- No topo do Admin existe um botão **Dashboard** para voltar ao `/dashboard`.
- No topo do Dashboard, usuários admin veem um botão **Admin** para ir ao `/admin`.

## Usuários

Em `/admin/users`:

- Lista paginada (padrão: 50 por página) com seletor de quantidade.
- Ações por usuário (role, bloqueio, expiração etc.) são protegidas por regras do servidor.

## Detalhe do usuário

Em `/admin/users/[id]`:

- A seção **Moldes** suporta:
  - Paginação (padrão: 50 por página)
  - Seletor de quantidade
  - Busca por nome do projeto
- O abrir do molde é um ícone de “abrir em nova aba”.

## Visualização de moldes de outros usuários (somente leitura)

Admins podem visualizar projetos de outros usuários diretamente no editor (tela cheia do navegador), porém em modo somente leitura.

- A ação de visualizar abre: `/editor/[id]?printOnly=1`.
- O editor é carregado em **read-only** e com UI reduzida para **apenas exportação/impressão**.
- Nenhuma alteração é salva/permitida nesse modo.

### `printOnly=1`

Quando `printOnly=1` e o editor está em `readOnly`:

- As ferramentas/edição ficam escondidas.
- A barra lateral exibe somente **Exportar/Imprimir** (PDF/SVG).

## Observações de segurança

- A visualização admin de projetos de terceiros usa um client privilegiado no servidor.
- A UI esconde ações de edição, e o contexto do editor força `readOnly` nesse cenário.
