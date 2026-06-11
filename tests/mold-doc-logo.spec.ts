import { expect, test } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

// Logotipo global na documentação do molde (docs/specs/mold-doc-logo-spec.md):
// upload no painel aplica a TODOS os moldes do projeto; o logo estaciona à
// esquerda dos textos com altura = altura do bloco; handle próprio para
// arrastar e duplo clique → transform interno (altura + rotação por molde).

// 64×32 PNG (aspecto 2:1), vermelho sólido — gerado por script, embutido para
// não depender de fixture em disco.
const LOGO_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAQUlEQVR42u3QMQEAAAQAMLnEUEtoerBjBRadNZ+FAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQcN8CBVuw8TKWKDIAAAAASUVORK5CYII=";

// 32×32 PNG (aspecto 1:1), azul sólido — segunda imagem da galeria; as
// dimensões distintas (32 vs 64 de largura) discriminam qual está selecionada.
const LOGO2_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3OIQEAAAgDMOIQh9i0ghg3E/Ornr2kEhAQEBAQEBAQEBAQEBAQSAceFJL8efQ5U9MAAAAASUVORK5CYII=";

type TestNode = { id: string; x: number; y: number; mode: "corner" };
type TestFigure = {
  id: string;
  tool: "line";
  kind?: "mold";
  name?: string;
  x: number;
  y: number;
  rotation: number;
  closed: boolean;
  nodes: TestNode[];
  edges: Array<{ id: string; from: string; to: string; kind: "line" }>;
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  moldMeta?: { grainline?: { angleDeg: number } };
};

function moldRect(
  id: string,
  origin: { x: number; y: number },
  extra?: Partial<TestFigure>
): TestFigure {
  const { x, y } = origin;
  const w = 160;
  const h = 200;
  const a = `${id}_a`;
  const b = `${id}_b`;
  const c = `${id}_c`;
  const d = `${id}_d`;
  return {
    id,
    tool: "line",
    kind: "mold",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: a, x, y, mode: "corner" },
      { id: b, x: x + w, y, mode: "corner" },
      { id: c, x: x + w, y: y + h, mode: "corner" },
      { id: d, x, y: y + h, mode: "corner" },
    ],
    edges: [
      { id: `${id}_e1`, from: a, to: b, kind: "line" },
      { id: `${id}_e2`, from: b, to: c, kind: "line" },
      { id: `${id}_e3`, from: c, to: d, kind: "line" },
      { id: `${id}_e4`, from: d, to: a, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: "rgba(96,165,250,0.22)",
    opacity: 1,
    ...extra,
  };
}

const MOLD_A_ORIGIN = { x: 200, y: 180 };
const MOLD_A_CENTER = { x: 280, y: 280 };
const MOLD_B_ORIGIN = { x: 460, y: 180 };

async function loadFigures(
  page: import("@playwright/test").Page,
  figures: TestFigure[],
  meta?: { moldDocLogo: { dataUrl: string; naturalWidth: number; naturalHeight: number } }
) {
  await page.evaluate(
    (payload) => {
      window.__INAA_DEBUG__?.loadTestProject?.({
        figures: payload.figures,
        meta: payload.meta,
      });
    },
    { figures, meta }
  );
  await expect
    .poll(async () =>
      page.evaluate(() => window.__INAA_DEBUG__?.getState?.().figuresCount ?? 0)
    )
    .toBe(figures.length);
}

async function selectMoldAt(
  page: import("@playwright/test").Page,
  position = MOLD_A_CENTER
) {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  await stage.click({ position });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .not.toBeNull();
}

async function uploadLogo(
  page: import("@playwright/test").Page,
  b64: string = LOGO_PNG_B64
) {
  await page.getByTestId("mold-doc-logo-upload").setInputFiles({
    name: "logo-test.png",
    mimeType: "image/png",
    buffer: Buffer.from(b64, "base64"),
  });
  // Upload adiciona à galeria e auto-seleciona.
  await expect
    .poll(async () => (await getEditorState(page)).moldDocLogo ?? null)
    .not.toBeNull();
}

async function countByName(
  page: import("@playwright/test").Page,
  name: string
): Promise<number> {
  return page.evaluate(
    (n) => window.__INAA_DEBUG__?.countStageNodesByName?.(n) ?? 0,
    name
  );
}

async function clientRects(
  page: import("@playwright/test").Page,
  name: string
) {
  return page.evaluate(
    (n) => window.__INAA_DEBUG__?.getStageNodeClientRectsByName?.(n) ?? [],
    name
  );
}

type MoldSnapshot = {
  id: string;
  moldMeta?: {
    docImageOffsetLocal?: { x: number; y: number };
    docImageHeightLocal?: number;
    docImageRotationDeg?: number;
  };
};

