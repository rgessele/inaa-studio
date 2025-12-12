# inaa-studio

Ferramenta para criação de projetos de modelagem

## Funcionalidades

- ✅ Autenticação de usuários com Supabase (Magic Link e Google OAuth)
- ✅ Proteção de rotas e gerenciamento de sessão
- ✅ Banco de dados com Row Level Security (RLS)
- ✅ Armazenamento de projetos com dados em JSONB
- 🚧 Editor de moldes (em desenvolvimento)

## Tecnologias

- **Next.js 16** - Framework React com App Router
- **TypeScript** - Tipagem estática
- **Supabase** - Autenticação e banco de dados
- **Tailwind CSS** - Estilização
- **@supabase/ssr** - Integração Supabase com Next.js

## Começando

### Pré-requisitos

- Node.js 20 ou superior
- npm ou yarn
- Conta no Supabase

### Instalação

1. Clone o repositório:

   ```bash
   git clone https://github.com/rgessele/inaa-studio.git
   cd inaa-studio
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Configure o Supabase:
   - Siga as instruções em [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
   - Copie `.env.local.example` para `.env.local`
   - Adicione suas credenciais do Supabase

4. Execute o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

5. Abra [http://localhost:3000](http://localhost:3000) no seu navegador

## Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento
- `npm run build` - Cria a versão de produção
- `npm run start` - Inicia o servidor de produção
- `npm run lint` - Executa o linter
- `npm run format` - Formata o código com Prettier

## Estrutura do Projeto

```
inaa-studio/
├── app/                    # Next.js App Router
│   ├── auth/              # Rotas de autenticação
│   ├── dashboard/         # Dashboard protegido
│   ├── login/             # Página de login
│   └── ...
├── components/            # Componentes reutilizáveis
├── lib/                   # Bibliotecas e utilitários
│   └── supabase/         # Cliente Supabase
├── supabase/             # Configuração do banco
│   └── migrations/       # Migrações SQL
└── ...
```

## Autenticação

A aplicação suporta dois métodos de autenticação:

1. **Magic Link** - Login sem senha via email
2. **Google OAuth** - Login com conta Google

Todas as rotas (exceto `/login` e `/auth`) são protegidas e requerem autenticação.

## Banco de Dados

O banco de dados possui duas tabelas principais:

- `profiles` - Dados do perfil do usuário
- `projects` - Projetos de modelagem com dados em JSONB

Todas as tabelas possuem Row Level Security (RLS) ativo, garantindo que cada usuário só possa acessar seus próprios dados.

## Contribuindo

Contribuições são bem-vindas! Por favor, abra uma issue ou pull request.

## Licença

Este projeto está sob a licença MIT.
