# Spec - Logotipo na Documentação do Molde (imagem global do projeto)

Data: 10/06/2026
Status: Implementada (na main local, aguardando revisão); inclui correções da revisão adversarial (ver nota ao final de "Riscos e edge cases")
Escopo: Editor web (`components/editor/*`), renderização no canvas, exportação PDF/impressão, persistência de projeto e testes
Pedido original:
1. Permitir **upload de uma imagem** na documentação do molde. A imagem fica **na frente dos textos** da documentação, como um **logotipo**. Deve ser possível **ajustar o tamanho via handle + transform interno**, semelhante ao que já existe para a seta do fio e para o bloco de textos. Por padrão a imagem assume a **altura da documentação do molde**.
2. A imagem é **global ao projeto**: anexada uma vez, aplica-se à documentação de **todos os moldes** do projeto aberto (inclusive moldes criados depois). Remover a imagem remove de todos.

---

## Decisões confirmadas com o usuário

1. **Posição**: à **esquerda dos textos** (estilo papel timbrado), imediatamente antes da primeira coluna de texto, **verticalmente centralizada** com o bloco. Os exemplos enviados pelo usuário confirmam que o logo **gira junto com os textos** (logo + textos formam uma unidade — no exemplo com documentação a 90°, o logo acompanha).
2. **Armazenamento**: **embutida no projeto** como data URL em `design_data.meta`, com **downscale automático** no upload (não usa bucket). Auto-contida: canvas e PDF funcionam sem rede/CORS, e "Salvar como..." copia junto.
3. **Ajustes por molde**: a imagem é a mesma em todos os moldes, mas **posição/tamanho/rotação do logo são ajustáveis individualmente por molde** (campos em `moldMeta`, undo normal) — mesmo padrão da seta e dos textos.

### Decisões menores adotadas (fáceis de inverter, sinalizadas)

- **Opacidade**: o logo é desenhado em **opacidade plena (1.0)**, não no estilo marca d'água 0.22 dos textos — é uma imagem com cores próprias (os exemplos do usuário mostram o logo em cores plenas); a 0.22 ficaria ilegível.
- **Ordem de desenho**: o logo é desenhado **depois** das linhas de texto (fica "na frente" também em z-order, embora normalmente não haja sobreposição).
- **Molde com documentação vazia** (sem nenhuma linha de texto): o logo ainda é desenhado, **centralizado no anchor** (centroide + `nameOffsetLocal`), com altura fallback `max(24, 0.3 * min(bboxW, bboxH))`.
- **Rotação independente**: o transform interno do logo também permite **rotacionar** (consistente com seta/textos), persistindo rotação **relativa ao bloco** (`docImageRotationDeg`). Default 0 (alinhado com os textos).
- **Transform interno fixa o centro** (_descoberto na implementação_): o estacionamento automático gruda a **borda direita** do logo no bloco, então o centro deslocaria conforme a largura cresce — e o Transformer (escala centrada) perseguiria o nó, amplificando a escala. Por isso o primeiro bake do transform interno grava `docImageOffsetLocal` com o centro atual: durante e após o gesto o centro fica estável, e o logo **deixa de re-estacionar automaticamente** após o primeiro redimensionamento (arrastá-lo continua funcionando normalmente).
- **Formatos aceitos**: PNG, JPEG, WebP e SVG. Normalização no upload: PNG/SVG → PNG (preserva alpha); JPEG/WebP → JPEG (q 0.85).
- **Limites de upload**: arquivo de entrada máx. **5MB** (padrão do bucket de notificações); imagem normalizada com **altura máx. 512px** (nunca amplia) e data URL final ≤ **~400KB** (reduz altura iterativamente ×0.7 até caber, piso 128px; acima disso, erro com toast).
- **Export**: o logo segue o gate existente `includeMoldDocumentation` (é parte da documentação); **sem opção nova** de export.
- **Seta do fio**: continua estacionando à esquerda do conjunto — o circunraio usado no estacionamento automático passa a considerar a **caixa estendida (logo + textos)**, então a seta não sobrepõe o logo. (No exemplo 2 do usuário a seta aparece abaixo do bloco — isso já é possível hoje arrastando o handle da seta; o estacionamento automático não muda de lado.)

