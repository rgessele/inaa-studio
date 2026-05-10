# Especificação Funcional — Extração de Moldes

Data: 09/02/2026  
Status: Especificação revisada (v2)  
Escopo: Editor web (`components/editor/*`) + persistência de projeto (`design_data`)

## 1. Objetivo

Implementar no Inaá Studio um fluxo de extração de moldes semelhante ao comportamento esperado em ferramentas maduras de modelagem digital: transformar um diagrama técnico (linhas de construção) em uma entidade de produção (molde) limpa, validada e pronta para impressão/corte.

Resultado esperado:

1. O diagrama permanece como ambiente de engenharia e construção.
2. O molde extraído vira objeto autônomo de produção.
3. Somente moldes extraídos e ativos são enviados para impressão/exportação.
4. O usuário controla os moldes por miniaturas no sidepanel.
5. A extração pode partir do diagrama ou de um molde já extraído.

## 2. Princípios de produto

1. Extração não é cópia visual; é isolamento geométrico inteligente.
2. O sistema deve bloquear saída com perímetro inválido.
3. Cada molde deve carregar metadados de produção (nome, tamanho, corte, fio, piques).
4. O pipeline de impressão deve operar sobre moldes, nunca sobre o diagrama bruto.
5. A cor de preenchimento de molde é de leitura em tela, não de saída.
6. A origem do molde deve ser rastreável (`diagrama` ou `molde`) para permitir derivações.

## 3. Conceitos e domínios

1. `Diagrama`: entidades de construção, sobreposição, cálculo, apoio e rascunho.
2. `Molde`: entidade final de peça para corte/plotter/impressão.
3. `Extração`: fluxo assistido para construir um perímetro fechado válido.
4. `Domínio de edição`: contexto ativo no editor.
5. `Extração derivada`: geração de novo molde a partir de arestas de um molde existente.

```ts
type EditingDomain = "diagram" | "mold";
```

## 4. Escopo da entrega

### 4.1 Incluído

1. Ferramenta de extração por seleção sequencial de segmentos.
2. Validação rígida de fechamento de perímetro antes de gerar molde.
3. Interseção automática para usar apenas trechos úteis de linhas.
4. Extração iniciando tanto do diagrama quanto de molde já extraído.
5. Conversão em entidade de molde com propriedades de produção.
6. Gestão de moldes por miniaturas no sidepanel.
7. Mudança da lógica de impressão: apenas moldes ativos.
8. Preenchimento visual de molde em tela, ignorado na impressão.

### 4.2 Fora do escopo (nesta fase)

1. Encaixe automático (nesting) completo.
2. Gradação automática com regras paramétricas por tabela.
3. Pipeline CAM/plotter avançado com otimizações industriais.

## 5. Fluxo funcional completo

### 5.1 Entrada no modo de extração

1. Usuário aciona `Extrair moldes`.
2. Editor entra em modo guiado de extração com instrução: "Selecione, em sequência, os segmentos do contorno".
3. O usuário pode cancelar (`Esc`) sem gerar molde.
4. O modo de origem da extração deve ser definido:
   - `Do diagrama` (arestas de figuras de construção)
   - `De molde existente` (arestas da geometria de um molde)

Regras de origem:

1. O usuário pode trocar a origem no início da operação.
2. Dentro da mesma extração não é permitido misturar origens.
3. Em extração `De molde existente`, não é permitido misturar arestas de moldes diferentes na mesma operação.

Disponibilização:

1. Menu `Editar`
2. Toolbar
3. Atalho recomendado: `Shift+E`

### 5.2 Identificação e fechamento de perímetro

### 5.2.1 Seleção sequencial de segmentos

1. O usuário clica em retas e curvas na ordem do contorno.
2. Cada clique adiciona um segmento orientado ao caminho atual.
3. O sistema mostra preview contínuo do contorno em formação.

### 5.2.2 Validação de vértices e fechamento

1. Todo segmento novo deve conectar no ponto final do segmento anterior.
2. O contorno só é válido quando o último ponto fecha no primeiro.
3. Extração bloqueia se houver lacuna de fechamento.

