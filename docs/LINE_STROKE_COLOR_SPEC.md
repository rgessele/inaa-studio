# Spec - Cor da Linha no Editor

Data: 02/05/2026  
Status: Especificação funcional pronta para implementação  
Escopo: Editor web (`components/editor/*`), persistência de projeto, exportação e testes E2E  
Pedido original: adicionar uma ferramenta/opção para escolher a cor da linha dos desenhos, aplicar antes de desenhar e editar depois por figura inteira ou por aresta individual.

## Objetivo

Adicionar ao Inaá Studio um controle de cor da linha dos desenhos, inspirado no seletor de cores do Photoshop, mas limitado apenas ao `stroke` das figuras.

O usuário deve conseguir:

1. Escolher uma cor antes de iniciar um desenho.
2. Desenhar figuras novas usando a cor previamente selecionada.
3. Selecionar uma figura já desenhada e alterar a cor de todas as suas linhas.
4. Selecionar uma aresta individual e alterar apenas a cor dessa aresta.
5. Escolher cor em um color picker completo, com área visual de saturação/valor, slider de matiz, RGB, HSB/HSV e HEX.
6. Reutilizar rapidamente as 10 últimas cores usadas.

## Contexto atual

O modelo atual do editor já possui `stroke` por figura:

```ts
interface Figure {
  stroke: string;
  strokeWidth: number;
  edges: FigureEdge[];
}
```

Pontos importantes já existentes:

1. A maioria das figuras novas é criada em `Canvas.tsx` com `stroke: "aci7"`.
2. `aci7` é uma cor automática que resolve para preto no tema claro e branco no tema escuro.
3. `FigureRenderer.tsx` hoje recebe um único `stroke` para renderizar a figura.
4. O editor já tem `selectedFigureIds`, `selectedFigureId` e `selectedEdge`.
5. A seleção de aresta já existe e deve ser reaproveitada.
6. O painel de propriedades já mostra uma seção de `Aresta` quando existe `selectedEdge`.
7. Preferências locais já usam `localStorage` em `EditorContext.tsx`, por exemplo modo de linha, magnetismo e overlays.

## Escopo incluido

1. Novo controle de `Cor da linha` na interface do editor.
2. Estado de cor ativa para os próximos desenhos.
3. Histórico local das últimas 10 cores usadas.
4. Presets/swatchs de cores comuns.
5. Entrada HEX.
6. Entrada RGB.
7. Entrada HSB/HSV.
8. Área visual customizada de saturação/valor.
9. Slider customizado de matiz.
10. Preview de cor anterior e nova cor.
11. Aplicação de cor em seleção de figura.
12. Aplicação de cor em seleção de aresta.
13. Renderização de cores diferentes por aresta.
14. Persistência da cor no projeto salvo.
15. Exportação respeitando cores por figura e por aresta.
16. Undo/Redo para alterações de cor em figuras existentes.
17. Testes automatizados cobrindo os fluxos principais.

## Fora do escopo

1. Alterar preenchimento (`fill`) das figuras.
2. Alterar espessura da linha.
3. Alterar cor de texto (`textFill`), pois já existe controle próprio para texto.
4. Criar bibliotecas globais de paletas por usuário no banco.
5. Compartilhar histórico de cores entre dispositivos.
6. Alterar cores semânticas de grid, réguas, guias, seleção, preview, margem de costura e bainha, mesmo quando esses elementos estiverem selecionados.
7. Transparência/alpha da linha. A primeira versão deve trabalhar com cores opacas em RGB.
8. Gerenciamento avançado de cor para impressão, como CMYK, Lab ou perfis ICC.

## Conceitos

### Cor ativa

A cor ativa é a cor escolhida no seletor e usada como padrão para o próximo desenho.

Regras:

1. Se o usuário muda a cor sem seleção ativa, apenas a cor ativa muda.
2. Se o usuário muda a cor com figura selecionada, a figura muda e essa cor também vira a cor ativa.
3. Se o usuário muda a cor com aresta selecionada, a aresta muda e essa cor também vira a cor ativa.
4. A cor ativa deve persistir localmente entre recarregamentos do navegador.

### Cor efetiva

A cor efetiva de uma aresta é:

1. `edge.stroke`, quando a aresta tiver cor própria.
2. `figure.stroke`, quando a aresta não tiver cor própria.
3. `aci7`, como fallback para projetos antigos ou dados incompletos.

Exceção: figuras técnicas protegidas de margem de costura e bainha não usam a cor ativa da ferramenta. Elas continuam usando suas cores semânticas próprias.

### Seleção de figura

Quando não existe `selectedEdge`, a alteração de cor deve agir sobre a seleção de figuras.

