# Spec — Copiar e Colar (Copy/Paste) no Editor

Data: 14/01/2026

## Objetivo

Adicionar 2 funcionalidades no editor (canvas) do Inaá Studio:

1. **Copiar** a seleção atual (figuras)
2. **Colar** o conteúdo copiado, criando novas figuras no canvas

A implementação deve estar disponível em:

- **Menu superior** (menu “Editar”)
- **Barra lateral** (toolbar do editor)
- **Atalhos tradicionais** de teclado (macOS e Windows)

> Fora do escopo: Cut/Recortar (Cmd/Ctrl+X), Copy/Paste via clipboard do sistema, copiar textos do UI.

---

## Contexto atual (para alinhamento)

- O menu superior existe em `EditorHeader` e já contém `FileMenu` e `EditMenu`.
- A toolbar lateral (`EditorToolbar`) expõe ações rápidas (Salvar, Exportar, Undo, Redo, Borracha/Delete).
- Atalhos globais do editor ficam em `useKeyboardShortcuts` (Cmd/Ctrl+Z, Redo, Backspace).
- Atalhos de ferramentas (V/N/H/R/…) ficam em `useToolShortcuts` e **não** disparam quando Ctrl/Cmd está pressionado.
- Seleção do editor é baseada em `selectedFigureIds` (multi-select) e `selectedFigureId` (primeiro da lista), com `selectedEdge` separado.
- Figuras suportam **seam allowance derivado** via `kind: "seam"` e `parentId`.

---

## UX / Comportamento

### Definições

- **Figura base**: `Figure` sem `kind === "seam"`.
- **Figura seam (derivada)**: `Figure` com `kind === "seam"` e `parentId` apontando para a base.
- **Clipboard interno**: armazenamento em memória da aplicação (não é o clipboard do SO).

### Regras de Copiar (Copy)

**Quando copiar é permitido**

- `selectedFigureIds.length > 0` **OU** existe `selectedEdge` (neste caso, considera a figura do edge como selecionada).

**O que é copiado**

- Copiar deve clonar profundamente (**deep copy**) as figuras selecionadas.
- Se houver **figuras base** na seleção, copiar também deve incluir automaticamente as **seams derivadas** dessas bases (mesmo que não estejam explicitamente selecionadas), mantendo consistência com a regra atual de delete (base implica seam).
- Se a seleção contiver **apenas seams**, copia somente as seams selecionadas.

**Relacionamentos seam/base na cópia**

- Se uma seam copiada possui `parentId` e o `parentId` estiver no conjunto copiado, registrar essa relação para remapeamento no paste.
- Se o `parentId` não estiver no conjunto copiado, a seam será tratada como “seam órfã” no paste (ver regras de Colar).

**Histórico (Undo/Redo)**

- Copiar **não** deve gravar histórico (nenhuma mudança no estado do editor).

**Feedback visual**

- Menu/toolbar: item “Copiar” deve ficar **desabilitado** quando não houver nada copiável.
- (Opcional) Toast discreto: “Copiado” apenas quando copiar ocorrer via menu/toolbar; via teclado pode ser silencioso.

### Regras de Colar (Paste)

**Quando colar é permitido**

- Existe conteúdo no clipboard interno.

**Como colar posiciona as figuras**

- Objetivo: o usuário sempre “vê” o resultado do paste imediatamente.
- Estratégia padrão:
  - Calcular o _bounding box_ (em world coords) do conteúdo copiado.
  - Aplicar um deslocamento fixo de $\Delta = 20px$ em X e Y (ou equivalente em world px) no primeiro paste.
  - Em _pastes_ consecutivos sem um novo Copy, incrementar o deslocamento (ex.: 20px, 40px, 60px…) para evitar sobreposição.

> Alternativa (se já existir infraestrutura confiável de “último cursor/ponteiro no canvas”): colar centralizado na posição do cursor, mantendo offset incremental. Se essa infra não existir, usar apenas offset incremental.

**IDs e imutabilidade**

- Cada figura colada deve receber um **novo `id`**.
- IDs de `nodes` e `edges` também devem ser **regenerados**, mantendo o grafo consistente.

**Relacionamentos seam/base no paste**

- Se a seam colada tinha `parentId` que foi copiado na mesma operação, o `parentId` deve ser remapeado para o **novo ID** da base colada.
- Se a seam colada era “órfã” (o `parentId` original não foi colado), então:
  - remover `parentId` e `sourceSignature` (para não depender do pai original), e
  - manter `kind: "seam"` (para aparência/semântica), mas sem auto-recompute.

**Ordenação (z-order)**