async function getMolds(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as MoldSnapshot[]
  );
}

async function stageBox(page: import("@playwright/test").Page) {
  const box = await page.getByTestId("editor-stage-container").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/**
 * Move o mouse para o CENTRO do handle até o cursor "grab" ativar e devolve o
 * ponto (coords de página). Re-entra a cada tentativa (sai e volta) porque um
 * único mouse.move pode disparar antes de o hit canvas do handle estar pronto
 * sob carga — sem novo movimento o mouseenter nunca ocorre.
 */
async function hoverHandleUntilGrab(
  page: import("@playwright/test").Page,
  name: string
) {
  const box = await stageBox(page);
  let at: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      const [r] = await clientRects(page, name);
      if (!r) return "";
      await page.mouse.move(box.x + r.x - 25, box.y + r.y - 25);
      const center = {
        x: box.x + r.x + r.width / 2,
        y: box.y + r.y + r.height / 2,
      };
      await page.mouse.move(center.x, center.y);
      at = center;
      return page.evaluate(
        () =>
          (
            window as unknown as {
              Konva?: { stages: Array<{ container: () => HTMLElement }> };
            }
          ).Konva?.stages?.[0]?.container()?.style.cursor ?? ""
      );
    })
    .toBe("grab");
  return at! as { x: number; y: number };
}

async function drag(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

function rotateAround(
  p: { x: number; y: number },
  pivot: { x: number; y: number },
  deg: number
) {
  const rad = (deg * Math.PI) / 180;
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/** Center (stage coords) of an inner-transformer anchor near `near`. */
async function anchorCenter(
  page: import("@playwright/test").Page,
  name: string,
  near: { x: number; y: number },
  tolerancePx = 200
) {
  let found: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      const rects = await page.evaluate(
        (n) => window.__INAA_DEBUG__?.getStageNodeClientRectsByName?.(n) ?? [],
        name
      );
      for (const r of [...rects].reverse()) {
        const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        if (Math.hypot(c.x - near.x, c.y - near.y) <= tolerancePx) {
          found = c;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found! as { x: number; y: number };
}

test("upload aplica o logo a todos os moldes; remover limpa todos", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [
    moldRect("mold_a", MOLD_A_ORIGIN, { name: "Frente" }),
    moldRect("mold_b", MOLD_B_ORIGIN, { name: "Costas" }),
  ]);
  await selectMoldAt(page);

  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(0);
  await uploadLogo(page);

  // Desenhado nos DOIS moldes; dimensões normalizadas registradas no meta.
  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(2);
  const state = await getEditorState(page);
  expect(state.moldDocLogo?.naturalWidth).toBe(64);
  expect(state.moldDocLogo?.naturalHeight).toBe(32);
  // Anexar o logo marca o projeto como não salvo (meta entra no snapshot).
  expect(state.hasUnsavedChanges).toBe(true);
  await expect(page.getByTestId("mold-doc-logo-item")).toBeVisible();

  await page.getByTestId("mold-doc-logo-remove").click();
  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(0);
  await expect
    .poll(async () => (await getEditorState(page)).moldDocLogo ?? null)
    .toBeNull();
});

test("galeria: várias imagens, a selecionada aparece; alternar e remover", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [
    moldRect("mold_a", MOLD_A_ORIGIN, { name: "Frente" }),
  ]);
  await selectMoldAt(page);

  // 1ª imagem (64×32) — adicionada e auto-selecionada.
  await uploadLogo(page, LOGO_PNG_B64);
  await expect
    .poll(async () => (await getEditorState(page)).moldDocLogo?.naturalWidth)
    .toBe(64);

  // 2ª imagem (32×32) — adicionada e auto-selecionada no lugar da 1ª.
  await uploadLogo(page, LOGO2_PNG_B64);
  let state = await getEditorState(page);
  expect(state.moldDocLogoGalleryCount).toBe(2);
  expect(state.moldDocLogo?.naturalWidth).toBe(32);
  await expect(page.getByTestId("mold-doc-logo-item")).toHaveCount(2);

  // Clicar na 1ª volta a exibi-la nos moldes.
  await page.getByTestId("mold-doc-logo-item").nth(0).click();
  await expect
    .poll(async () => (await getEditorState(page)).moldDocLogo?.naturalWidth)
    .toBe(64);
  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(1);

  // Clicar na já selecionada oculta o logotipo (nenhum selecionado).
  await page.getByTestId("mold-doc-logo-item").nth(0).click();
  await expect
    .poll(async () => (await getEditorState(page)).moldDocLogo ?? null)
    .toBeNull();
  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(0);
  // A galeria continua com as duas imagens.
  state = await getEditorState(page);
  expect(state.moldDocLogoGalleryCount).toBe(2);

  // Remover a 2ª imagem: galeria fica com 1; nada selecionado segue sem logo.
  await page.getByTestId("mold-doc-logo-remove").nth(1).click();
  await expect(page.getByTestId("mold-doc-logo-item")).toHaveCount(1);
  state = await getEditorState(page);
  expect(state.moldDocLogoGalleryCount).toBe(1);
  expect(state.moldDocLogo ?? null).toBeNull();
});