---

## Contexto atual

### Layout compartilhado (`components/editor/moldDoc.ts`)

- `computeMoldDocLayoutLocal(figure)` (moldDoc.ts:86) é **puro** e usado pelos dois pipelines de desenho (canvas e PDF). Devolve `MoldDocLayout { anchor, rotationDeg, blockWidth, blockHeight, textAlign, lines, grain }` (moldDoc.ts:66-80), tudo em coordenadas **locais da figura**.
- Bloco de textos: linhas empilhadas, centradas no `anchor` (centroide + `nameOffsetLocal`), caixa de largura uniforme `blockWidth`; cada `<Text>` usa `offsetX = blockWidth/2`. Rotação do bloco = `nameRotationDeg`.
- Seta do fio: estaciona à esquerda do bloco, afastada pelo **circunraio** `hypot(blockWidth, totalHeight)/2` + gap (moldDoc.ts:188-199) — invariante à rotação dos textos. `grainOffsetLocal` definido substitui o estacionamento.
- Retorna `null` quando não há linhas **e** não há seta (moldDoc.ts:170).

### Renderização e interação

- **Canvas** (`FigureRenderer.tsx`): seta em 1195-1233, bloco de textos em 1236-1265 (Group rotacionado com `Text` filhos), **handles** pulsantes em 1267-1349 (handle do bloco à direita; handle da seta após a cauda), **proxies invisíveis** do transform interno em 1354-1423 (`inaa-inner-proxy-doc` / `inaa-inner-proxy-grain`).
- **Canvas.tsx**: `innerTransformTarget {figureId, kind: "doc"|"grain"}` (4068-4082); effect de attach do Transformer interno (6337-6364, usa `layer.draw()` **síncrono** para vencer a corrida com o próximo pointerdown); `handleInnerTransformEvent` (6371-6426) lê scale/rotation do proxy, reseta o scale do nó e **assa** nos campos (`doc`: multiplica `nameFontSizePx`/`docFontSizePx`, rotação → `nameRotationDeg`; `grain`: `grainLengthLocal`, rotação → `grainline.angleDeg`); live = `setFigures(updater, false)`, commit = `setFigures(updater)` com valores arredondados (1 passo de undo). Transformer interno em 14529-14565 (cantos, `keepRatio`, `centeredScaling`, rotação com snap 15° no Shift).
- **Registro por nome**: `handlePointerDown` (Canvas.tsx ~7943-7975) tem a lista autoritativa de nomes que fazem early-exit (`inaa-figure-name-handle`, `inaa-grain-handle`, `inaa-inner-proxy*`, ...). Todo sub-elemento interativo novo precisa entrar lá.
- Cursor via `onMouseEnter/onMouseLeave` no nó Konva (`container.style.cursor`), nunca via CSS do Canvas.

### Estado global do projeto

- `DesignDataV2.meta` (types.ts:406-416) já guarda estado por projeto (`fabric`, `notes`, `print`, `grade`, `coverUrl`). `projectMeta` vive no `EditorContext` (483) e é **exposto só para leitura** (1799); `setProjectMeta` **não** é exposto. Os fluxos de save (`EditorHeader.tsx:190/568/694`) repassam `projectMeta` ao `saveProject` (lib/projects.ts:19), que o persiste no JSONB.
- `hasUnsavedChanges` (EditorContext.tsx:813-820) compara snapshot **apenas** de `figures + pageGuideSettings + guides` — mudanças em `meta` **não** marcam o projeto como sujo hoje.
- Undo/redo (`useHistory.ts`) snapshota **somente** `Figure[]` (50 passos). Estado em `meta` fica fora do histórico.

### Upload de imagens no app

