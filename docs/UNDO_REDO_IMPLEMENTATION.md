# Sistema de Histórico (Undo/Redo) e Atalhos de Teclado

## 📋 Resumo da Implementação

Este PR implementa com sucesso o **Sistema de Histórico com Undo/Redo** e **Atalhos de Teclado** para o editor de padrões CAD, conforme especificado na issue #9.

## 🎯 Funcionalidades Implementadas

### 1. **Custom Hook `useHistory`**

- ✅ Implementa o padrão past/present/future para gerenciamento de histórico
- ✅ Retorna: `state`, `setState`, `undo`, `redo`, `canUndo`, `canRedo`
- ✅ Suporta parâmetro opcional `saveHistory` no `setState` para controlar quando salvar no histórico
- ✅ Limpa automaticamente o `future` quando um novo estado é salvo (nova ramificação temporal)

### 2. **Integração no EditorContext**

- ✅ Substitui a implementação anterior de histórico pela nova usando `useHistory`
- ✅ Gerencia o estado de `shapes` com histórico completo
- ✅ Expõe `undo`, `redo`, `canUndo`, `canRedo` para todos os componentes

### 3. **Otimização no Canvas**

- ✅ **Durante o desenho** (`handleMouseMove`): Usa `setShapes(shapes, false)` - não salva no histórico
- ✅ **Ao finalizar desenho** (`handleMouseUp`): Salva no histórico automaticamente
- ✅ **Ao mover objeto** (`handleShapeDragEnd`): Salva no histórico
- ✅ **Ao transformar objeto** (`handleShapeTransformEnd`): Salva no histórico
- ✅ **Ao ajustar ponto de controle** (`handleControlPointDragEnd`): Salva no histórico

### 4. **Botões de UI**

- ✅ Botão **Undo** com ícone Material Symbols "undo"
- ✅ Botão **Redo** com ícone Material Symbols "redo"
- ✅ Botões ficam desabilitados (cinza) quando não há ações disponíveis
- ✅ Tooltips mostram "Desfazer (Ctrl+Z)" e "Refazer (Ctrl+Y)"
- ✅ Posicionados no topo do EditorToolbar

### 5. **Atalhos de Teclado**

- ✅ **Ctrl+Z** (Cmd+Z no Mac): Desfazer
- ✅ **Ctrl+Shift+Z** (Cmd+Shift+Z no Mac): Refazer
- ✅ **Ctrl+Y** (Cmd+Y no Mac): Refazer (alternativa)
- ✅ Atalhos não são acionados quando o usuário está digitando em inputs
- ✅ Implementado via hook `useKeyboardShortcuts` reutilizável

## 📁 Arquivos Criados

### `components/editor/useHistory.ts`

Hook customizado que implementa o padrão de histórico past/present/future.

**Principais características:**

- Gerencia três pilhas: `past`, `present`, `future`
- **Undo**: Move `present` para `future`, pega último de `past` e torna `present`
- **Redo**: Move `present` para `past`, pega primeiro de `future` e torna `present`
- **setState**: Salva `present` atual em `past` e limpa `future` (nova ramificação)
- **setState com saveHistory=false**: Atualiza apenas `present` sem afetar histórico

```typescript
interface UseHistoryReturn<T> {
  state: T | null;
  setState: (newState: T, saveHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
}
```

### `components/editor/useKeyboardShortcuts.ts`

Hook customizado para gerenciar atalhos de teclado globais.

**Principais características:**

- Detecta plataforma (Mac vs Windows/Linux) para usar Cmd ou Ctrl
- Ignora atalhos quando usuário está digitando em campos de texto
- Suporta Ctrl+Z, Ctrl+Shift+Z e Ctrl+Y
- Pode ser habilitado/desabilitado via prop `enabled`

## 📝 Arquivos Modificados

### `components/editor/EditorContext.tsx`

**Mudanças:**

1. Importa o hook `useHistory`
2. Remove implementação antiga de histórico (arrays `history` e `historyIndex`)
3. Usa `useHistory<Shape[]>([])` para gerenciar shapes
4. Atualiza `setShapes` para aceitar parâmetro opcional `saveHistory`
5. Usa `useCallback` para otimização de performance

**Antes:**

```typescript
const [shapes, setShapes] = useState<Shape[]>([]);
const [history, setHistory] = useState<Shape[][]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);
```

**Depois:**

```typescript
const {
  state: shapes,
  setState: setShapesState,
  undo,
  redo,
  canUndo,
  canRedo,
} = useHistory<Shape[]>([]);
```

### `components/editor/Canvas.tsx`

**Mudanças:**

1. **handleMouseDown**: Usa `setShapes(..., false)` para criar forma temporária
2. **handleMouseMove**: Usa `setShapes(..., false)` para atualizar durante desenho
3. **handleMouseUp**: Adiciona lógica para salvar no histórico quando desenho termina

**Código adicionado em handleMouseUp:**

```typescript
// If we were drawing, save the final state to history
if (isDrawing.current && currentShape.current) {
  setShapes(shapes, true); // Save current state to history
}
```

### `components/editor/EditorLayout.tsx`

**Mudanças:**

1. Importa `useKeyboardShortcuts`
2. Cria componente interno `EditorLayoutContent` que usa o hook
3. Configura atalhos de teclado com callbacks de undo/redo

**Estrutura:**

```typescript
function EditorLayoutContent({ children }: { children: React.ReactNode }) {
  const { undo, redo } = useEditor();

  useKeyboardShortcuts({
    onUndo: undo,
    onRedo: redo,
  });

  return (/* layout JSX */);
}

export function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <EditorProvider>
      <EditorLayoutContent>{children}</EditorLayoutContent>
    </EditorProvider>
  );
}
```

