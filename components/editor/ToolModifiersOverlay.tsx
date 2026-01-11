"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
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
  const { tool, modifierKeys, scale } = useEditor();

  // Hydration-safe without setState-in-effect: server snapshot is stable,
  // client snapshot detects platform.
  const platform = useSyncExternalStore<PlatformKind>(
    () => {
      return () => {
        // no-op
      };
    },
    () => detectPlatformKind(),
    () => "win"
  );
  const tags = TOOL_MODIFIER_TAGS[tool] ?? [];

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
        <div className="flex items-center gap-2 pointer-events-auto">
          <SystemStatus />
          <ZoomIndicator scale={scale} />
        </div>
      </div>
    </div>
  );
}

function StatusTooltip({
  children,
  text,
}: {
  children: React.ReactNode;
  text: string;
}) {
  return (
    <div className="group relative flex items-center justify-center cursor-help">
      {children}
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1.5 bg-gray-900/90 dark:bg-gray-800/90 backdrop-blur-sm text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10">
        {text}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/90 dark:border-t-gray-800/90" />
      </div>
    </div>
  );
}

function SystemStatus() {
  const { figures } = useEditor();
  const [fps, setFps] = useState(60);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;

    const loop = () => {
      const now = performance.now();
      frameCount++;
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const figureCount = figures.length;
  const nodeCount = figures.reduce((acc, f) => acc + f.nodes.length, 0);

  let fpsColor = "text-emerald-600 dark:text-emerald-400";
  if (fps < 30) fpsColor = "text-red-600 dark:text-red-400";
  else if (fps < 50) fpsColor = "text-amber-600 dark:text-amber-400";

  return (
    <div
      className={
        "inline-flex h-6 items-center gap-2 rounded border px-2 text-[11px] font-medium leading-none " +
        "bg-white/60 dark:bg-gray-900/55 border-gray-200/60 dark:border-gray-700/60 " +
        "text-gray-500 dark:text-gray-400 tabular-nums"
      }
    >
      <StatusTooltip text="Total de Figuras">
        <div className="flex items-center gap-1">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "12px" }}
          >
            shapes
          </span>
          <span>{figureCount}</span>
        </div>
      </StatusTooltip>

      <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />

      <StatusTooltip text="Total de Nós (Vértices)">
        <div className="flex items-center gap-1">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "12px" }}
          >
            share
          </span>
          <span>{nodeCount}</span>
        </div>
      </StatusTooltip>

      <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />

      <StatusTooltip text="Quadros por segundo (FPS)">
        <div className={`flex items-center gap-1 ${fpsColor}`}>
          <span>{fps} FPS</span>
        </div>
      </StatusTooltip>
    </div>
  );
}

function ZoomIndicator({ scale }: { scale: number }) {
  return (
    <div
      className={
        "inline-flex h-6 items-center gap-2 rounded border px-2 text-[11px] font-medium leading-none " +
        "bg-white/60 dark:bg-gray-900/55 border-gray-200/60 dark:border-gray-700/60 " +
        "text-gray-600 dark:text-gray-300 tabular-nums"
      }
    >
      <svg
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <span className="tracking-wide">{Math.round(scale * 100)}%</span>
    </div>
  );
}
