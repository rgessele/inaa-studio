import type { Tool } from "./types";

export type ModifierKey = "shift" | "alt" | "meta" | "ctrl" | "cmdOrCtrl";

export type PlatformKind = "mac" | "win";

export type ToolModifierTag = {
  key: ModifierKey;
  label: {
    mac: string;
    win: string;
  };
  descriptionPtBr: string;
};

export const TOOL_MODIFIER_TAGS: Record<Tool, ToolModifierTag[]> = {
  select: [
    {
      key: "shift",
      label: { mac: "⇧", win: "Shift" },
      descriptionPtBr: "Multi-seleção / manter proporção / snap de rotação",
    },
    {
      key: "alt",
      label: { mac: "⌥", win: "Alt" },
      descriptionPtBr: "Escalar pelo centro",
    },
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Modo aresta (selecionar arestas)",
    },
  ],
  node: [
    {
      key: "shift",
      label: { mac: "⇧", win: "Shift" },
      descriptionPtBr: "Travar ângulo (15°) ao arrastar",
    },
    {
      key: "alt",
      label: { mac: "⌥", win: "Alt" },
      descriptionPtBr: "Travar prévia de split no meio",
    },
  ],
  pan: [],
  measure: [],
  offset: [
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Modo remover (clique para apagar offset)",
    },
  ],
  mirror: [],
  unfold: [],
  rectangle: [
    {
      key: "shift",
      label: { mac: "⇧", win: "Shift" },
      descriptionPtBr: "Quadrado perfeito",
    },
    {
      key: "alt",
      label: { mac: "⌥", win: "Alt" },
      descriptionPtBr: "Desenhar a partir do centro",
    },
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Alta precisão (1mm)",
    },
  ],
  circle: [
    {
      key: "shift",
      label: { mac: "⇧", win: "Shift" },
      descriptionPtBr: "Círculo perfeito",
    },
    {
      key: "alt",
      label: { mac: "⌥", win: "Alt" },
      descriptionPtBr: "Desenhar a partir do centro",
    },
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Alta precisão (1mm)",
    },
  ],
  line: [
    {
      key: "shift",
      label: { mac: "⇧", win: "Shift" },
      descriptionPtBr: "Travar ângulo (15°)",
    },
    {
      key: "alt",
      label: { mac: "⌥", win: "Alt" },
      descriptionPtBr: "Desenhar a partir do centro",
    },
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Alta precisão (1mm)",
    },
  ],
  curve: [
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Alta precisão (1mm)",
    },
  ],
  text: [
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Alta precisão (1mm)",
    },
  ],
  dart: [
    {
      key: "shift",
      label: { mac: "⇧", win: "Shift" },
      descriptionPtBr: "Pence simétrica (ponto 3 no meio de A–B)",
    },
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Alta precisão (1mm)",
    },
  ],
  pique: [
    {
      key: "alt",
      label: { mac: "⌥", win: "Alt" },
      descriptionPtBr: "Travar no meio da aresta",
    },
    {
      key: "cmdOrCtrl",
      label: { mac: "⌘", win: "Ctrl" },
      descriptionPtBr: "Alta precisão (1mm)",
    },
  ],
};

export function detectPlatformKind(): PlatformKind {
  if (typeof navigator === "undefined") return "win";
  return /Mac|iPhone|iPod|iPad/.test(navigator.userAgent) ? "mac" : "win";
}

export function isModifierActive(
  mods: { shift: boolean; alt: boolean; meta: boolean; ctrl: boolean },
  key: ModifierKey
): boolean {
  if (key === "shift") return mods.shift;
  if (key === "alt") return mods.alt;
  if (key === "meta") return mods.meta;
  if (key === "cmdOrCtrl") return mods.meta || mods.ctrl;
  return mods.ctrl;
}