Regras:

1. Se `selectedFigureIds.length > 0`, aplicar em todas as figuras selecionadas.
2. Se houver apenas `selectedFigureId`, aplicar nessa figura.
3. Ao aplicar cor em uma figura inteira, todas as arestas devem ficar com a mesma cor.
4. Para garantir isso, a implementação deve atualizar `figure.stroke` e remover sobrescritas individuais de `edge.stroke`.
5. Figuras técnicas protegidas de margem de costura e bainha devem ser ignoradas.

### Seleção de aresta

Quando existe `selectedEdge`, a alteração de cor deve agir apenas na aresta selecionada.

Regras:

1. A aresta selecionada tem prioridade sobre a figura selecionada.
2. Apenas `selectedEdge.edgeId` dentro de `selectedEdge.figureId` deve ser alterada.
3. As outras arestas continuam com suas cores atuais.
4. A figura deve continuar selecionada visualmente como hoje.
5. A aresta alterada deve continuar selecionada após aplicar a cor.
6. Se a aresta selecionada pertencer a margem de costura ou bainha, a ferramenta não deve aplicar cor.

### Figuras tecnicas protegidas

A ferramenta de cor da linha não deve modificar figuras derivadas de margem de costura nem de bainha.

Devem ser consideradas protegidas:

1. Figuras `kind === "seam"` com `derivedRole === "seamAllowance"`.
2. Figuras `kind === "seam"` com `derivedRole === "hem"`.
3. Figuras identificadas pelos helpers existentes como margem de costura ou bainha, por exemplo `isSeamAllowanceFigure(...)` e `isHemFigure(...)`.

Regras:

1. A cor ativa não altera a cor dessas figuras.
2. Selecionar uma margem de costura e escolher uma cor deve ser uma operação sem efeito sobre ela.
3. Selecionar uma bainha e escolher uma cor deve ser uma operação sem efeito sobre ela.
4. Selecionar uma aresta de margem de costura ou bainha e escolher uma cor deve ser uma operação sem efeito sobre essa aresta.
5. Em multi-seleção, figuras editáveis devem receber a cor, mas margem de costura e bainha devem permanecer inalteradas.
6. Se a seleção contiver apenas margem de costura e/ou bainha, aplicar cor não deve criar entrada no histórico de Undo/Redo.
7. O popover pode continuar habilitado para definir a próxima cor ativa, mas deve indicar que a seleção atual não é editável quando só houver figuras protegidas.

## UX

## 1. Local do controle

Adicionar um botão de `Cor da linha` na toolbar do editor, próximo às ferramentas de desenho ou em um grupo visual de estilo.

O botão deve mostrar:

1. Ícone de linha/caneta ou swatch de contorno.
2. A cor ativa atual como amostra visual.
3. Tooltip: `Cor da linha`.
4. Estado desabilitado quando o editor estiver em modo somente leitura.

Test id sugerido:

```txt
stroke-color-button
```

## 2. Popover do seletor

Ao clicar no botão, abrir um popover sem deslocar o layout da toolbar.

Conteúdo esperado:

1. Preview lado a lado da cor anterior e da cor nova.
2. Área principal customizada de saturação/valor.
3. Slider de matiz (`Hue`) com espectro completo.
4. Presets de cores comuns.
5. Histórico das últimas 10 cores usadas.
6. Campos RGB.
7. Campos HSB/HSV.
8. Campo HEX.
9. Botões `Aplicar` e `Cancelar`, quando houver seleção ativa.
10. Ação de commit imediato para presets e cores recentes.

Test ids sugeridos:

```txt
stroke-color-popover
stroke-color-previous-swatch
stroke-color-current-swatch
stroke-color-sv-area
stroke-color-sv-handle
stroke-color-hue-slider
stroke-color-hue-handle
stroke-color-hex-input
stroke-color-r-input
stroke-color-g-input
stroke-color-b-input
stroke-color-h-input
stroke-color-s-input
stroke-color-v-input
stroke-color-preset-{index}
stroke-color-recent-{index}
stroke-color-apply
stroke-color-cancel
```

## 3. Color picker completo

O seletor deve ser um color picker completo para cores opacas de linha. Ele deve ser inspirado na experiência do Photoshop: a pessoa escolhe visualmente a cor em uma área de saturação/valor, ajusta a matiz em um slider dedicado e pode refinar o valor em campos numéricos.

Não é aceitável implementar apenas um `input type="color"` nativo como experiência principal. O `input type="color"` pode existir apenas como fallback técnico ou acessibilidade adicional, mas a interface principal deve ser customizada e consistente com o editor.

Requisitos obrigatórios:

