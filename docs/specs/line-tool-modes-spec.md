# Spec — Ferramenta Linha com Submodos

Data: 20/04/2026  
Status: Especificação funcional para implementação  
Escopo: Editor web (`components/editor/*`) + testes E2E (`tests/*`)

## Objetivo

Evoluir a ferramenta `Linha` do Inaá Studio para suportar dois submodos de desenho dentro da mesma ferramenta:

1. `Linha contínua`
2. `Linha simples`

O objetivo é preservar integralmente o fluxo atual de polilinha (`click click click enter`) e adicionar um fluxo alternativo, mais tradicional, para desenhar linhas simples de dois pontos (`click` para iniciar, `click` para concluir).

O usuário deve conseguir:

1. Selecionar a ferramenta `Linha` normalmente.
2. Ver um menu expandido com as duas opções de comportamento.
3. Trocar rapidamente entre os dois submodos.
4. Ter a última opção usada persistida como padrão local.
5. Continuar digitando o comprimento do segmento para travar a medida, como já ocorre hoje.

## Contexto atual

Hoje a ferramenta `Linha` possui um único comportamento, implementado sobre `lineDraft` em `Canvas.tsx`:

1. Primeiro clique inicia o draft.
2. Cliques seguintes adicionam segmentos.
3. `Enter` finaliza a figura aberta.
4. Clicar no primeiro nó fecha a figura.
5. `Backspace` remove o último ponto do draft.
6. `Escape` cancela o draft.

Pontos relevantes do código atual:

1. A toolbar tem apenas um botão único para `Linha` em `EditorToolbar.tsx`.
2. O atalho `L` ativa `tool === "line"` em `useToolShortcuts.ts`.
3. O `tool` atual é persistido apenas em memória; preferências globais ficam em `EditorContext.tsx`.
4. A infraestrutura de persistência local já existe para preferências como magnetismo, grid e overlays.
5. O tooltip atual da linha descreve um comportamento de “clique e arraste”, mas o comportamento real atual é polilinha por cliques.

## Escopo da entrega

### Incluído

1. Dois submodos para a ferramenta `Linha`: `single` e `continuous`.
2. Persistência local do submodo escolhido por último.
3. Botão principal da linha espelhando o ícone do submodo ativo.
4. Expansão do botão ao selecionar `Linha` pela toolbar.
5. Menu expandido com duas opções visuais, cada uma com ícone próprio.
6. Uso do atalho `L` respeitando o último submodo salvo.
7. Atualização de tooltip/textos de ajuda para refletir o submodo ativo.
8. Testes E2E cobrindo os dois submodos e a persistência da escolha.

### Fora do escopo

1. Criar uma segunda ferramenta independente no enum `Tool` além de `line`.
2. Persistir o submodo no projeto salvo (`design_data`).
3. Criar atalhos de teclado diferentes para cada submodo.
4. Alterar o comportamento da ferramenta `Curva`.
5. Redesenhar a toolbar inteira ou alterar seu layout global.

## Conceitos

### Novo tipo de estado

Adicionar um estado explícito para o comportamento da ferramenta de linha:

```ts
type LineToolMode = "continuous" | "single";
```

### Princípio estrutural

`Linha` continua sendo uma única ferramenta do editor:

```ts
tool === "line"
```

O submodo não cria uma nova ferramenta no domínio do editor; ele apenas modifica a semântica de operação enquanto `tool === "line"`.

## Requisitos funcionais

## 1. Comportamento do submodo `Linha contínua`

Este submodo deve preservar o comportamento atual sem regressão funcional.

### Regras

1. Primeiro clique inicia a figura.
2. Cliques seguintes adicionam novos segmentos.
3. `Enter` finaliza a figura aberta.
4. Clicar no nó inicial continua fechando a figura.
5. `Backspace` remove o último ponto do draft.
6. `Escape` cancela o draft.
7. A ferramenta permanece ativa após finalizar a figura.

### Recursos existentes que devem continuar funcionando

1. Snap/magnetismo.
2. `magnetJoin`.
3. Fechamento ao clicar no primeiro nó mesmo com `magnetJoin` ativo.
4. Trava angular com `Shift`.
5. Desenho “a partir do centro” com `Alt` no primeiro segmento.
6. Precisão incremental por teclado/modificadores já suportados.
7. Comprimento digitado do segmento.
8. Merge opcional via `addFigureWithOptionalMerge`.

### Regra explícita de não regressão

O mecanismo atual de digitar o comprimento do segmento durante o desenho da linha deve ser mantido no submodo `continuous` sem mudança de comportamento:

1. O usuário pode digitar um valor numérico enquanto o draft está ativo.
2. O segmento corrente deve ficar travado no comprimento informado.
3. O fluxo atual de aplicar/liberar a trava no segmento seguinte deve permanecer íntegro.
4. `Enter`, quando usado apenas para confirmar o valor digitado, continua funcionando como hoje.