- Padrões existentes: avatares (3MB, `image/*`, bucket `avatars`), capas de projeto (bucket `project-covers`), notificações admin (5MB, JPEG/PNG/WebP, bucket `admin-notifications`). Todos via bucket + URL pública; **nenhum** desenha a imagem no canvas Konva.
- O export PDF **rasteriza** o stage (`stage.toDataURL` a 3x → `jsPDF.addImage`, export.ts:1487-1519). Imagem desenhada no stage precisa estar **carregada** antes do raster e **sem taint de CORS** — data URL embutida elimina o risco (motivo da decisão de armazenamento).

---

## Escopo incluído

1. Novo campo global `meta.moldDocLogo` (data URL + dimensões) e setter exposto no `EditorContext`.
2. UI de upload/remoção na seção **Documentação do molde** do painel lateral, com validação, normalização (downscale/re-encode) e indicação clara de que vale para o projeto inteiro.
3. Extensão do layout compartilhado (`moldDoc.ts`) com a caixa do logo (default: à esquerda dos textos, altura = `blockHeight`) e estacionamento da seta ciente do logo.
4. Renderização do logo no canvas (`FigureRenderer.tsx`) dentro do grupo rotacionado do bloco, com cache de `HTMLImageElement` por data URL.
5. Handle de arraste próprio do logo + duplo clique → transform interno (`kind: "logo"`), assando altura/rotação em `moldMeta` (por molde).
6. Espelhar a renderização no export PDF (`export.ts`), com preload da imagem antes do raster.
7. `hasUnsavedChanges` passa a considerar `meta` (anexar/remover logo marca o projeto como não salvo).
8. Persistência (sem migração — campos opcionais), ajustes por molde no undo/redo.
9. Testes unitários do layout (`moldDoc.test.ts`) e E2E (Playwright).

## Fora do escopo

1. Logo por molde (imagens diferentes em moldes distintos) — a imagem é uma só por projeto.
2. Undo/redo de **anexar/remover** o logo (estado em `meta`, fora do histórico de `Figure[]` — consistente com `fabric`/`notes`/`coverUrl`). Os **ajustes** por molde são undoable normalmente.
3. Copiar/colar o logo entre **projetos** (clipboard interno carrega só figuras; ajustes por molde viajam, a imagem global não).
4. Galeria/biblioteca de logos do usuário; reuso entre projetos.
5. Tratamento de contraste do logo no modo escuro (a imagem é desenhada como é).
6. Corrigir a limitação pré-existente do tiling do PDF (bbox de interseção de tiles não inclui documentação/seta/logo arrastados para longe do contorno — herdada da spec anterior, registrada lá).

---

## Modelo de dados (mudanças)

### Global — `DesignDataV2.meta` (types.ts:406-416)

```ts
meta?: {
  // ...existentes
  moldDocLogo?: {
    dataUrl: string;        // imagem normalizada (PNG ou JPEG), já downscaled
    naturalWidth: number;   // dimensões pós-normalização — permitem layout
    naturalHeight: number;  //  síncrono (aspect ratio) sem esperar o load
  } | null;
};
```

### Por molde — `MoldMeta` (types.ts:187-214)

```ts
interface MoldMeta {
  // ...existentes
  // Offset do CENTRO do logo relativo ao anchor do bloco, em coordenadas do
  // BLOCO (pré-rotação — gira junto com os textos). Definido ao arrastar o
  // handle do logo. Unset = estacionamento automático à esquerda dos textos.
  docImageOffsetLocal?: { x: number; y: number };
  // Altura custom do logo (px local), definida pelo transform interno.
  // Unset = automática (blockHeight dos textos; fallback se bloco vazio).
  docImageHeightLocal?: number;
  // Rotação adicional do logo relativa ao bloco (graus). Default 0.
  docImageRotationDeg?: number;
}
```

Notas de modelagem:
- A largura **nunca** é persistida: deriva sempre de `altura × aspect` (`naturalWidth/naturalHeight`), `keepRatio` no Transformer. Trocar o logo por outro com aspect diferente mantém as alturas ajustadas.
- Os campos por molde **sobrevivem** à remoção do logo (como `grainOffsetLocal` sobrevive ao desligar o fio): reanexar uma imagem reaproveita os ajustes.
- Campos opcionais → **sem migração**; projetos antigos carregam verbatim.