1. Área `SV`/`SB` bidimensional:
   - eixo X controla saturação de 0% a 100%;
   - eixo Y controla valor/brilho de 100% a 0%;
   - o fundo da área muda conforme a matiz atual;
   - um handle circular indica a posição atual.
2. Slider de matiz:
   - deve cobrir 0 a 360 graus;
   - deve mostrar o espectro completo;
   - um handle indica a matiz atual.
3. Campos RGB:
   - `R`, `G`, `B`, de 0 a 255.
4. Campos HSB/HSV:
   - `H`, de 0 a 360;
   - `S`, de 0 a 100%;
   - `B` ou `V`, de 0 a 100%.
5. Campo HEX:
   - valor normalizado em `#rrggbb`.
6. Preview duplo:
   - cor anterior;
   - cor nova em edição.
7. Swatches:
   - presets fixos;
   - últimas 10 cores usadas.
8. Commit controlado:
   - arrastar handles atualiza preview ao vivo;
   - soltar o mouse/touch ou pressionar `Aplicar` confirma;
   - `Cancelar` restaura a cor anterior quando houver seleção ativa.

Requisitos de interação:

1. Arrastar na área `SV` atualiza saturação/valor continuamente.
2. Arrastar o slider de matiz atualiza a área `SV` e o preview continuamente.
3. Clicar em qualquer ponto da área `SV` move o handle para aquele ponto.
4. Clicar em qualquer ponto do slider de matiz move o handle para aquela matiz.
5. Teclas de seta devem ajustar o controle focado:
   - `ArrowLeft`/`ArrowRight` ajustam saturação ou matiz;
   - `ArrowUp`/`ArrowDown` ajustam valor/brilho;
   - `Shift` aumenta o passo.
6. `Enter` confirma o campo em foco.
7. `Escape` cancela a edição em andamento e fecha o popover.
8. Campos inválidos não devem aplicar cor nem atualizar histórico.

Requisitos visuais:

1. O popover deve caber em telas pequenas sem cortar controles.
2. Em desktop, o picker pode ter layout compacto em duas colunas: área visual à esquerda, campos e swatches à direita.
3. Em mobile, o layout deve empilhar controles sem sobreposição.
4. O handle deve ter borda com contraste em cores claras e escuras.
5. O preview deve mostrar claramente branco, preto e cores de baixo contraste.
6. O picker deve funcionar em tema claro e escuro.

Observação sobre eyedropper:

1. Um eyedropper/amostrador pode ser adicionado se for simples usar a EyeDropper API do navegador.
2. Ele não é obrigatório para aceitar a primeira versão do color picker completo.
3. Se implementado, deve aparecer como ação secundária e respeitar browsers sem suporte.

## 4. Presets de cor

O popover deve oferecer swatches iniciais. O primeiro swatch é obrigatório e deve ser a cor original da ferramenta antes desta implementação: `aci7`/`Auto`.

Regras do preset `Auto`:

1. Deve ocupar `stroke-color-preset-0`.
2. Deve aparecer antes de qualquer cor sólida.
3. Deve aplicar `stroke: "aci7"` e `strokeMode: "auto"`.
4. Deve resolver visualmente para preto no tema claro e branco no tema escuro.
5. Não deve ser salvo no histórico de cores recentes.

Paleta sugerida:

```txt
Auto (aci7)
#000000
#ffffff
#ef4444
#f97316
#facc15
#22c55e
#14b8a6
#3b82f6
#6366f1
#a855f7
#ec4899
#6b7280
```

## 5. Histórico de cores

O histórico deve guardar as últimas 10 cores sólidas usadas.

Regras:

1. Persistir em `localStorage`.
2. Chave sugerida: `inaa:strokeColor.recent`.
3. Guardar array JSON de HEX normalizado.
4. Normalizar para `#rrggbb`.
5. Remover duplicatas.
6. Mover a cor mais recente para o início.
7. Limitar a 10 itens.
8. Não adicionar `aci7` ao histórico de cores sólidas, caso o modo automático exista.
9. Não salvar cada movimento intermediário do seletor customizado como uma nova cor.
10. Adicionar ao histórico apenas no commit da cor: swatch click, Enter, blur, mouseup/pointerup ou confirmação.

Exemplo:

```json
["#ef4444", "#3b82f6", "#000000"]
```

## 6. Estados mistos

Quando a seleção tiver mais de uma cor efetiva:

1. O swatch do botão pode mostrar a cor ativa atual.
2. O popover deve indicar estado misto visualmente, por exemplo com swatch dividido ou texto curto `Misto`.
3. Ao escolher uma nova cor, todas as figuras selecionadas ou a aresta selecionada devem receber a nova cor.

