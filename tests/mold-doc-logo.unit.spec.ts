import { expect, test } from "./helpers/test";
import { computeMoldDocLayoutLocal } from "../components/editor/moldDoc";
import type { Figure, MoldMeta } from "../components/editor/types";

/**
 * Pure-logic tests for the mold documentation LOGO layout
 * (docs/specs/mold-doc-logo-spec.md). Mirrors the convention of
 * selection-transform.spec.ts: imports editor modules directly.
 */

const LOGO = { naturalWidth: 200, naturalHeight: 100 }; // aspect 2:1

function makeMold(overrides?: {
  name?: string | null;
  moldMeta?: MoldMeta;
}): Figure {
  // 200×120 closed rectangle → centroid (100, 60), min bbox side 120.
  return {
    id: "mold1",
    name: overrides?.name === null ? undefined : (overrides?.name ?? "Frente"),
    tool: "rectangle",
    kind: "mold",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    stroke: "aci7",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
    nodes: [
      { id: "n1", x: 0, y: 0, mode: "corner" },
      { id: "n2", x: 200, y: 0, mode: "corner" },
      { id: "n3", x: 200, y: 120, mode: "corner" },
      { id: "n4", x: 0, y: 120, mode: "corner" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", kind: "line" },
      { id: "e2", from: "n2", to: "n3", kind: "line" },
      { id: "e3", from: "n3", to: "n4", kind: "line" },
      { id: "e4", from: "n4", to: "n1", kind: "line" },
    ],
    moldMeta: overrides?.moldMeta,
  } as Figure;
}

test("logo: default = altura do bloco, aspecto preservado, à esquerda dos textos", () => {
  const layout = computeMoldDocLayoutLocal(makeMold(), LOGO);
  expect(layout).not.toBeNull();
  const logo = layout!.logo!;
  expect(logo).toBeTruthy();

  // Altura padrão = altura do bloco de textos; largura segue o aspect ratio.
  expect(logo.height).toBeCloseTo(layout!.blockHeight, 6);
  expect(logo.width).toBeCloseTo(logo.height * 2, 6);

  // Estacionado à esquerda: borda direita do logo separada da borda esquerda
  // da caixa de textos pelo gap = max(10, round(0.5 * docFont(14))) = 10.
  const gap = 10;
  expect(logo.center.x).toBeCloseTo(
    -(layout!.blockWidth / 2) - gap - logo.width / 2,
    6
  );
  expect(logo.center.y).toBeCloseTo(0, 6);
  expect(logo.rotationDeg).toBe(0);
});

test("logo: docImageHeightLocal vence o default (com clamp)", () => {
  const custom = computeMoldDocLayoutLocal(
    makeMold({ moldMeta: { docImageHeightLocal: 100 } }),
    LOGO
  )!.logo!;
  expect(custom.height).toBeCloseTo(100, 6);
  expect(custom.width).toBeCloseTo(200, 6);

  const tooSmall = computeMoldDocLayoutLocal(
    makeMold({ moldMeta: { docImageHeightLocal: 2 } }),
    LOGO
  )!.logo!;
  expect(tooSmall.height).toBe(8);

  // Altura clampada em 4096; com aspect 2:1 a largura estouraria 8192, então
  // o teto de largura (4096) reduz a altura proporcionalmente para 2048.
  const tooBig = computeMoldDocLayoutLocal(
    makeMold({ moldMeta: { docImageHeightLocal: 99999 } }),
    LOGO
  )!.logo!;
  expect(tooBig.width).toBe(4096);
  expect(tooBig.height).toBe(2048);
});

test("logo: docImageOffsetLocal substitui a posição automática", () => {
  const logo = computeMoldDocLayoutLocal(
    makeMold({ moldMeta: { docImageOffsetLocal: { x: 5, y: -7 } } }),
    LOGO
  )!.logo!;
  expect(logo.center.x).toBeCloseTo(5, 6);
  expect(logo.center.y).toBeCloseTo(-7, 6);
});

test("logo: rotação relativa normalizada para [0,360)", () => {
  const logo = computeMoldDocLayoutLocal(
    makeMold({ moldMeta: { docImageRotationDeg: 380.5 } }),
    LOGO
  )!.logo!;
  expect(logo.rotationDeg).toBeCloseTo(20.5, 6);

  const invalid = computeMoldDocLayoutLocal(
    makeMold({ moldMeta: { docImageRotationDeg: Number.NaN } }),
    LOGO
  )!.logo!;
  expect(invalid.rotationDeg).toBe(0);
});

test("logo: documentação vazia → centrado no anchor com altura fallback", () => {
  const layout = computeMoldDocLayoutLocal(makeMold({ name: null }), LOGO);
  // Sem linhas e sem fio, o layout só existe por causa do logo.
  expect(layout).not.toBeNull();
  expect(layout!.lines).toHaveLength(0);
  const logo = layout!.logo!;
  expect(logo.center.x).toBeCloseTo(0, 6);
  expect(logo.center.y).toBeCloseTo(0, 6);
  // Fallback: max(24, 0.3 * min(200, 120)) = 36.
  expect(logo.height).toBeCloseTo(36, 6);
});

test("logo: sem logo ou com dimensões inválidas → layout.logo null (regressão)", () => {
  const noLogo = computeMoldDocLayoutLocal(makeMold());
  expect(noLogo).not.toBeNull();
  expect(noLogo!.logo).toBeNull();

  const badDims = computeMoldDocLayoutLocal(makeMold(), {
    naturalWidth: 0,
    naturalHeight: 100,
  });
  expect(badDims!.logo).toBeNull();

  // Figura vazia (sem nome) + logo inválido → nada a desenhar.
  const empty = computeMoldDocLayoutLocal(makeMold({ name: null }), {
    naturalWidth: 0,
    naturalHeight: 0,
  });
  expect(empty).toBeNull();

  // Figura comum nunca tem documentação.
  const plain = { ...makeMold(), kind: undefined } as Figure;
  expect(computeMoldDocLayoutLocal(plain, LOGO)).toBeNull();
});

test("seta do fio: estaciona mais à esquerda quando o logo está presente", () => {
  const withFio = (logo: typeof LOGO | null) =>
    computeMoldDocLayoutLocal(
      makeMold({ moldMeta: { grainline: { angleDeg: 0 } } }),
      logo
    )!.grain!;

  const without = withFio(null);
  const withLogo = withFio(LOGO);
  expect(without).toBeTruthy();
  expect(withLogo).toBeTruthy();

  // O circunraio da união (textos ∪ logo) afasta a seta para além do logo.
  expect(withLogo.tip.x).toBeLessThan(without.tip.x);
  expect(withLogo.tail.x).toBeLessThan(without.tail.x);
});

test("seta do fio: grainOffsetLocal do usuário ignora o logo (sem re-estacionar)", () => {
  const make = (logo: typeof LOGO | null) =>
    computeMoldDocLayoutLocal(
      makeMold({
        moldMeta: {
          grainline: { angleDeg: 0 },
          grainOffsetLocal: { x: 12, y: 34 },
        },
      }),
      logo
    )!.grain!;

  const a = make(null);
  const b = make(LOGO);
  expect(b.tail.x).toBeCloseTo(a.tail.x, 6);
  expect(b.tail.y).toBeCloseTo(a.tail.y, 6);
  expect(b.tip.x).toBeCloseTo(a.tip.x, 6);
});

// ===== Galeria: seleção do logo efetivo (getSelectedMoldDocLogo) =====

import {
  getMoldDocLogoGalleryItems,
  getSelectedMoldDocLogo,
  getSelectedMoldDocLogoId,
} from "../components/editor/moldDocLogo";

const ITEM_A = { id: "a", dataUrl: "data:image/png;base64,AA", naturalWidth: 64, naturalHeight: 32 };
const ITEM_B = { id: "b", dataUrl: "data:image/png;base64,BB", naturalWidth: 32, naturalHeight: 32 };
const LEGACY = { dataUrl: "data:image/png;base64,LL", naturalWidth: 10, naturalHeight: 10 };

test("galeria: sem meta → sem logo", () => {
  expect(getSelectedMoldDocLogo(undefined)).toBeNull();
  expect(getSelectedMoldDocLogoId(undefined)).toBeNull();
  expect(getMoldDocLogoGalleryItems(undefined)).toEqual([]);
});

test("galeria: campo legado vira item único selecionado", () => {
  const meta = { moldDocLogo: LEGACY };
  expect(getSelectedMoldDocLogo(meta)).toBe(LEGACY);
  expect(getSelectedMoldDocLogoId(meta)).toBe("legacy");
  expect(getMoldDocLogoGalleryItems(meta)).toEqual([{ id: "legacy", ...LEGACY }]);
});

test("galeria: item selecionado é o efetivo; referência estável", () => {
  const meta = {
    moldDocLogoGallery: [ITEM_A, ITEM_B],
    moldDocLogoSelectedId: "b",
  };
  // Mesma referência do item da galeria (estável p/ renderers memoizados).
  expect(getSelectedMoldDocLogo(meta)).toBe(ITEM_B);
});

test("galeria: nenhum selecionado (null/ausente/id inexistente) → sem logo", () => {
  expect(
    getSelectedMoldDocLogo({ moldDocLogoGallery: [ITEM_A], moldDocLogoSelectedId: null })
  ).toBeNull();
  expect(getSelectedMoldDocLogo({ moldDocLogoGallery: [ITEM_A] })).toBeNull();
  expect(
    getSelectedMoldDocLogo({ moldDocLogoGallery: [ITEM_A], moldDocLogoSelectedId: "zz" })
  ).toBeNull();
});

test("galeria: presença da galeria ignora o campo legado", () => {
  const meta = {
    moldDocLogo: LEGACY,
    moldDocLogoGallery: [ITEM_A],
    moldDocLogoSelectedId: "a",
  };
  expect(getSelectedMoldDocLogo(meta)).toBe(ITEM_A);
  // Galeria vazia + legado presente: galeria manda — sem logo.
  expect(
    getSelectedMoldDocLogo({ moldDocLogo: LEGACY, moldDocLogoGallery: [] })
  ).toBeNull();
});