---

## Layout compartilhado (`moldDoc.ts`)

Estender `MoldDocLayout` com a caixa do logo:

```ts
export interface MoldDocLogoBox {
  // Centro em coordenadas do BLOCO (origem no anchor, pré-rotação).
  // O caller desenha DENTRO do grupo rotacionado do bloco.
  center: Vec2;
  width: number;
  height: number;
  rotationDeg: number; // docImageRotationDeg ?? 0, relativa ao bloco
}

export interface MoldDocLayout {
  // ...existentes
  logo: MoldDocLogoBox | null;
}
```

`computeMoldDocLayoutLocal` ganha um segundo parâmetro com a imagem global:

```ts
export interface MoldDocLogoInput { naturalWidth: number; naturalHeight: number; }
export function computeMoldDocLayoutLocal(
  figure: Figure,
  logo?: MoldDocLogoInput | null
): MoldDocLayout | null
```

Regras:
1. **Altura efetiva**: `docImageHeightLocal` quando definido (clamp `[8, 4096]`); senão `blockHeight` dos textos quando > 0; senão fallback `max(24, 0.3 * min(bboxW, bboxH))` (via `figureLocalBounds`; 60 se sem bounds). Largura = `altura × naturalWidth/naturalHeight`.
2. **Posição automática** (sem `docImageOffsetLocal`): borda direita do logo encostada na borda esquerda da caixa de textos com gap `max(10, round(0.5 * docFont))`; centro vertical em `y = 0` (centro do bloco). Em coordenadas do bloco: `center = { x: -(blockWidth/2) - gap - width/2, y: 0 }`. Sem linhas de texto: `center = { x: 0, y: 0 }` (centrado no anchor).
3. **Offset do usuário**: `docImageOffsetLocal` definido **substitui** a posição automática (`center = offset`), em coordenadas do bloco — o logo continua girando com os textos e seguindo o anchor ao arrastar o bloco.
4. **Condição de existência**: o layout passa a ser não-nulo também quando **só** o logo existe (`!lines.length && !grain && logo` → renderiza só o logo). A assinatura do retorno não muda.
5. **Estacionamento da seta**: o circunraio usado em moldDoc.ts:188-199 passa a ser o **máximo da distância do anchor aos cantos da união** (caixa de textos ∪ caixa do logo, na posição efetiva do logo) — continua invariante à rotação e a seta não sobrepõe o logo. Com `grainOffsetLocal` definido, nada muda (offset do usuário vence).

---

## Painel lateral (`PropertiesPanel.tsx`)

Dentro da seção **Documentação do molde** (`renderMoldDocumentationSection`, 2244-2491), novo subgrupo ao final:

- **Rótulo**: "Logotipo do projeto" + texto auxiliar "Aplica-se à documentação de todos os moldes deste projeto."
- **Sem logo**: botão "Enviar imagem" (`<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">`, `data-testid="mold-doc-logo-upload"`).
- **Com logo**: thumbnail pequena (`<img src={dataUrl}>`, máx ~48px) + botão "Trocar" + botão "Remover" (`data-testid="mold-doc-logo-remove"`).
- **Pipeline de normalização no upload** (client-side, helper novo `normalizeMoldDocLogo(file): Promise<{dataUrl, naturalWidth, naturalHeight}>` em módulo próprio, ex. `components/editor/moldDocLogo.ts`):
  1. Validar MIME e tamanho (≤ 5MB) → toast de erro caso contrário.
  2. Carregar em `HTMLImageElement` (SVG sem dimensões intrínsecas: rasterizar com altura 512px).
  3. Se altura > 512px, reduzir para 512px (nunca ampliar); desenhar em canvas e re-encodar: PNG para PNG/SVG, JPEG q0.85 para JPEG/WebP.
  4. Se o data URL exceder ~400KB, reduzir a altura ×0.7 e repetir (piso 128px); persistindo o excesso → erro com toast.