Casos de estado misto:

1. Múltiplas figuras selecionadas com cores diferentes.
2. Uma figura selecionada que possui arestas com cores diferentes.
3. Figura com `figure.stroke` diferente de uma ou mais `edge.stroke`.

## Modelo de dados proposto

## 1. Aresta com cor propria

Adicionar `stroke` opcional em `FigureEdge`:

```ts
export interface FigureEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  stroke?: string;
}
```

Sem `edge.stroke`, a aresta herda `figure.stroke`.

Exemplo de figura com uma aresta vermelha:

```json
{
  "id": "fig_1",
  "tool": "rectangle",
  "stroke": "#111827",
  "strokeWidth": 2,
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2", "kind": "line" },
    {
      "id": "e2",
      "from": "n2",
      "to": "n3",
      "kind": "line",
      "stroke": "#ef4444"
    },
    { "id": "e3", "from": "n3", "to": "n4", "kind": "line" },
    { "id": "e4", "from": "n4", "to": "n1", "kind": "line" }
  ]
}
```

## 2. Preto explicito versus aci7

Hoje o renderer trata `#000000` como `aci7` por compatibilidade com projetos antigos. A nova ferramenta precisa permitir preto explícito.

Recomendação de implementação:

1. Manter `aci7` como modo automático.
2. Adicionar um marcador opcional no nível da figura:

```ts
strokeMode?: "auto" | "solid";
```

3. Figuras antigas sem `strokeMode` continuam usando a regra atual de compatibilidade.
4. Cores escolhidas no seletor devem salvar `strokeMode: "solid"`.
5. Arestas com `edge.stroke` devem ser sempre tratadas como cor sólida.

Regra de resolução sugerida:

```txt
edge.stroke presente -> usar edge.stroke como cor sólida
figure.strokeMode === "solid" -> usar figure.stroke como cor sólida
figure.stroke === "aci7" -> resolver preto/branco por tema
figure.stroke ausente -> resolver aci7
legado #000000 sem strokeMode -> pode continuar resolvendo como aci7
```

Essa regra evita quebrar projetos antigos e permite que o usuário escolha preto real no seletor.

## Contratos internos sugeridos

Adicionar ao `EditorContext`:

```ts
activeStrokeColor: string;
setActiveStrokeColor: (color: string) => void;
recentStrokeColors: string[];
commitStrokeColor: (color: string) => void;
applyStrokeColorToSelection: (color: string) => void;
```

Notas:

1. `activeStrokeColor` deve ser a cor usada por novos desenhos.
2. `commitStrokeColor` deve normalizar, salvar histórico e atualizar a cor ativa.
3. `applyStrokeColorToSelection` deve alterar figuras/arestas e gravar histórico do editor.
4. A implementação pode combinar `commitStrokeColor` e `applyStrokeColorToSelection`, desde que preserve o comportamento.

Chaves de `localStorage` sugeridas:

```txt
inaa:strokeColor.active
inaa:strokeColor.recent
```

## Requisitos funcionais

## 1. Escolher cor antes de desenhar

Fluxo:

1. Usuário abre `Cor da linha`.
2. Escolhe `#ef4444`.
3. Fecha o popover.
4. Seleciona Retângulo, Linha, Curva, Caneta ou Círculo.
5. Desenha a figura.
6. A figura criada deve ter a linha em `#ef4444`.

Ferramentas que devem usar a cor ativa:

1. `rectangle`
2. `circle`
3. `line`
4. `curve`
5. `pen`, quando gerar figura de linha/curva

Ferramentas fora desta regra:

1. `text`, pois possui `textFill`.
2. `dart`, pois edita estrutura da figura existente.
3. `pique`, pois adiciona marca técnica.
4. `hem` e `offset`, pois possuem cores semânticas próprias.
5. Guias, grid, medidas e overlays.
6. Figuras derivadas de margem de costura e bainha já existentes, mesmo quando selecionadas depois.

## 2. Preview durante desenho

O preview do desenho em andamento deve refletir a cor ativa.

Regras:

1. Preview de retângulo deve usar a cor ativa.
2. Preview de círculo deve usar a cor ativa.
3. Preview de linha/polilinha deve usar a cor ativa.
4. Preview de curva deve usar a cor ativa.
5. Overlays auxiliares podem continuar com cores semânticas quando não representam a linha final.

## 3. Alterar cor de figura inteira

Fluxo:

1. Usuário seleciona uma figura com a ferramenta `select`.
2. Abre `Cor da linha`.
3. Escolhe nova cor.
4. Toda a figura muda para a nova cor.

Regras:

1. Atualizar `figure.stroke`.
2. Definir `figure.strokeMode: "solid"`, se esse campo for adotado.
3. Remover `stroke` das arestas da figura para limpar cores individuais.
4. Registrar uma entrada única no Undo/Redo.
5. Manter a seleção da figura.

Multi-seleção:

1. Se houver múltiplas figuras selecionadas, aplicar em todas.
2. Cada figura deve ter suas arestas individuais limpas.
3. Se alguma figura selecionada for margem de costura ou bainha, ela deve ser ignorada obrigatoriamente.
4. Se a seleção contiver figuras editáveis e figuras protegidas, aplicar cor apenas nas editáveis.
5. Se a seleção contiver somente margem de costura e/ou bainha, não alterar figuras nem gravar Undo/Redo.

## 4. Alterar cor de aresta individual

Fluxo:

1. Usuário seleciona uma figura.
2. Usuário seleciona uma aresta individual pelo fluxo atual de seleção de aresta.
3. Abre `Cor da linha`.
4. Escolhe nova cor.
5. Apenas a aresta selecionada muda de cor.

Regras:

1. Atualizar apenas `edge.stroke` da aresta selecionada.
2. Não alterar `figure.stroke`.
3. Não alterar outras arestas.
4. Registrar uma entrada única no Undo/Redo.
5. Manter `selectedEdge`.
6. Renderizar a figura com cores mistas quando necessário.
7. Se `selectedEdge.figureId` apontar para margem de costura ou bainha, não alterar a aresta e não gravar Undo/Redo.
8. Nesse caso, a cor escolhida ainda pode atualizar `activeStrokeColor` para próximos desenhos editáveis.

## 5. Sincronizacao RGB, HSB/HSV e HEX

Campos RGB:

1. Aceitar inteiros de 0 a 255.
2. Clamp em valores fora do intervalo.
3. Ao alterar R, G ou B, atualizar HEX e swatch.
4. Permitir confirmar com Enter.
5. Confirmar no blur.

Campo HEX:

1. Aceitar `#rgb`, `rgb`, `#rrggbb` e `rrggbb`.
2. Normalizar para `#rrggbb`.
3. Rejeitar valores inválidos sem quebrar o estado atual.
4. Mostrar estado visual de erro enquanto inválido.
5. Confirmar com Enter.
6. Confirmar no blur se válido.

Campos HSB/HSV:

1. Aceitar `H` de 0 a 360.
2. Aceitar `S` de 0 a 100.
3. Aceitar `B`/`V` de 0 a 100.
4. Clamp em valores fora do intervalo.
5. Ao alterar HSB/HSV, atualizar RGB, HEX, swatch, área `SV` e slider de matiz.
6. Ao alterar RGB ou HEX, recalcular HSB/HSV sem perda visual perceptível.

## 6. Historico

Uma cor entra no histórico quando:

1. É aplicada a uma seleção.
2. É definida como cor ativa para o próximo desenho.
3. É escolhida por swatch, HEX, RGB, HSB/HSV ou seletor visual.

Uma cor não deve entrar no histórico quando:

1. O valor é inválido.
2. O usuário apenas digita parcialmente um HEX.
3. O usuário cancela/fecha sem commit, caso a UI implemente estado temporário.
4. A cor é `aci7` automática.

## 7. Undo e Redo

Regras:

1. Alterar cor ativa sem seleção não grava histórico do editor.
2. Alterar cor de figura existente grava uma ação undoável.
3. Alterar cor de aresta existente grava uma ação undoável.
4. Uma confirmação de cor deve gerar no máximo uma entrada no histórico.
5. Arrastar um seletor visual não deve gerar dezenas de entradas no histórico.

Estratégia recomendada:

1. Durante drag do seletor, atualizar preview com `setFigures(..., false)`.
2. No commit final, chamar `setFigures(..., true)`.
3. Para campos HEX/RGB/HSB, commitar em Enter ou blur.
4. Para presets/recentes, commitar imediatamente.

## 8. Persistencia no projeto

As cores de figuras e arestas devem ser salvas dentro de `design_data`.

Regras:

1. `figure.stroke` continua persistido como hoje.
2. `figure.strokeMode`, se adotado, deve ser persistido.
3. `edge.stroke`, quando presente, deve ser persistido junto da aresta.
4. Projetos sem `edge.stroke` devem carregar normalmente.
5. Projetos antigos com `stroke: "aci7"` devem carregar normalmente.
6. Projetos antigos com `stroke: "#000000"` devem seguir a regra de compatibilidade definida na seção de preto explícito.

Não é necessário criar migração SQL, pois `design_data` é JSONB.