## 2. Comportamento do submodo `Linha simples`

Este é o novo fluxo de linha de dois pontos.

### Regras principais

1. Primeiro clique inicia a linha.
2. O preview do segmento fica visível durante o movimento do cursor.
3. Segundo clique cria a figura e encerra imediatamente o draft.
4. A figura gerada deve ser aberta (`closed = false`) com exatamente:
   - 2 nós
   - 1 aresta
5. Após finalizar, a ferramenta continua ativa em `tool === "line"` e no mesmo submodo `single`.
6. O usuário pode iniciar outra linha simples imediatamente com um novo clique.

### Regras de teclado no modo simples

1. `Escape` cancela o draft em andamento.
2. `Backspace`, quando houver um draft iniciado e ainda não finalizado, cancela o draft.
3. `Enter` não é necessário para finalizar e não deve criar a linha.
4. Enquanto houver draft do modo simples, `Backspace` deve atuar sobre o draft, não sobre a figura selecionada.

### Regras de geometria e preview

1. O segundo clique não deve abrir um fluxo de polilinha; ele deve finalizar a figura imediatamente.
2. Clicar novamente muito próximo do primeiro ponto não deve gerar linha degenerada.
3. Fechamento ao clicar no primeiro nó não se aplica ao modo simples.

### Recursos herdados que devem continuar funcionando também no modo simples

1. Snap/magnetismo no ponto inicial e final.
2. `magnetJoin` para permitir iniciar/terminar em nós/arestas existentes.
3. Trava angular com `Shift` no preview e no segundo clique.
4. Desenho do primeiro segmento “a partir do centro” com `Alt`.
5. Comprimento digitado do segmento enquanto o draft estiver ativo.
6. Merge opcional via `addFigureWithOptionalMerge`.

### Regra explícita de comprimento digitado no modo simples

No submodo `single`, a trava por comprimento digitado também deve ser mantida:

1. Após o primeiro clique, o usuário pode digitar um valor numérico para definir o comprimento do segmento.
2. O preview da linha deve refletir a trava de comprimento.
3. O segundo clique deve concluir a linha respeitando o comprimento travado.
4. Após a criação da linha, a trava deve ser liberada para a próxima operação, preservando o comportamento já validado hoje para a linha contínua.

## 3. Comportamento da toolbar

## 3.1 Botão principal

O botão principal continua ocupando a posição atual da ferramenta `Linha` na toolbar.

### Regras

1. O botão principal deve sempre espelhar o ícone do submodo ativo.
2. O `aria-label` base continua sendo `Linha`.
3. O tooltip do botão principal deve refletir o submodo ativo.
4. O botão principal continua ativando `tool === "line"`.

### Tooltip esperado

Quando o submodo ativo for `Linha contínua`:

1. Título: `Linha contínua`
2. Shortcut principal: `L`
3. Texto explicativo coerente com policlick + `Enter`

Quando o submodo ativo for `Linha simples`:

1. Título: `Linha simples`
2. Shortcut principal: `L`
3. Texto explicativo coerente com `click` para iniciar + `click` para concluir

## 3.2 Expansão do botão

Ao selecionar a ferramenta `Linha` pela toolbar, o botão deve expandir um menu de submodos.

### Forma da expansão

1. A expansão deve ocorrer como um flyout/popover à direita do botão, sem empurrar o layout da toolbar.
2. O flyout deve conter exatamente 2 opções:
   - `Linha simples`
   - `Linha contínua`
3. Cada opção deve mostrar:
   - ícone
   - rótulo
   - estado ativo

### Regras de abertura

1. Ao clicar no botão `Linha` vindo de outra ferramenta, o editor deve:
   - ativar `tool === "line"` usando o submodo persistido
   - abrir o flyout com as duas opções
2. Ao clicar no botão `Linha` quando `tool === "line"` já está ativo, o flyout deve abrir novamente para permitir troca de submodo.
3. Ao ativar `Linha` via atalho `L`, o flyout não precisa abrir automaticamente.

### Regras de fechamento

O flyout deve fechar quando:

1. O usuário escolher uma das opções.
2. O usuário clicar fora do flyout.
3. O usuário trocar para outra ferramenta.
4. O usuário pressionar `Escape` sem draft ativo da linha.

## 3.3 Estado visual das opções

1. A opção ativa deve ficar destacada visualmente.
2. O botão principal deve manter o ícone do submodo ativo também depois que o flyout fechar.
3. A troca de submodo deve ser imediata e persistente.

## 4. Persistência da escolha do usuário

## 4.1 Regra de persistência