- **Escrita**: novo setter do contexto (ver abaixo). Anexar/trocar/remover **não** mexe em `figures` (sem passo de undo) e marca o projeto como não salvo.

## `EditorContext.tsx`

- Expor `setProjectMeta` no tipo (linha ~294) e no value (linha ~1799) — assinatura `(updater: (prev: DesignDataV2["meta"]) => DesignDataV2["meta"]) => void` ou setter direto do `useState`; o PropertiesPanel grava `moldDocLogo` preservando os demais campos de `meta`.
- **Unsaved changes**: incluir `projectMeta` no snapshot do effect (813-820) **e** em todos os pontos que montam `lastSavedSnapshot`/snapshot de save (loadProject 1266-1272, importFigures 1293-1299, `markProjectSaved`, e o `snapshotNow` do `EditorHeader.tsx:~190-196`) — senão anexar logo nunca marca sujo, ou pior, marca sujo para sempre. Manter os dois lados simétricos.

## Renderização no canvas (`FigureRenderer.tsx`)

- **Cache de imagem**: hook `useHtmlImage(dataUrl)` (módulo novo ou no próprio arquivo) com cache module-level `Map<string, HTMLImageElement>` — todos os moldes compartilham o mesmo elemento; re-render no `onload`; `onerror` → não desenha (degradação graciosa).
- **Desenho**: dentro do `<Group>` rotacionado do bloco (1236-1265), **após** as linhas de texto:
  - `<KonvaImage name="inaa-mold-doc-logo" image={img} x={center.x} y={center.y} offsetX={width/2} offsetY={height/2} width height rotation={logo.rotationDeg} opacity={1} listening={false} />` (importar `Image` de react-konva).
  - Só quando `moldDocLogo` definido **e** imagem carregada **e** `moldMeta.visible !== false`.
- **Handle**: mesmo padrão `PulsingHandleRect` em Group arrastável (espelhar 1308-1349): posicionado logo **à esquerda** da caixa do logo (gap + meio handle), `name="inaa-logo-handle"`. `onDragMove` → `onLogoOffsetChange(figureId, centerLocal)` (live), `onDragEnd` → `onLogoOffsetCommit` (commit); como o Group vive dentro do grupo rotacionado do bloco, `e.target.x()/y()` já são coordenadas do bloco = exatamente o novo `center` (gravar `docImageOffsetLocal`, ajustado pelo deslocamento handle→centro). `onDblClick` → `onLogoHandleDblClick(figureId)`. Oculto durante transform interno (mesma condição dos demais).
- **Proxy**: `<Rect name="inaa-inner-proxy-logo">` invisível, dimensões/rotação/offset idênticos à caixa do logo, dentro do mesmo grupo do bloco, quando `innerTransformKind === "logo"`.
- **Props novas**: `moldDocLogo?: {dataUrl, naturalWidth, naturalHeight} | null`, `onLogoOffsetChange/Commit`, `onLogoHandleDblClick`, `innerTransformKind` aceita `"logo"`. **`arePropsEqual` deve comparar `moldDocLogo` e as novas props** (lição da revisão da spec anterior: `showNameHandle` esquecido no memo causou handle fantasma).

## `Canvas.tsx`

- `innerTransformTarget.kind` ganha `"logo"`; `handleLogoHandleDblClick` (espelhar 4080-4082).
- Effect de attach (6337-6364): caso `"logo"` busca `.inaa-inner-proxy-logo`; manter `layer.draw()` síncrono.
- `handleInnerTransformEvent` (6371-6426), caso `"logo"`:
  - `scaleFactor` → `baseH` = altura efetiva atual (mesma regra do layout: `docImageHeightLocal ?? default`); `nextH = clamp(8, 4096, baseH * scaleFactor)` → `docImageHeightLocal`.
  - `node.rotation()` (relativa ao grupo do bloco) → `docImageRotationDeg` (wrap `[0,360)`).
  - Live `setFigures(updater, false)`; commit com `Math.round` → 1 passo de undo.