Regra de precisão:

1. Bloqueio obrigatório para gap `>= 0,1 mm`.
2. Recomendação de implementação: bloquear qualquer gap `> 0 mm` e mostrar valor medido.

Mensagem sugerida:

1. "Perímetro aberto: existe uma lacuna de X mm. Una os pontos para extrair o molde."

### 5.2.3 Interseção automática e corte de sobras

1. Linhas de construção cruzadas devem ser automaticamente fracionadas em trechos selecionáveis.
2. O usuário escolhe apenas o trecho útil para o molde.
3. Sobras de linha de apoio não entram na geometria extraída.

Comportamento técnico:

1. Gerar nós temporários em interseções.
2. Tratar cada trecho entre interseções como segmento elegível.
3. Manter apenas os trechos efetivamente selecionados pelo usuário.

### 5.2.4 Extração a partir de arestas de molde já extraído

1. O usuário pode selecionar arestas de um molde existente para compor um novo perímetro.
2. O resultado é sempre um novo molde (não sobrescreve o molde fonte).
3. A seleção segue as mesmas regras de conexão e fechamento de perímetro.

Regras específicas:

1. O novo molde derivado referencia o molde fonte para rastreabilidade.
2. O molde fonte continua íntegro e disponível para impressão.
3. O novo molde entra ativo para impressão por padrão (`printEnabled = true`), podendo ser desmarcado no sidepanel.

### 5.2.5 Confirmação e aplicação da geração do molde

Após selecionar as arestas, a geração deve ser aplicada em duas etapas:

1. `Fechamento do perímetro` (etapa geométrica)
2. `Confirmação de geração` (etapa de criação do objeto molde)

Gatilhos para encerrar a etapa geométrica:

1. Clique no ponto inicial para fechar o contorno.
2. `Enter` para confirmar o contorno quando ele já estiver fechado/validado.

Comportamento ao fechar:

1. Se o contorno estiver inválido, bloquear avanço e manter o usuário no modo de seleção.
2. Se o contorno estiver válido, abrir o diálogo de confirmação (`Gerar molde`).

No diálogo `Gerar molde`:

1. Exibir preview do contorno final.
2. Exibir campos obrigatórios (nome, tamanho base, quantidade, dobra/espelho).
3. Exibir parâmetros iniciais (margem, fio e regras de herança quando origem for molde).

Ações do diálogo:

1. `Gerar molde`:
   - cria um novo `PatternPiece`
   - adiciona em `molds`
   - define `visible = true` e `printEnabled = true`
   - seleciona o novo molde no canvas e sidepanel
2. `Cancelar`:
   - não cria molde
   - retorna para o modo de extração com o perímetro ainda editável

### 5.3 Conversão de desenho em entidade molde

Após perímetro válido:

1. O sistema cria um `PatternPiece` (molde) novo.
2. O molde deixa de ser somente linhas e recebe metadados de produção.

Propriedades obrigatórias no fluxo:

1. Margem de costura automática (valor uniforme inicial, por exemplo 1 cm).
2. Sentido do fio (gerado automaticamente ou definido pelo usuário).
3. Piques vinculados ao perímetro.

### 5.3.1 Margem de costura automática

1. O usuário define um valor inicial (ex: `1,00 cm`) ao confirmar a extração.
2. O sistema aplica offset paralelo ao perímetro inteiro.
3. Em fase posterior, cada aresta pode receber ajuste próprio.

### 5.3.2 Geração de fio

Opções de geração:

1. Automática: eixo principal da peça (maior dimensão/local grain heuristic).
2. Assistida: usuário escolhe uma direção no preview.

Regra:

1. Todo molde deve sair da extração com `grainline` definido.

### 5.3.3 Piques vinculados

1. Piques pertencem ao molde e são ancorados por referência de aresta + posição (`t01`).
2. Se o molde mudar, os piques acompanham a geometria.

### 5.3.4 Herança de propriedades na extração derivada (molde -> molde)