## 9. Exportacao

Exportações devem respeitar cor por figura e por aresta.

Regras:

1. PDF/export deve usar a cor efetiva de cada aresta.
2. Se todas as arestas tiverem a mesma cor, pode renderizar como uma figura única.
3. Se houver cores por aresta, renderizar aresta por aresta.
4. Preenchimento de figuras fechadas deve continuar funcionando.
5. Margem de costura e bainha devem manter suas cores semânticas.
6. Mesmo que uma margem de costura ou bainha esteja selecionada durante a exportação, sua cor exportada não deve ser afetada pela cor ativa da ferramenta.

## 10. Operacoes que devem preservar cor

As seguintes operações devem preservar cores existentes:

1. Copiar/colar.
2. Undo/Redo.
3. Salvar/carregar projeto.
4. Espelhar.
5. Desespelhar.
6. Extrair molde, quando a nova figura representar um trecho copiado da geometria original.
7. Converter aresta linha/curva.
8. Dividir aresta.
9. Mover nós.
10. Transformar figura.

Regras especificas:

1. Converter uma aresta de linha para curva deve preservar `edge.stroke`.
2. Converter uma curva para linha deve preservar `edge.stroke`.
3. Dividir uma aresta deve copiar a cor efetiva da aresta original para as novas arestas.
4. Ao gerar uma figura derivada com cor semântica própria, como margem de costura, manter a cor semântica.
5. Ao gerar ou atualizar bainha, manter a cor semântica da bainha.
6. Ao recomputar margem de costura ou bainha, descartar qualquer tentativa de cor customizada aplicada pela ferramenta de cor.

## Renderizacao

## 1. FigureRenderer

`FigureRenderer.tsx` deve resolver a cor efetiva por aresta.

Quando não houver `edge.stroke` em nenhuma aresta:

1. Manter o caminho atual de renderização com uma única `<Line>`, sempre que possível.
2. Preservar otimizações existentes.

Quando houver pelo menos uma aresta com `edge.stroke`:

1. Renderizar o preenchimento da figura fechada separadamente, se existir.
2. Renderizar as arestas individualmente.
3. Usar `edge.stroke ?? figure.stroke`.
4. Manter `hitStrokeWidth`, `lineCap`, `lineJoin`, `dash`, `listening` e comportamento de seleção.
5. Manter overlays de hover/seleção acima das linhas coloridas.

## 2. Selecionada versus cor real

Hoje uma figura selecionada pode ser desenhada em azul para indicar seleção.

Requisito:

1. A indicação de seleção deve continuar clara.
2. A cor real da linha não deve ser perdida no estado do projeto.
3. Durante seleção, é aceitável usar overlay azul acima da figura em vez de substituir totalmente o stroke real.

Recomendação:

1. Renderizar a figura sempre com sua cor real.
2. Renderizar seleção/hover como overlay separado.
3. Isso evita esconder cores por aresta quando a figura está selecionada.

Se a implementação mantiver o comportamento atual de trocar o stroke selecionado para azul, os testes visuais de cor devem validar a cor depois de desselecionar.

## Plano de implementacao

## 1. Tipos

Arquivos:

```txt
components/editor/types.ts
```

Tarefas:

1. Adicionar `stroke?: string` em `FigureEdge`.
2. Considerar `strokeMode?: "auto" | "solid"` em `Figure`.
3. Criar tipos auxiliares se necessário, por exemplo `StrokeColor`.

## 2. Helpers de cor

Arquivo sugerido:

```txt
components/editor/strokeColor.ts
```

Funções sugeridas:

```ts
normalizeHexColor(input: string): string | null;
rgbToHex(r: number, g: number, b: number): string;
hexToRgb(hex: string): { r: number; g: number; b: number } | null;
rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number };
hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number };
resolveFigureStrokeColor(...): string;
resolveEdgeStrokeColor(...): string;
getFigureEffectiveStrokeState(...): "single" | "mixed";
```

Objetivo:

1. Evitar duplicar regra de HEX/RGB/HSB em toolbar, canvas, renderer e export.
2. Centralizar a compatibilidade com `aci7`.
3. Facilitar testes unitários.

## 3. Estado global do editor

Arquivos:

```txt
components/editor/EditorContext.tsx
components/editor/types.ts
```

Tarefas:

1. Adicionar `activeStrokeColor`.
2. Adicionar `recentStrokeColors`.
3. Carregar ambos do `localStorage`.
4. Persistir mudanças.
5. Expor método de commit/aplicação.
6. Garantir que modo somente leitura não altera figuras.

## 4. Componente de UI

Arquivo sugerido:

```txt
components/editor/StrokeColorPicker.tsx
```