- **Registro por nome** em `handlePointerDown` (~7943-7975): adicionar `inaa-logo-handle` (verificar se o prefixo `inaa-inner-proxy` já cobre o proxy novo; senão, adicionar).
- **Fiação**: passar `moldDocLogo={projectMeta?.moldDocLogo ?? null}` e os callbacks novos ao `FigureRenderer` (junto de 13892-13951). `projectMeta` já está disponível via contexto.
- Saídas do modo (Esc, troca de seleção/ferramenta, proxy sumiu — ex. logo removido durante o transform) já são genéricas; verificar que cobrem `"logo"`.

## Exportação PDF (`export.ts`)

- **Preload**: antes do laço de desenho, se `meta.moldDocLogo` definido e algum molde será desenhado, criar `HTMLImageElement` do data URL e `await img.decode()` (uma vez; falha → pular o logo, não abortar o export).
- **Desenho**: no bloco mold-doc (1397-1483), após os `Konva.Text`, adicionar `Konva.Image` com a caixa do layout (`layout.logo`), aplicando a mesma transformação local→mundo já usada para os textos (o logo pertence ao grupo rotacionado do bloco). Opacity 1.
- **Plumbing**: o chamador do export passa `meta.moldDocLogo` (estender opções/assinatura — espelhar como `includePatternName` chega hoje). Gate: `includeMoldDocumentation !== false` + `printEnabled !== false` + `visible !== false` (os mesmos do bloco).
- `printLayout.ts` não muda (limitação de tiles herdada, registrada).

---

## Persistência, undo/redo, cópias

- `meta.moldDocLogo` persiste pelo fluxo atual (`saveProject` já repassa `projectMeta`); `saveProjectAsCopy` copia `meta` → o logo (embutido) viaja junto. **Sem migração.**
- Ajustes por molde (`docImage*` em `moldMeta`) entram nos snapshots do `useHistory` automaticamente; anexar/remover o logo global fica **fora** do undo (registrado em "Fora do escopo").
- Copy/paste de moldes (clipboard interno): `moldMeta` é deep-copied → ajustes viajam; a imagem em si é global e não precisa viajar.
- Histórico (50 snapshots de `Figure[]`) **não** multiplica o data URL na memória (a imagem vive em `meta`).

---

## Testes

### Unitários de layout (`tests/mold-doc-logo.unit.spec.ts`, novo — spec Playwright de lógica pura, padrão de `tests/selection-transform.spec.ts`; não há runner de unit tests no repo, os `*.test.ts` em `components/editor` são utilitários manuais)

1. Logo com textos: altura = `blockHeight`, largura = aspect, centro à esquerda da caixa (`x = -(blockWidth/2) - gap - width/2`, `y = 0`).
2. `docImageHeightLocal` definido vence o default (com clamp).
3. `docImageOffsetLocal` definido substitui a posição automática.
4. Documentação vazia + logo → layout não-nulo, logo centrado no anchor com altura fallback.
5. Sem logo → `layout.logo === null`; comportamento atual inalterado (regressão).
6. Estacionamento da seta afasta-se mais quando o logo está presente (circunraio da união).

### E2E (Playwright, `tests/mold-doc-logo.spec.ts`, fixture `tests/fixtures/logo-test.png`)

1. **Upload global**: criar 2 moldes → enviar logo no painel → nó `inaa-mold-doc-logo` presente nos **dois** moldes; criar 3º molde → logo aparece nele também.
2. **Altura default**: client rect do logo ≈ altura do bloco de textos; aspect preservado.
3. **Arraste por molde**: arrastar o handle do logo no molde A → `docImageOffsetLocal` de A muda; molde B não muda.
4. **Transform interno**: duplo clique no handle → proxy `inaa-inner-proxy-logo` presente; arrastar âncora de canto → `docImageHeightLocal` muda (proporção mantida); girar → `docImageRotationDeg` muda; Esc sai do modo.
5. **Remoção**: remover no painel → logo some de todos os moldes; ajustes por molde permanecem em `moldMeta` (reanexar reaproveita).
6. **Persistência**: salvar/recarregar → logo e ajustes preservados.
7. **Undo**: ajuste de tamanho/posição é 1 passo de undo; upload **não** entra no undo (asserção de que undo após upload não remove o logo).
8. **Export PDF**: export com logo não quebra e o PDF contém um XObject de imagem a mais que o export sem logo (via pypdf, infra existente de testes de PDF); com `includeMoldDocumentation=false` → sem o logo.
9. **Unsaved changes**: anexar logo marca o indicador de alterações não salvas.