Quando a origem for um molde existente:

1. Novo molde deve herdar automaticamente:
   - `baseSize`
   - convenções de nomenclatura (prefixo/sufixo)
2. O campo `name` deve vir pré-preenchido (ex: "`<nome original> - derivado`"), editável pelo usuário.
3. `cutQuantity` e `cutOnFold` devem vir com valor padrão do molde fonte, com edição permitida.
4. Sentido do fio deve ser herdado por padrão, com opção de ajuste manual.

Regra para margem de costura no derivado:

1. Padrão recomendado: iniciar com `seam.mode = "none"` no novo molde.
2. Opcional futuro: oferecer toggle `Herdar margem do molde origem`.

### 5.4 Gestão de peças e nomenclatura

Ao finalizar a extração, abrir diálogo de identificação da peça:

Campos mínimos:

1. Nome da peça (ex: "Frente Superior")
2. Tamanho base (ex: `M`, `40`, `PP`)
3. Quantidade de corte (inteiro >= 1)
4. Modo de corte (`normal` ou `na dobra`)

### 5.4.1 Espelhamento / dobra

Se o usuário desenhou meia peça:

1. Opção `Espelhar para peça inteira`.
2. Opção `Manter meia peça com indicação de dobra`.

Comportamento:

1. Espelhar gera geometria completa para impressão.
2. Dobra mantém meia peça com metadado `cutOnFold`.

### 5.4.2 Documentação do molde no sidepanel (quando selecionado)

Quando um molde estiver selecionado no canvas ou na lista de miniaturas:

1. O sidepanel deve exibir a documentação da peça.
2. Os campos devem ser editáveis no próprio painel (sem exigir reabrir diálogo da extração).

Campos exibidos no sidepanel:

1. Nome da peça
2. Tamanho base
3. Quantidade de corte
4. Tipo de corte (`normal` / `na dobra`)
5. Sentido do fio (ângulo e opção auto/manual)
6. Notas da peça

Regras de UX:

1. Edição no sidepanel atualiza o molde em tempo real.
2. Alterações ficam persistidas no projeto.
3. Se nenhum molde estiver selecionado, essa seção não aparece.

### 5.5 Preparação para saída (impressão/plotter)

### 5.5.1 Limpeza de geometria

Ao extrair:

1. Remover linhas auxiliares, cálculos e anotações de construção não produtivas.
2. Manter apenas contorno e marcações essenciais (ex: pences, bolsos, piques, fio, nome).

### 5.5.2 Pronto para gradação

O molde extraído deve ser persistido em estrutura estável para gradação futura:

1. IDs consistentes de nós/arestas.
2. Topologia preservada.
3. Metadados de produção associados ao molde, não ao diagrama.

## 6. Modelo de dados proposto