- Preservar a ordem relativa dos itens copiados conforme aparecem no array `figures`.
- Inserir as novas figuras ao final do array (ficam “por cima”), a menos que exista regra de ordenação mais específica já adotada.

**Seleção após colar**

- Após colar, selecionar automaticamente **todas as figuras recém-coladas** (`selectedFigureIds = novosIds`).
- `selectedEdge` deve ser limpo.

**Histórico (Undo/Redo)**

- Colar deve ser uma operação **undoável** (um único passo no histórico por paste).

**Interação com ferramentas**

- A ferramenta atual **não deve mudar** (ex.: se o usuário está em Node tool, continua em Node tool), mas a seleção passa a ser o conjunto colado.

---

## UI: Menu superior (EditorHeader)

### Menu “Editar”

Adicionar itens abaixo de Refazer, com separador:

- **Copiar** — desabilitado quando nada copiável
- **Colar** — desabilitado quando clipboard interno vazio

Formato deve seguir o padrão atual de `EditMenu`:

- label à esquerda
- shortcut à direita
- estilos de disabled iguais ao itemClass atual

### Texto e i18n

- Labels em pt-BR: “Copiar”, “Colar”.

---

## UI: Toolbar lateral (EditorToolbar)

Adicionar 2 botões de ação rápida próximos de Undo/Redo (mesmo grupo):

- Botão “Copiar”
- Botão “Colar”

Requisitos:

- `aria-label` e tooltip seguindo o padrão `ToolbarTooltip`
- Estado disabled (estilo “cursor-not-allowed”, cinza) conforme outras ações

### Ícones

O projeto já usa Material Symbols (`material-symbols-outlined`). Preferência:

- Copiar: `content_copy`
- Colar: `content_paste`

Se algum desses nomes não estiver disponível (fallback obrigatório):

- fornecer SVG inline minimalista no mesmo estilo de ícones custom (ver `measuresModeIcon` no toolbar)

---

## Atalhos de teclado (macOS + Windows)

### Copiar

- macOS: `⌘C`
- Windows/Linux: `Ctrl+C`

### Colar

- macOS: `⌘V`
- Windows/Linux: `Ctrl+V`

### Regras de captura

- **Nunca capturar** quando o foco estiver em inputs (`INPUT`, `TEXTAREA`, `SELECT`, `contentEditable`).
- No canvas, ao capturar:
  - se não existir nada copiável / nada no clipboard: não fazer nada
  - caso contrário: `preventDefault()` para evitar o comportamento nativo do browser

> Observação: `useToolShortcuts` ignora eventos com Ctrl/Cmd; portanto não há conflito com C (Circle) e V (Select).

---

## API interna (contratos sugeridos)

> Esta seção define o contrato esperado; a implementação pode variar, desde que cumpra o comportamento.

Adicionar ao contexto do editor (via `useEditor()`):

- `copySelection(): void`
- `paste(): void`
- `canCopy: boolean` (derivado)
- `canPaste: boolean` (derivado)

Armazenamento do clipboard:

- manter em memória (ex.: `useRef`) com a lista de figuras copiadas e metadata necessária (bbox e contador de paste).

---

## Casos de borda

- Seleção vazia: Copy desabilitado.
- Clipboard vazio: Paste desabilitado.
- Seleção contém base + seam: não duplicar seam (evitar incluir duas vezes).
- Seleção contém apenas seams: copiar/colar preserva geometria, mas remove vínculo ao pai no paste se o pai não for colado.
- Projeto em modo `embedded=1`: atalhos globais devem estar desabilitados (seguindo padrão atual); menu superior/toolbar não renderizam.

---

## Critérios de aceite

- Menu superior → Editar exibe Copiar/Colar com shortcuts corretos e estados disabled corretos.
- Toolbar lateral possui botões Copiar/Colar com ícones, tooltips e estados disabled.
- Cmd/Ctrl+C copia seleção; Cmd/Ctrl+V cola criando novas figuras.
- Paste gera novos IDs (figura/nós/arestas) e posiciona com offset incremental.
- Paste seleciona os itens colados.
- Colar é undoável em 1 passo.
- Copiar não altera histórico.
- Seam derivado:
  - copiar base também copia seam derivada
  - seam colada remapeia `parentId` quando o pai também foi colado
  - seam órfã não referencia o pai original

---

## Sugestão de testes (Playwright)

Criar/estender E2E para validar:

- Copiar/colar via teclado (Ctrl+C / Ctrl+V) em ambiente não-mac.
- Copiar/colar via clique (toolbar e menu).
- Multi-select copia e cola mantendo ordem e offset.
- Seam: criar base + seam (offset tool), copiar base e colar deve trazer seam junto.
