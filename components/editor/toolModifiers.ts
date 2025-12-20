import type { Tool } from "./types";

export type ModifierKey = "shift" | "alt" | "meta" | "ctrl";

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
      descriptionPtBr: "Selecionar aresta / escalar pelo centro",
    },
  ],
  node: [
    {
      key: "alt",
      label: { mac: "⌥", win: "Alt" },
      descriptionPtBr: "Travar prévia de split no meio",
    },
  ],
  pan: [],
  measure: [],
  offset: [],
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
  ],
  curve: [],
  dart: [],
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
  return mods.ctrl;
}