```ts
interface MoldSourceSegmentRef {
  sourceDomain: "diagram" | "mold";
  sourceId: string; // figureId (diagram) ou moldId (mold)
  edgeId: string;
  t0: number; // início do trecho usado
  t1: number; // fim do trecho usado
}

interface PatternPiece {
  id: string;
  origin: {
    mode: "fromDiagram" | "fromMold";
    sourceMoldId?: string;
  };
  name: string;
  baseSize: string;
  cutQuantity: number;
  cutOnFold: boolean;
  sourceSegments: MoldSourceSegmentRef[];
  geometry: Figure; // geometria limpa da peça
  seam: {
    mode: "none" | "uniform" | "perEdge";
    uniformCm?: number;
    perEdgeCm?: Record<string, number>;
  };
  grainline: {
    angleDeg: number;
    origin?: { x: number; y: number };
    autoGenerated: boolean;
  };
  printEnabled: boolean; // default true
  visible: boolean; // default true
  screenFill: {
    color: string;
    opacity: number;
  };
  metadata?: {
    notes?: string;
    partCode?: string;
  };
  lineage?: {
    rootMoldId?: string;
    parentMoldId?: string;
    depth: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

Persistência (compatível com projetos antigos):

```ts
interface DesignDataV2 {
  version: 2;
  figures: Figure[];
  molds?: PatternPiece[]; // novo, opcional para retrocompatibilidade
  pageGuideSettings?: PageGuideSettings;
  guides?: GuideLine[];
  meta?: { ... };
}
```

Compatibilidade:

1. Projeto sem `molds` carrega com `molds = []`.
2. Save passa a gravar `molds` sempre.
3. Moldes antigos sem `origin` devem ser normalizados como `origin.mode = "fromDiagram"` durante o load.

## 7. Sidepanel de moldes (miniaturas)

Nova seção no `PropertiesPanel`: `Moldes extraídos`.

Cada item:

1. Miniatura da geometria.
2. Nome da peça (editável).
3. Indicador de tamanho base.
4. Checkbox `Imprimir` (`printEnabled`, default ativo).
5. Toggle `Visível`.
6. Seleção ao clicar.
7. Ação contextual `Gerar novo molde a partir deste` (abre extração já travada no molde selecionado).

Ações de lote:

1. `Marcar todos para impressão`
2. `Desmarcar todos`

Estado vazio:

1. Mensagem orientativa + CTA para iniciar extração.

Se um molde estiver selecionado, o sidepanel também deve mostrar a seção `Documentação do molde` com os metadados de produção editáveis.

## 8. Nova lógica de impressão/exportação

Regra principal:

1. PDF/SVG devem consumir apenas moldes com `printEnabled === true`.
2. Figuras de diagrama não entram na saída final.

Fonte de export:

```ts
const printable = molds
  .filter((m) => m.visible && m.printEnabled)
  .map((m) => m.geometry);