test("galeria: projeto legado (meta.moldDocLogo) aparece como item selecionado", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(
    page,
    [moldRect("mold_a", MOLD_A_ORIGIN, { name: "Frente" })],
    {
      moldDocLogo: {
        dataUrl: `data:image/png;base64,${LOGO_PNG_B64}`,
        naturalWidth: 64,
        naturalHeight: 32,
      },
    }
  );
  await selectMoldAt(page);

  // O campo legado é exibido como galeria de um item, selecionado e desenhado.
  await expect(page.getByTestId("mold-doc-logo-item")).toHaveCount(1);
  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(1);

  // Enviar uma nova imagem migra o legado para a galeria (2 itens) e
  // seleciona a nova.
  await uploadLogo(page, LOGO2_PNG_B64);
  const state = await getEditorState(page);
  expect(state.moldDocLogoGalleryCount).toBe(2);
  expect(state.moldDocLogo?.naturalWidth).toBe(32);
});

test("altura default = altura do bloco de textos; aspecto preservado", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [
    moldRect("mold_h", MOLD_A_ORIGIN, { name: "Frente" }),
  ]);
  await selectMoldAt(page);
  await uploadLogo(page);

  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(1);
  const [logoRect] = await clientRects(page, "inaa-mold-doc-logo");
  const [docRect] = await clientRects(page, "inaa-mold-doc");
  expect(logoRect).toBeTruthy();
  expect(docRect).toBeTruthy();
  // Mesma altura do bloco (tolerância de raster/stroke).
  expect(Math.abs(logoRect!.height - docRect!.height)).toBeLessThan(3);
  // Aspecto 2:1 do PNG preservado.
  expect(logoRect!.width / logoRect!.height).toBeGreaterThan(1.9);
  expect(logoRect!.width / logoRect!.height).toBeLessThan(2.1);
  // À esquerda dos textos.
  expect(logoRect!.x + logoRect!.width).toBeLessThanOrEqual(docRect!.x + 1);
});

test("arrastar o handle do logo persiste docImageOffsetLocal só naquele molde", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [
    moldRect("mold_a", MOLD_A_ORIGIN, { name: "Frente" }),
    moldRect("mold_b", MOLD_B_ORIGIN, { name: "Costas" }),
  ]);
  await selectMoldAt(page);
  await uploadLogo(page);

  // Handle só no molde selecionado.
  await expect.poll(() => countByName(page, "inaa-logo-handle")).toBe(1);
  const start = await hoverHandleUntilGrab(page, "inaa-logo-handle");

  const [logoBefore] = await clientRects(page, "inaa-mold-doc-logo");
  await drag(page, start, { x: start.x + 50, y: start.y + 35 });

  const molds = await getMolds(page);
  const a = molds.find((m) => m.id === "mold_a");
  const b = molds.find((m) => m.id === "mold_b");
  expect(a?.moldMeta?.docImageOffsetLocal).toBeTruthy();
  expect(b?.moldMeta?.docImageOffsetLocal).toBeFalsy();

  // O logo do molde A de fato se moveu (~50, ~35 na escala default).
  const rects = await clientRects(page, "inaa-mold-doc-logo");
  const moved = rects.find(
    (r) =>
      Math.abs(r.x - (logoBefore!.x + 50)) < 8 &&
      Math.abs(r.y - (logoBefore!.y + 35)) < 8
  );
  expect(moved).toBeTruthy();
});

