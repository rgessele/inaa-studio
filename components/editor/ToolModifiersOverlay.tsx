"use client";

import React, { useEffect, useState } from "react";
import { useEditor } from "./EditorContext";
import {
  detectPlatformKind,
  isModifierActive,
  TOOL_MODIFIER_TAGS,
  type PlatformKind,
  type ToolModifierTag,
} from "./toolModifiers";

function ModifierTagChip({
  tag,
  active,
  platform,
}: {
  tag: ToolModifierTag;
  active: boolean;
  platform: "mac" | "win";
}) {
  return (
    <div
      className={
        "inline-flex items-center gap-2 rounded border px-2 py-1 text-[11px] leading-none " +
        "bg-white/60 dark:bg-gray-900/55 border-gray-200/60 dark:border-gray-700/60 " +
        (active
          ? "text-gray-900 dark:text-gray-50 bg-white/85 dark:bg-gray-900/80 border-gray-200 dark:border-gray-600"
          : "text-gray-600 dark:text-gray-300")
      }
    >
      <span className="font-semibold tracking-wide">
        {platform === "mac" ? tag.label.mac : tag.label.win}
      </span>
      <span className="whitespace-nowrap">{tag.descriptionPtBr}</span>
    </div>
  );
}

export function ToolModifiersOverlay() {
  const { tool, modifierKeys } = useEditor();

  // Hydration-safe: render a stable default first, then refine on client.
  const [platform, setPlatform] = useState<PlatformKind>("win");
  useEffect(() => {
    setPlatform(detectPlatformKind());
  }, []);
  const tags = TOOL_MODIFIER_TAGS[tool] ?? [];

  if (tags.length === 0) return null;

  return (
    <div className="absolute bottom-3 right-3 z-20 pointer-events-none select-none">
      <div className="flex flex-col items-end gap-1 opacity-70">
        {tags.map((tag) => (
          <ModifierTagChip
            key={tag.key}
            tag={tag}
            platform={platform}
            active={isModifierActive(modifierKeys, tag.key)}
          />
        ))}
      </div>
    </div>
  );
}