---

## Arquivos afetados (referência)

- `components/editor/types.ts` — `DesignDataV2.meta.moldDocLogo`; `MoldMeta.docImageOffsetLocal/docImageHeightLocal/docImageRotationDeg`.
- `components/editor/moldDoc.ts` — `MoldDocLogoBox`, parâmetro `logo` em `computeMoldDocLayoutLocal`, posição/altura default, circunraio da união p/ seta.
- `components/editor/moldDocLogo.ts` (novo) — `normalizeMoldDocLogo(file)` (validação, downscale, re-encode) + `useHtmlImage`/cache de imagem.
- `components/editor/FigureRenderer.tsx` — desenho do logo, handle, proxy, props novas, `arePropsEqual`.
- `components/editor/Canvas.tsx` — `innerTransformTarget` kind `"logo"`, attach effect, `handleInnerTransformEvent`, registro `inaa-logo-handle`, fiação de props/callbacks.
- `components/editor/PropertiesPanel.tsx` — UI de upload/troca/remoção na seção Documentação do molde.
- `components/editor/EditorContext.tsx` — expor `setProjectMeta`; incluir `meta` no snapshot de unsaved changes (e pontos simétricos no `EditorHeader.tsx`).
- `components/editor/export.ts` — preload + desenho do logo no bloco mold-doc; plumbing do `meta.moldDocLogo`.
- `tests/mold-doc-logo.unit.spec.ts` (novo) — testes de lógica pura do layout.
- `tests/mold-doc-logo.spec.ts` (novo) + `tests/fixtures/logo-test.png` — E2E.
- `tests/export.pdf-mold-doc-logo.spec.ts` (novo) — E2E de export: o raster da página muda com o logo presente. (Nota: o teste de "XObject a mais" previsto originalmente não se aplica — o export rasteriza o stage inteiro em um único PNG por página, então o logo é composto no raster; o teste compara o digest do raster com/sem logo.)

---

## Riscos e edge cases

1. **Tamanho do JSONB**: data URL embutida cresce o `design_data` (≤ ~400KB pós-normalização). Aceito conscientemente (decisão do usuário); o downscale agressivo mitiga. O histórico de undo não multiplica (meta fora dos snapshots).
2. **Dois pipelines de desenho**: canvas e export desenham independentes — o layout compartilhado (`layout.logo`) é a única fonte de geometria; desenhar **nos dois** lugares (risco conhecido da spec anterior).
3. **Imagem corrompida/data URL inválida**: `onerror` → logo não desenha (canvas) / export segue sem logo; nunca abortar.
4. **`arePropsEqual` do memo**: esquecer `moldDocLogo`/`innerTransformKind`/callbacks novos congela o render (bug análogo já ocorreu com `showNameHandle`).
5. **Corrida do Transformer interno**: manter `layer.draw()` síncrono no attach (lição do commit 1c2a5e2 / gotcha documentado).
6. **SVG sem dimensões intrínsecas**: rasterização assume altura 512px — logos SVG malformados podem distorcer; mitigado por preview no painel.
7. **Modo escuro**: logo claro pode sumir em fundo escuro (e vice-versa) — sem tratamento nesta spec (registrado em fora do escopo).
8. **Tiling do PDF**: logo arrastado para longe do contorno pode ser clipado/omitido em export multipágina — limitação **pré-existente** do bbox de interseção de tiles (mesma do bloco/seta, spec anterior, risco 7).
9. **Moldes pequenos**: logo default (altura do bloco) pode cobrir área útil — mitigado por handle (mover) + transform (reduzir) por molde.