test("transform interno do logo: redimensionar e rotacionar por molde", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [
    moldRect("mold_t", MOLD_A_ORIGIN, { name: "Frente" }),
  ]);
  await selectMoldAt(page);
  await uploadLogo(page);

  await expect.poll(() => countByName(page, "inaa-logo-handle")).toBe(1);
  const box = await stageBox(page);
  const h = await hoverHandleUntilGrab(page, "inaa-logo-handle");
  await page.mouse.dblclick(h.x, h.y);
  await expect.poll(() => countByName(page, "inaa-inner-proxy-logo")).toBe(1);
  // Transformer externo suspenso durante o modo interno.
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(0);

  // Pivô = centro do logo (escala centrada / rotação em torno do centro).
  const [logoRect] = await clientRects(page, "inaa-mold-doc-logo");
  const pivotStage = {
    x: logoRect!.x + logoRect!.width / 2,
    y: logoRect!.y + logoRect!.height / 2,
  };
  const pivot = { x: box.x + pivotStage.x, y: box.y + pivotStage.y };

  // Redimensionar ~1.6x: altura default (30 = bloco do nome) → ~48.
  const corner = await anchorCenter(page, "bottom-right", pivotStage);
  const cStart = { x: box.x + corner.x, y: box.y + corner.y };
  const cEnd = {
    x: pivot.x + (cStart.x - pivot.x) * 1.6,
    y: pivot.y + (cStart.y - pivot.y) * 1.6,
  };
  await drag(page, cStart, cEnd);

  let molds = await getMolds(page);
  const height = molds[0]?.moldMeta?.docImageHeightLocal ?? 0;
  expect(height).toBeGreaterThan(38);
  expect(height).toBeLessThan(70);

  // Rotacionar ~45° em torno do centro do logo.
  const rotater = await anchorCenter(page, "rotater", pivotStage);
  const rStart = { x: box.x + rotater.x, y: box.y + rotater.y };
  await drag(page, rStart, rotateAround(rStart, pivot, 45));

  molds = await getMolds(page);
  const rot = molds[0]?.moldMeta?.docImageRotationDeg ?? 0;
  expect(Math.abs(rot - 45)).toBeLessThan(10);

  // Esc sai do modo e restaura o transform externo.
  await page.keyboard.press("Escape");
  await expect.poll(() => countByName(page, "inaa-inner-proxy-logo")).toBe(0);
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(1);
});

test("undo após o upload não remove o logo (anexar fica fora do histórico)", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [
    moldRect("mold_u", MOLD_A_ORIGIN, { name: "Frente" }),
  ]);
  await selectMoldAt(page);
  await uploadLogo(page);
  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(1);

  await page.keyboard.press("ControlOrMeta+z");
  // O logo permanece; nenhuma figura é revertida.
  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(1);
  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBe(1);
});

test("projeto carregado com logo no meta desenha em todos os moldes", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(
    page,
    [
      moldRect("mold_a", MOLD_A_ORIGIN, { name: "Frente" }),
      moldRect("mold_b", MOLD_B_ORIGIN, { name: "Costas" }),
    ],
    {
      moldDocLogo: {
        dataUrl: `data:image/png;base64,${LOGO_PNG_B64}`,
        naturalWidth: 64,
        naturalHeight: 32,
      },
    }
  );

  await expect.poll(() => countByName(page, "inaa-mold-doc-logo")).toBe(2);
  const state = await getEditorState(page);
  expect(state.moldDocLogo?.naturalWidth).toBe(64);
  // Obs.: não dá para asserir hasUnsavedChanges === false aqui — um effect
  // pós-load anota `measures` nas figuras de teste (que não as trazem),
  // divergência PRÉ-EXISTENTE do snapshot que não envolve o meta/logo.
});

test("margem de costura não engole os handles da documentação (regressão)", async ({
  page,
}) => {
  // Bug: a figura de margem (seam, desenhada DEPOIS do molde) ligava o hit
  // do interior quando o molde-base estava selecionado e cobria os handles
  // de documentação/seta/logo no hit canvas — sem hover nem arraste.
  await gotoEditor(page);
  await loadFigures(page, [
    moldRect("mold_seam", MOLD_A_ORIGIN, { name: "Frente" }),
  ]);

  // Aplica a margem com a ferramenta real (clique no interior do molde).
  await page.getByRole("button", { name: "Margem de costura" }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)
    )
    .toBe("offset");
  const box = await stageBox(page);
  await page.mouse.click(box.x + MOLD_A_CENTER.x, box.y + MOLD_A_CENTER.y);
  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBe(2);

  // Seleciona o molde e anexa o logo.
  await page.getByRole("button", { name: "Selecionar" }).click();
  await selectMoldAt(page);
  await uploadLogo(page);
  await expect.poll(() => countByName(page, "inaa-logo-handle")).toBe(1);

  // Hover no handle do logo ativa o cursor de arraste (hit não é mais da margem).
  await hoverHandleUntilGrab(page, "inaa-logo-handle");

  // Arrastar o handle da documentação move o bloco de textos.
  const docHandle = await hoverHandleUntilGrab(page, "inaa-figure-name-handle");
  const [docBefore] = await clientRects(page, "inaa-mold-doc");
  expect(docBefore).toBeTruthy();
  await drag(page, docHandle, {
    x: docHandle.x + 40,
    y: docHandle.y + 25,
  });
  await expect
    .poll(async () => {
      const [r] = await clientRects(page, "inaa-mold-doc");
      return r
        ? Math.abs(r.x - (docBefore!.x + 40)) < 8 &&
            Math.abs(r.y - (docBefore!.y + 25)) < 8
        : false;
    })
    .toBe(true);
});
