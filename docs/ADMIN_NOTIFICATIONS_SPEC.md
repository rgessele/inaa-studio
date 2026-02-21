# Especificação - Notificações Admin In-App

## Objetivo
Permitir que administradores enviem mensagens para usuários da plataforma via notificações in-app, com indicador de não lidas no header e suporte a publicação imediata ou agendada.

## Escopo v1
1. Admin cria notificação com `título`, `mensagem`, `tipo` e `link` opcional.
2. Admin pode enviar `agora` ou `agendar` data/hora.
3. Admin pode anexar `imagem opcional` (JPG/PNG/WEBP).
4. Usuário recebe no sino de notificações no topo da plataforma.
5. Badge vermelho mostra total não lidas (`99+` quando necessário).
6. Ao abrir/lê-la, contador reduz até sumir quando zerar.
7. Admin pode apagar uma notificação já enviada, removendo-a da lista de todos os usuários.
8. Admin pode selecionar múltiplas notificações e aplicar ação em massa (publicar, cancelar, apagar).
9. Admin pode definir `data/hora de expiração` opcional para ocultar a mensagem dos usuários após esse momento.
10. Lista admin permite filtrar por mensagens `expiradas` e `não expiradas`.

## Regras de Negócio
1. Destino v1: todos os usuários ativos e não bloqueados.
2. Agendamento aceita apenas data/hora futura.
3. Data persistida em UTC.
4. Leitura é individual por usuário.
5. Notificação enviada não volta para rascunho.
6. Imagem é opcional.
7. Imagem aceita: JPG, PNG, WEBP até 5MB.
8. Expiração é opcional e, quando informada, deve ser futura.
9. Se houver agendamento e expiração, `expires_at` deve ser maior que `scheduled_at`.
10. Notificação expirada não aparece para usuário, lida ou não lida.

## Modelo de Dados
### `admin_notifications`
1. Conteúdo: `title`, `body`, `type`, `action_url`.
2. Anexo opcional: `image_url`, `image_mime_type`, `image_size_bytes`, `image_width`, `image_height`, `image_alt`.
3. Ciclo de vida: `status` (`draft|scheduled|sent|canceled`), `scheduled_at`, `sent_at`.
4. Validade opcional: `expires_at`.
5. Auditoria: `created_by`, `created_at`, `updated_at`.

### `user_notifications`
1. Entrega por usuário: `notification_id`, `user_id`, `delivered_at`.
2. Leitura: `read_at` (null = não lida).
3. Restrição de unicidade por (`notification_id`, `user_id`).

## Fluxos
### Publicação imediata
1. Admin cria notificação.
2. Sistema entrega para usuários elegíveis.
3. Status muda para `sent`.

### Exclusão
1. Admin pode apagar notificação em qualquer status.
2. Ao apagar uma notificação enviada, as entregas dos usuários associadas são removidas.
3. A notificação deixa de aparecer no sino/lista dos usuários.

### Ações em massa
1. Admin pode selecionar várias notificações na listagem.
2. Ações disponíveis: publicar, cancelar e apagar selecionadas.
3. Exclusão em massa remove as notificações também da lista dos usuários.

### Agendamento
1. Admin define `scheduled_at`.
2. Status fica `scheduled`.
3. Dispatcher publica quando `scheduled_at <= now`.

### Leitura do usuário
1. Usuário abre sino e clica na mensagem.
2. Registro recebe `read_at`.
3. Badge é recalculado.

## Segurança e Permissões
1. Apenas admins criam/alteram/cancelam notificações.
2. Usuário comum lê apenas suas entregas (`user_notifications.user_id = auth.uid()`).
3. Conteúdo de notificação é visível ao usuário apenas quando status = `sent`.
4. Upload no bucket `admin-notifications` permitido para admins.

## UX
1. Sino ao lado do toggle de tema no header.
2. Badge vermelho com contador de não lidas.
3. Painel lista mensagens com status de leitura.
4. Ação “Marcar todas como lidas”.
5. Exibe imagem opcional e link opcional por mensagem.
6. Notificações expiradas deixam de aparecer automaticamente no sino.
7. Tela admin com filtro de expiração para manutenção.

## Operação de Agendamento
1. Função SQL `dispatch_due_admin_notifications` processa mensagens agendadas vencidas.
2. Pode ser chamada por cron (Vercel/Supabase) e também por gatilho de atualização da UI.

## Critérios de Aceite
1. Publicar agora entrega e exibe no sino.
2. Agendar entrega automaticamente no horário (ou na primeira janela de dispatch disponível).
3. Badge incrementa para novas não lidas.
4. Badge decrementa ao ler.
5. Badge some quando não há não lidas.
6. Mensagem sem imagem funciona normalmente.
7. Mensagem com imagem válida renderiza para usuário.
8. Mensagem expirada deixa de aparecer para usuários.