A última opção escolhida pelo usuário deve ser mantida como padrão até que ele a troque novamente.

### Escopo da persistência

1. Persistência local por navegador/dispositivo.
2. Não depende do projeto atual.
3. Não depende do usuário autenticado.

### Chave sugerida

```ts
localStorage["inaa:lineToolMode"]
```

### Valores válidos

```ts
"continuous" | "single"
```

### Default

Se não existir valor salvo, o padrão deve ser:

```ts
"continuous"
```

### Regras

1. Selecionar um submodo no flyout deve atualizar imediatamente o `localStorage`.
2. Recarregar a página deve restaurar a última escolha.
3. Clicar no botão principal da linha depois deve usar a escolha restaurada.
4. Pressionar `L` deve usar a escolha restaurada.

## 5. Regras de troca de submodo

Se o usuário trocar de `Linha contínua` para `Linha simples` ou vice-versa enquanto existir um `lineDraft` em andamento:

1. O draft atual deve ser cancelado imediatamente.
2. O sistema deve limpar qualquer estado transitório relacionado ao segmento:
   - `lineDraft`
   - input de comprimento do segmento
   - preview live
3. A troca não deve gerar figura parcial.

Racional:

1. Evita reinterpretar um draft iniciado em um fluxo como se fosse do outro.
2. Mantém a troca de modo previsível.

## 6. Regras de atalho `L`

O atalho `L` continua existindo e continua ativando `tool === "line"`.

### Novo comportamento esperado

1. `L` não escolhe mais “o único modo da linha”.
2. `L` ativa `Linha` usando o último `lineToolMode` persistido.
3. `L` não precisa abrir o flyout.

## 7. Ícones

## 7.1 Requisito

Cada submodo deve possuir um ícone próprio e distinguível.

## 7.2 Diretriz visual

### `Linha simples`

Representação sugerida:

1. Um único segmento entre dois nós.
2. Visual limpo, sem indicação de continuidade.

Semântica visual esperada:

1. “uma linha única”
2. “dois pontos”

### `Linha contínua`

Representação sugerida:

1. Uma polilinha com pelo menos 3 nós.
2. Dois segmentos conectados.

Semântica visual esperada:

1. “sequência de cliques”
2. “continuidade”

## 7.3 Implementação sugerida

Expandir o sistema atual de ícones customizados em `ToolCursorIcons.tsx` com duas variantes novas, por exemplo:

```ts
"lineSingle"
"lineContinuous"
```

ou criar helper específico no toolbar, desde que:

1. o botão principal espelhe o submodo ativo
2. o flyout consiga renderizar os dois ícones distintos

Observação:

1. O cursor overlay do editor pode permanecer usando o ícone genérico atual de `line`; espelhamento do cursor não é requisito desta entrega.

## 8. Contrato interno sugerido

Adicionar ao contexto do editor:

```ts
type LineToolMode = "continuous" | "single";

lineToolMode: LineToolMode;
setLineToolMode: (mode: LineToolMode) => void;
```

### Responsabilidades por camada

#### `EditorContext.tsx`

1. Guardar `lineToolMode`.
2. Ler valor inicial do `localStorage`.
3. Persistir mudanças no `localStorage`.
4. Expor `lineToolMode` e `setLineToolMode` no contexto.

#### `EditorToolbar.tsx`

1. Ler `lineToolMode` atual.
2. Renderizar botão principal com ícone espelhado.
3. Renderizar flyout com as duas opções.
4. Abrir e fechar o flyout conforme as regras desta spec.
5. Acionar `setLineToolMode(...)` ao trocar a opção.

#### `useToolShortcuts.ts`

1. Continuar chamando `setTool("line")` ao receber `KeyL`.
2. Não criar nova tecla para os submodos.

#### `Canvas.tsx`

1. Ler `lineToolMode`.
2. Rotear o comportamento da ferramenta `line` entre os fluxos `continuous` e `single`.
3. Cancelar drafts ao trocar de submodo.
4. Preservar o fluxo atual em `continuous`.
5. Finalizar automaticamente no segundo clique em `single`.

## 9. Impacto esperado no código

Arquivos que devem ser avaliados na implementação:

1. `components/editor/types.ts`
2. `components/editor/EditorContext.tsx`
3. `components/editor/EditorToolbar.tsx`
4. `components/editor/ToolCursorIcons.tsx`
5. `components/editor/Canvas.tsx`
6. `components/editor/useToolShortcuts.ts`
7. `tests/line.tool.spec.ts`
8. novos testes E2E dedicados ao submodo simples/persistência

## 10. Regras detalhadas por cenário

## 10.1 Selecionar a linha vindo de outra ferramenta