## Revisões pós-implementação (11/06/2026, feedback do usuário)

1. **Rótulo**: a seção do painel passou de "Logotipo do projeto" para **"Logotipo do molde"** (o escopo segue global ao projeto — o texto auxiliar explica).
2. **Galeria de logotipos**: o usuário pode enviar **várias imagens** (máx. 6); a **selecionada** é a desenhada na documentação de todos os moldes. Modelo: `meta.moldDocLogoGallery: Array<{id, dataUrl, naturalWidth, naturalHeight}>` + `meta.moldDocLogoSelectedId: string | null` (null = nenhum logo exibido; clicar no item já selecionado desseleciona). O campo legado `meta.moldDocLogo` continua sendo **lido** como fallback (projetos salvos antes da galeria aparecem como galeria de um item, id `"legacy"`) e é **migrado/limpo na primeira escrita** da galeria. O logo efetivo é resolvido por `getSelectedMoldDocLogo(meta)` (`moldDocLogo.ts`), que devolve referências do próprio `meta` (estável para os renderers memoizados); consumidores: `Canvas.tsx`, `EditorToolbar.tsx` (export) e o debug E2E. Upload auto-seleciona a nova imagem; remover o item selecionado deixa nenhum selecionado; os ajustes por molde (`docImage*`) são independentes da imagem escolhida.
3. **Bug corrigido — margem de costura engolia os handles** (doc/seta/logo): a figura de margem (`kind: "seam"`, desenhada DEPOIS do molde-base) ligava `hitFillEnabled` quando o molde-base estava selecionado (`selectedIdsSet.has(baseId)` — o `baseId` de uma seam é o molde) e o interior fechado dela cobria os handles no hit canvas — sem hover nem arraste (relatado em moldes circulares; reproduzido também em retangulares). Fix em `Canvas.tsx` (`hitFillEnabled`): seams não entram no termo de seleção — o molde-base selecionado (logo abaixo) já fornece o hit de interior para arrastar, então a UX não muda e os handles voltam a ser o pixel mais alto. Regressão coberta em `tests/mold-doc-logo.spec.ts` ("margem de costura não engole os handles").

> Correções aplicadas após revisão adversarial (5 dimensões, achados verificados): (a) `useMoldDocLogoImage` reescrito com `useSyncExternalStore` — um decode que terminava entre o render e a inscrição deixava o logo invisível em renderers memoizados; (b) waiters do cache de imagem agora vivem na própria entrada — a eviction não descarta mais waiters pendentes (o `loadMoldDocLogoImage` do export podia pendurar para sempre); (c) effect de attach do Transformer interno ganhou `moldDocLogo` nas deps — remover o logo com o modo ativo deixava o Transformer preso a um proxy destruído; (d) teto de largura na normalização (1024px) e no layout (4096px local, reduzindo a altura proporcionalmente) — banners de aspecto extremo estouravam limites de canvas do navegador (que devolve `"data:,"` silenciosamente, agora rejeitado) e jogavam o estacionamento da seta para longe; (e) o canvas só passa o logo ao layout quando a imagem está decodificada — a seta não reserva mais espaço para um logo não desenhado, e canvas/PDF ficam consistentes.

---

## Plano de implementação (faseado)

1. **Modelo + layout**: `types.ts` + `moldDoc.ts` (logo box, defaults, circunraio da união) + `tests/mold-doc-logo.unit.spec.ts`.
2. **Contexto**: expor `setProjectMeta`; `meta` no snapshot de unsaved changes (+ `EditorHeader`).
3. **Upload**: `moldDocLogo.ts` (normalização + cache de imagem) + UI no `PropertiesPanel.tsx`.
4. **Canvas**: desenho + handle + proxy no `FigureRenderer.tsx`; fiação e transform interno no `Canvas.tsx`.
5. **Export**: preload + desenho em `export.ts`.
6. **Testes E2E** + verificação manual (`npm run dev`), lint/build.