```

Comportamento quando vazio:

1. Bloquear export.
2. Exibir: "Nenhum molde ativo para impressão."

Ajustes no modal de export:

1. Mostrar contador `moldes totais` e `moldes ativos`.
2. Remover dependência dos filtros por tipo de figura do diagrama para impressão final.

## 9. Cor de preenchimento em tela

1. Molde deve ter preenchimento visual (`screenFill`) no canvas.
2. Esse preenchimento não pode ir para PDF/SVG.
3. Export deve forçar saída de contorno produtivo sem fill estético.

## 10. Escopo de ferramentas por domínio

```ts
type ToolScope = "diagram" | "mold" | "both";
```

Matriz MVP:

1. `rectangle`, `circle`, `line`, `curve`, `pen`, `text`, `mirror`, `unfold`: `diagram`
2. `offset` (margem), `pique`: `mold`
3. `extractMold` (extrair molde): `both`
4. `select`, `pan`, `measure`, `node`: `both`

Regra de bloqueio:

1. Ferramenta fora do domínio ativo não executa.
2. UI informa "Esta ferramenta só funciona em molde" ou "somente no diagrama".

## 11. Validações e mensagens obrigatórias

1. Perímetro aberto: informar gap e bloquear extração.
2. Segmento desconectado: impedir continuidade e sugerir próximo segmento válido.
3. Auto-interseção inválida de contorno: bloquear com orientação de correção.
4. Mistura de origens (`diagram` + `mold`) na mesma extração: bloquear.
5. Mistura de arestas de moldes diferentes na extração derivada: bloquear.
6. Extração sem nome da peça: bloquear confirmação.
7. Impressão sem moldes ativos: bloquear export.

## 12. Regras de histórico (Undo/Redo)

1. Iniciar e cancelar extração não grava histórico.
2. Confirmar extração grava 1 passo.
3. Alterar `printEnabled`/`visible` pode ficar fora do histórico geométrico.
4. Alterações geométricas no molde seguem histórico normal.

## 13. Impactos técnicos por módulo

1. `components/editor/types.ts`
   - adicionar `PatternPiece` e tipos auxiliares
   - estender `DesignDataV2` com `molds`
2. `components/editor/EditorContext.tsx`
   - estado `molds`
   - estado de extração com `sourceMode: "diagram" | "mold"`
   - ações: `startMoldExtraction`, `appendExtractionSegment`, `confirmExtraction`, `toggleMoldPrint`, `toggleMoldVisibility`
3. `components/editor/Canvas.tsx`
   - modo de extração com preview
   - interseções e seleção de trechos
   - picking de arestas em geometrias de moldes para extração derivada
   - render e seleção de moldes
4. `components/editor/FigureRenderer.tsx`
   - preencher molde em tela via `screenFill`
5. `components/editor/PropertiesPanel.tsx`
   - lista/miniaturas de moldes
   - seção de documentação do molde selecionado (edição de metadados)
6. `components/editor/EditorToolbar.tsx` e `components/editor/EditMenu.tsx`
   - gatilhos da extração
   - resumo de moldes no fluxo de impressão
7. `components/editor/export.ts`
   - fonte exclusiva em `molds` ativos
   - remover fill estético de molde na saída
8. `components/editor/EditorHeader.tsx` e `lib/projects.ts`
   - save/load incluindo `molds`

## 14. Critérios de aceite

1. Usuário consegue extrair molde selecionando segmentos em sequência.
2. Usuário consegue extrair novo molde selecionando arestas de um molde já extraído.
3. Sistema bloqueia extração com perímetro aberto e indica o gap.
4. Trechos úteis de linhas cruzadas podem ser selecionados sem sobras.
5. Ao fechar perímetro válido, o diálogo `Gerar molde` é aberto.
6. Só existe criação de molde após confirmação explícita em `Gerar molde`.
7. Molde criado possui nome, tamanho base, quantidade de corte e fio.
8. Opção de espelhamento/dobra funciona no ato da extração.
9. Moldes aparecem no sidepanel com miniatura e `printEnabled = true` por padrão.
10. Ao selecionar um molde, sua documentação aparece no sidepanel e pode ser editada.
11. PDF/SVG incluem apenas moldes ativos.
12. Cor de preenchimento de molde aparece na tela e não aparece na impressão.
13. Ferramentas restritas a molde não atuam em figuras de diagrama.

## 15. Plano de testes

### 15.1 Unit

1. Split de interseções e seleção de trechos.
2. Validação de fechamento e cálculo de gap.
3. Conversão para `PatternPiece`.
4. Conversão `mold -> mold` com preenchimento correto de `origin` e `lineage`.
5. Fluxo de confirmação: somente cria molde após ação `Gerar molde`.
6. Filtro de export por `molds.printEnabled`.

### 15.2 Integração

1. Save/load de projeto com `molds`.
2. Alterações de `printEnabled` refletindo no export.
3. Piques e margem permanecem vinculados ao molde.
4. Edição da documentação no sidepanel persiste após save/load.
5. Extração derivada preserva rastreabilidade do molde origem.

### 15.3 E2E (Playwright)

1. Extrair peça por segmentos sequenciais e validar criação do molde.
2. Extrair novo molde a partir de arestas de molde existente e validar criação do derivado.
3. Tentar misturar arestas de moldes diferentes na mesma extração derivada e validar bloqueio.
4. Tentar extrair com gap `>= 0,1 mm` e validar bloqueio.
5. Fechar perímetro válido e validar abertura do diálogo `Gerar molde`.
6. Cancelar diálogo e validar que nenhum molde foi criado.
7. Confirmar em `Gerar molde` e validar criação + seleção do novo molde.
8. Extrair em região com linhas cruzadas e validar uso de trecho correto.
9. Ativar/desativar moldes na lista e validar PDF com peças corretas.
10. Aplicar preenchimento em tela e validar ausência de fill no PDF/SVG.
11. Usar `offset` em figura de diagrama e validar bloqueio.

## 16. Rollout recomendado

Fase 1:

1. Extração por segmentos (diagrama e molde) + validação de fechamento + entidade `molds` + export só por moldes.

Fase 2:

1. Sidepanel completo com miniaturas e ações em lote.
2. Matriz de escopo de ferramentas por domínio.

Fase 3:

1. Reextração assistida por `sourceSegments`.
2. Preparação avançada para gradação e integração com encaixe automático.