1. Usuário está em qualquer outra ferramenta.
2. Clica no botão `Linha`.
3. Editor ativa `tool === "line"` com o submodo persistido.
4. Flyout abre mostrando as duas opções.
5. Se o usuário não trocar a opção, continua usando o modo persistido.

## 10.2 Trocar submodo com a linha já ativa

1. Usuário está em `tool === "line"`.
2. Clica no botão `Linha`.
3. Flyout abre.
4. Usuário escolhe outro submodo.
5. `lineToolMode` muda imediatamente.
6. Nova escolha é persistida.
7. Botão principal troca de ícone.

## 10.3 Desenhar linha simples

1. Usuário entra em `Linha simples`.
2. Faz o primeiro clique.
3. Preview acompanha o cursor.
4. Faz o segundo clique.
5. Editor cria uma figura aberta com 2 nós e 1 aresta.
6. Draft é limpo.
7. Ferramenta continua ativa em `Linha simples`.

## 10.4 Desenhar linha contínua

1. Usuário entra em `Linha contínua`.
2. Faz múltiplos cliques.
3. Finaliza com `Enter` ou fecha clicando no nó inicial.
4. Fluxo deve continuar idêntico ao atual.

## 10.5 Recarregar a página

1. Usuário escolhe `Linha simples`.
2. Recarrega a página.
3. Clica em `Linha`.
4. Botão principal deve mostrar o ícone de `Linha simples`.
5. A operação deve entrar no submodo `single`.

## 11. Casos de borda

1. `localStorage` com valor inválido:
   - fallback para `continuous`
2. Troca de submodo com draft em andamento:
   - cancelar draft
3. Segundo clique do modo simples muito próximo do primeiro:
   - não criar linha degenerada
4. `embedded=1`:
   - toolbar não aparece; comportamento relevante fica limitado ao estado/restauração interna e ao atalho se ele estiver habilitado no contexto daquela tela
5. `readOnly`:
   - não deve permitir ativação operacional da linha; seguir regra atual do editor

## 12. Critérios de aceite

1. A ferramenta `Linha` passa a oferecer `Linha simples` e `Linha contínua`.
2. O submodo `Linha contínua` continua funcionando exatamente como hoje.
3. O submodo `Linha simples` cria uma linha com dois cliques e encerra automaticamente o desenho daquela figura.
4. O botão principal da linha espelha o ícone do submodo ativo.
5. Ao selecionar `Linha` pela toolbar, o flyout mostra as duas opções.
6. A última opção escolhida pelo usuário persiste em `localStorage`.
7. O atalho `L` respeita o último submodo salvo.
8. Trocar de submodo com draft em andamento não gera figura parcial.
9. Tooltips e textos do botão `Linha` passam a refletir corretamente o submodo ativo.
10. A função de digitar o comprimento da linha para travar a medida continua funcionando nos dois submodos.

## 13. Plano mínimo de testes

## 13.1 Regressão do modo contínuo

Manter e/ou adaptar os testes já existentes de `tests/line.tool.spec.ts` para garantir:

1. `Enter` com 1 ponto cancela.
2. Clicar no primeiro nó fecha a figura.
3. `Enter` com 2 pontos não duplica nós.
4. Comprimento digitado continua funcionando.
5. Preview continua correto.
6. Fechamento com `magnetJoin` continua funcionando.

## 13.2 Novos testes do modo simples

Adicionar E2E cobrindo:

1. Seleção explícita de `Linha simples` pela toolbar.
2. Primeiro clique inicia draft.
3. Segundo clique finaliza a linha automaticamente.
4. Figura resultante tem:
   - `tool === "line"`
   - `closed === false`
   - `nodes.length === 2`
   - `edges.length === 1`
5. Após finalizar, um terceiro clique inicia nova linha, não continua a anterior.
6. `Escape` cancela draft simples.
7. `Backspace` cancela draft simples.
8. `Enter` não deve ser necessário nem deve criar linha no modo simples.

## 13.3 Persistência

Adicionar E2E cobrindo:

1. Usuário escolhe `Linha simples`.
2. Recarrega a página.
3. Botão principal reflete `Linha simples`.
4. `L` ativa `tool === "line"` no modo `single`.
5. Repetir o mesmo fluxo para `Linha contínua`.

## 14. Observações de implementação

1. Não alterar o enum de ferramentas para `lineSimple` / `lineContinuous`; isso aumentaria o impacto em seleção, atalhos, cursores e testes sem necessidade.
2. O submodo deve ser tratado como preferência operacional da ferramenta `line`.
3. O wording do tooltip atual da linha precisa ser corrigido independentemente da implementação do flyout, porque hoje ele já não descreve o comportamento real da ferramenta.
4. Para reduzir regressão, a implementação do modo simples deve reaproveitar o máximo possível da resolução já existente do primeiro segmento da linha atual.