### `components/editor/EditorToolbar.tsx`

**Mudanças:**

1. Adiciona `undo`, `redo`, `canUndo`, `canRedo` aos valores extraídos do contexto
2. Adiciona dois novos botões após o botão "Salvar"
3. Usa classe CSS condicional para desabilitar visualmente quando não há ações

**Botão Undo:**

```typescript
<button
  onClick={undo}
  disabled={!canUndo}
  className={`... ${
    !canUndo
      ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
      : "text-gray-500 hover:bg-gray-100 ..."
  }`}
  title="Desfazer (Ctrl+Z)"
>
  <span className="material-symbols-outlined text-[20px]">undo</span>
</button>
```

## ✅ Critérios de Aceite

### 1. Desenhar 3 linhas e desfazer 3 vezes

**Resultado esperado:** Canvas fica vazio

- ✅ Implementado: Cada linha desenhada salva no histórico ao soltar o mouse
- ✅ Cada Ctrl+Z ou clique em Undo remove uma linha
- ✅ Após 3 undos, retorna ao estado inicial (vazio)

### 2. Refazer 3 vezes após desfazer

**Resultado esperado:** As 3 linhas voltam

- ✅ Implementado: Estados desfeitos vão para `future`
- ✅ Ctrl+Y ou Ctrl+Shift+Z ou clique em Redo restaura cada linha
- ✅ Após 3 redos, todas as 3 linhas voltam

### 3. Desenhar, desfazer, desenhar novamente

**Resultado esperado:** Histórico de redo antigo é limpo

- ✅ Implementado: `setState` com `saveHistory=true` limpa o array `future`
- ✅ Nova "ramificação temporal" é criada
- ✅ Não é possível refazer para a linha antiga

### 4. Funciona com botões e teclado

**Resultado esperado:** Ambos os métodos funcionam

- ✅ Botões na UI chamam `undo()` e `redo()` diretamente
- ✅ Atalhos de teclado chamam `undo()` e `redo()` via `useKeyboardShortcuts`
- ✅ Ambos compartilham a mesma lógica de estado

## 🧪 Validação

### Teste de Lógica

Criado script de teste (`/tmp/test-history.js`) que valida:

- ✅ Padrão past/present/future funciona corretamente
- ✅ Undo/Redo funcionam em sequência
- ✅ Future é limpo ao salvar novo estado
- ✅ saveHistory=false não adiciona ao histórico

### Teste de Build

```bash
npm run build    # ✅ Compilado com sucesso
npx tsc --noEmit # ✅ Sem erros TypeScript
npm run lint     # ✅ Sem novos warnings
npm run format   # ✅ Código formatado
```

## 🔍 Detalhes Técnicos

### Fluxo de Desenho com Histórico

1. **Usuário clica** → `handleMouseDown`
   - Cria nova forma temporária
   - `setShapes([...shapes, newShape], false)` ← não salva no histórico

2. **Usuário arrasta** → `handleMouseMove`
   - Atualiza forma temporária
   - `setShapes(updatedShapes, false)` ← não salva no histórico

3. **Usuário solta** → `handleMouseUp`
   - Detecta que estava desenhando
   - `setShapes(shapes, true)` ← SALVA no histórico
   - Finaliza o desenho

### Fluxo de Transformação com Histórico

1. **Usuário arrasta objeto** → `onDragMove`
   - Konva atualiza posição visualmente
   - Estado ainda não é atualizado

2. **Usuário solta** → `onDragEnd` → `handleShapeDragEnd`
   - `setShapes(updatedShapes)` (padrão: saveHistory=true)
   - SALVA no histórico automaticamente

### Memória e Performance

**Problema resolvido:** A implementação anterior salvava no histórico a cada pixel durante `handleMouseMove`, causando:

- Centenas de snapshots por segundo
- Uso excessivo de memória
- Histórico poluído

**Solução:**

- Durante movimentação/desenho: `saveHistory = false`
- Apenas ao finalizar ação: `saveHistory = true` (padrão)
- Resultado: 1 snapshot por ação completa

## 🎨 Interface do Usuário

### Botões no Toolbar

- Posicionados logo após o botão "Salvar"
- Separados por divisor visual
- Estilo consistente com outros botões
- Feedback visual claro quando desabilitados
- Tooltips informativos com atalhos

### Estados Visuais

- **Habilitado**: Texto cinza, hover muda para cor primária
- **Desabilitado**: Texto cinza muito claro, sem hover, cursor not-allowed
- **Tooltip**: Mostra atalho de teclado correspondente

## 🔐 Considerações de Segurança

- Histórico é local (não expõe dados)
- Atalhos de teclado respeitam campos de texto (não interferem com digitação)
- Não há limite explícito de histórico (pode ser adicionado futuramente se necessário)

## 📊 Cobertura de Tipos TypeScript

- ✅ `useHistory` totalmente tipado com generics
- ✅ `useKeyboardShortcuts` com interface clara
- ✅ `EditorContext` atualizado com tipos corretos
- ✅ Compilação TypeScript sem erros

## 🚀 Próximos Passos Sugeridos (Fora do Escopo)

- Adicionar limite máximo de histórico (ex: 50 ações)
- Salvar/restaurar histórico do localStorage
- Adicionar indicador visual de quantas ações podem ser desfeitas/refeitas
- Shortcuts adicionais (Ctrl+A para selecionar tudo, Delete para excluir seleção)