Responsabilidades:

1. Renderizar popover.
2. Renderizar área customizada de saturação/valor.
3. Renderizar slider customizado de matiz.
4. Sincronizar visual picker, RGB, HSB/HSV e HEX.
5. Renderizar preview de cor anterior e nova cor.
6. Renderizar presets.
7. Renderizar recentes.
8. Emitir `onPreview(color)` durante arraste, quando necessário.
9. Emitir `onCommit(color)`.
10. Emitir `onCancel()`.
11. Indicar valor inválido sem commitar.

## 5. Toolbar

Arquivo:

```txt
components/editor/EditorToolbar.tsx
```

Tarefas:

1. Adicionar botão `Cor da linha`.
2. Mostrar swatch da cor ativa.
3. Abrir/fechar popover.
4. Respeitar `readOnly`.
5. Seguir padrões de tooltip e estilo existentes.

## 6. Criacao de figuras

Arquivo:

```txt
components/editor/Canvas.tsx
```

Tarefas:

1. Substituir usos de `"aci7"` na criação de figuras desenhadas pela cor ativa.
2. Manter `"aci7"` em overlays e figuras semânticas quando apropriado.
3. Ajustar previews para usar a cor ativa.
4. Garantir que desenho novo salva `strokeMode: "solid"` quando a cor ativa for uma cor sólida.

Pontos atuais a revisar:

```txt
makePolylineLineFigure(...)
makeRectFigure(...)
makeEllipseFigure(...)
makeCurveFromPoints(...)
draft preview de rectangle/circle/line/curve
pen finalize
```

## 7. Aplicacao em selecao

Arquivos:

```txt
components/editor/EditorContext.tsx
components/editor/Canvas.tsx
components/editor/PropertiesPanel.tsx
```

Tarefas:

1. Criar função para aplicar cor na seleção atual.
2. Priorizar `selectedEdge`.
3. Aplicar em `selectedFigureIds` quando não houver aresta selecionada.
4. Ignorar obrigatoriamente margem de costura e bainha.
5. Não alterar `figure.stroke`, `figure.strokeMode` nem `edge.stroke` de figuras protegidas.
6. Registrar histórico somente se pelo menos uma figura ou aresta editável mudou de cor.
7. Expor helper local para identificar se a seleção atual contém algum alvo editável.

## 8. Renderizacao por aresta

Arquivo:

```txt
components/editor/FigureRenderer.tsx
```

Tarefas:

1. Detectar se existe qualquer `edge.stroke`.
2. Renderizar fill separado para figura fechada.
3. Renderizar linhas por aresta quando necessário.
4. Manter renderização atual para figuras uniformes.
5. Atualizar comparação memoizada para considerar `edge.stroke`.

## 9. Exportacao

Arquivo:

```txt
components/editor/export.ts
```

Tarefas:

1. Usar cor efetiva por aresta.
2. Renderizar segmentos individualmente quando houver cores mistas.
3. Validar PDF com figuras fechadas e fill transparente.
4. Garantir que margem de costura e bainha usem as cores semânticas existentes.

## 10. Operacoes de geometria

Arquivos a revisar conforme implementação:

```txt
components/editor/edgeEdit.ts
components/editor/edgeConvert.ts
components/editor/mirror.ts
components/editor/unfold.ts
components/editor/seamFigure.ts
components/editor/offset.ts
components/editor/Canvas.tsx
```

Tarefas:

1. Preservar `edge.stroke` em conversões.
2. Preservar `edge.stroke` em split.
3. Preservar `figure.stroke` e `edge.stroke` em copy/paste, mirror e unfold.
4. Não propagar cor customizada para figuras derivadas que têm cor semântica.
5. Garantir que recomputações de margem de costura e bainha não absorvam `activeStrokeColor`.

## Testes

## 1. Unitarios

Arquivo sugerido:

```txt
components/editor/strokeColor.test.ts
```

Cobrir:

1. Normalização de HEX.
2. Conversão RGB para HEX.
3. Conversão HEX para RGB.
4. Conversão RGB para HSB/HSV.
5. Conversão HSB/HSV para RGB.
6. Rejeição de HEX inválido.
7. Atualização do histórico com dedupe e limite de 10.
8. Resolução de `aci7`.
9. Resolução de preto explícito com `strokeMode: "solid"`.
10. Cor efetiva de aresta herdada.
11. Cor efetiva de aresta sobrescrita.
12. Identificação de figura protegida de margem de costura.
13. Identificação de figura protegida de bainha.

## 2. E2E

Arquivo sugerido:

```txt
tests/stroke-color.spec.ts
```

Cenários:

1. Usuário escolhe cor antes de desenhar e o próximo retângulo usa essa cor.
2. Usuário escolhe cor antes de desenhar e a próxima linha usa essa cor.
3. Usuário seleciona figura inteira e troca a cor de todas as arestas.
4. Usuário seleciona uma aresta e troca apenas aquela aresta.
5. Histórico mostra as últimas 10 cores, sem duplicatas.
6. HEX, RGB e HSB/HSV ficam sincronizados.
7. Undo desfaz troca de cor em figura.
8. Redo reaplica troca de cor em figura.
9. Salvar/carregar preserva cor da figura e cor por aresta.
10. Exportação respeita cor por aresta.
11. Selecionar margem de costura e aplicar cor não altera a margem.
12. Selecionar bainha e aplicar cor não altera a bainha.
13. Selecionar aresta de margem de costura ou bainha e aplicar cor não altera a aresta.
14. Multi-seleção com figura editável + margem/bainha altera apenas a figura editável.
15. Seleção contendo somente margem/bainha não cria entrada de Undo/Redo ao aplicar cor.

## 3. Test ids recomendados

```txt
stroke-color-button
stroke-color-popover
stroke-color-current-swatch
stroke-color-sv-area
stroke-color-sv-handle
stroke-color-hue-slider
stroke-color-hue-handle
stroke-color-hex-input
stroke-color-r-input
stroke-color-g-input
stroke-color-b-input
stroke-color-h-input
stroke-color-s-input
stroke-color-v-input
stroke-color-preset-0
stroke-color-recent-0
stroke-color-apply
stroke-color-cancel
```

## Criterios de aceite

1. O botão `Cor da linha` aparece na toolbar do editor.
2. O popover tem área customizada de saturação/valor.
3. O popover tem slider customizado de matiz.
4. O usuário consegue escolher cor por preset.
5. O usuário consegue escolher cor por RGB.
6. O usuário consegue escolher cor por HSB/HSV.
7. O usuário consegue escolher cor por HEX.
8. As últimas 10 cores usadas aparecem no histórico.
9. O histórico remove duplicatas e mantém a cor mais recente primeiro.
10. Escolher uma cor sem seleção altera a cor do próximo desenho.
11. O próximo retângulo/círculo/linha/curva usa a cor ativa.
12. O preview do desenho usa a cor ativa.
13. Selecionar uma figura e aplicar cor muda a figura inteira.
14. Aplicar cor na figura inteira limpa cores individuais de arestas.
15. Selecionar uma aresta e aplicar cor muda somente aquela aresta.
16. Undo/Redo funciona para alterações em figuras e arestas.
17. Salvar e recarregar projeto preserva cores.
18. Exportar preserva cores por figura e por aresta.
19. Projetos antigos sem `edge.stroke` continuam abrindo.
20. Modo somente leitura não permite alterar cor.
21. A seleção visual continua clara mesmo com linhas coloridas.
22. A ferramenta não altera linhas de margem de costura.
23. A ferramenta não altera linhas de bainha.
24. A ferramenta não altera arestas individuais de margem de costura ou bainha.
25. Em multi-seleção, margem de costura e bainha permanecem com suas cores semânticas.

## Casos de borda

1. HEX inválido: não aplicar e não salvar no histórico.
2. RGB vazio ou inválido: não aplicar até ficar válido.
3. Figura com zero arestas: não quebrar.
4. Aresta selecionada foi removida por outra operação: limpar `selectedEdge` ou ignorar aplicação.
5. Multi-seleção com figuras e seams: aplicar apenas em figuras editáveis.
6. Cor preta explícita em tema escuro: deve continuar preta se `strokeMode: "solid"`.
7. Cor branca explícita em tema claro: deve continuar branca, mesmo que tenha baixo contraste.
8. Figura selecionada com arestas mistas: aplicar cor de figura deve uniformizar.
9. Split de aresta colorida: novas arestas herdam a cor efetiva original.
10. Copy/paste de figura com arestas coloridas: cópia preserva as cores.
11. Seleção apenas com margem de costura: picker pode mudar cor ativa, mas não a margem.
12. Seleção apenas com bainha: picker pode mudar cor ativa, mas não a bainha.
13. Seleção de aresta protegida: não criar `edge.stroke`.
14. Recomputar margem/bainha depois de uma alteração de cor ativa: cor semântica permanece.

## Decisoes pendentes

1. Se o modo `Auto/aci7` deve aparecer no seletor junto das cores sólidas.
2. Se o controle também deve aparecer no `PropertiesPanel` além da toolbar.
3. Se figuras `kind === "mold"` devem ser coloridas normalmente. Recomendação: sim.
