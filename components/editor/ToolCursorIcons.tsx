import React from "react";

type ToolName =
  | "select"
  | "pan"
  | "node"
  | "rectangle"
  | "circle"
  | "line"
  | "pen"
  | "curve"
  | "text"
  | "measure"
  | "pique"
  | "offset"
  | "extractMold"
  | "dart"
  | "mirror"
  | "unfold";

type IconProps = {
  className?: string;
  strokeWidth?: number;
};

function Svg({
  className,
  strokeWidth = 1.5,
  children,
}: React.PropsWithChildren<IconProps>) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

type ToolIconVariant = "cursor" | "toolbar";

export function getToolIcon(
  tool: string,
  variant: ToolIconVariant,
  extraClassName?: string
): React.ReactNode | null {
  const baseClass =
    variant === "cursor"
      ? "w-4 h-4 text-gray-700 dark:text-gray-200"
      : "w-5 h-5 stroke-current";

  const className = extraClassName || baseClass;
  const strokeWidth = variant === "cursor" ? 1.5 : 1.5;
  return getToolIconInternal(tool, className, strokeWidth);
}

function getToolIconInternal(
  tool: string,
  className: string,
  strokeWidth: number
): React.ReactNode | null {
  // Cursor overlay is intentionally disabled for tools where the native cursor is already clear.
  // (Toolbar may still request icons for these tools, but we return null to keep behavior explicit.)
  if (tool === "select" || tool === "pan") return null;

  switch (tool as ToolName) {
    case "rectangle":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <rect x="6" y="6" width="12" height="12" />
        </Svg>
      );
    case "circle":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <circle cx="12" cy="12" r="6" />
        </Svg>
      );
    case "line":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M6 18L18 6" />
          <circle cx="6" cy="18" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18" cy="6" r="1.2" fill="currentColor" stroke="none" />
        </Svg>
      );
    case "pen":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M6.5 16.5L12 6l5.5 10.5L12 21z" />
          <path d="M10 12h4" />
        </Svg>
      );
    case "curve":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M6 18C8.5 9.5 13.5 14.5 18 6" />
          <circle cx="6" cy="18" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18" cy="6" r="1.2" fill="currentColor" stroke="none" />
        </Svg>
      );
    case "text":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M6 7h12" />
          <path d="M12 7v13" />
          <path d="M9 20h6" />
        </Svg>
      );
    case "measure":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M5 18H19" />
          <path d="M5 18L7 16" />
          <path d="M5 18L7 20" />
          <path d="M19 18L17 16" />
          <path d="M19 18L17 20" />
          <path d="M9 17V19" />
          <path d="M12 16.6V19.4" />
          <path d="M15 17V19" />
        </Svg>
      );
    case "pique":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          {/* Pique: traço perpendicular sobre uma borda */}
          <path d="M6 12H18" />
          <path d="M12 12V6" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </Svg>
      );
    case "offset":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <rect x="6" y="6" width="12" height="12" />
          <rect x="3" y="3" width="18" height="18" strokeDasharray="2 2" />
        </Svg>
      );
    case "extractMold":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M5 6h9l5 5v7H10l-5-5z" />
          <path d="M10 6v5h5" />
          <path d="M6.5 12.5l2 2 2.5-2.5 2 2 3-3" />
        </Svg>
      );
    case "dart":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M6 7H18" />
          <path d="M9 7L12 12L15 7" />
          <path d="M12 12V19" />
        </Svg>
      );
    case "mirror":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          {/* Espelhar: original sólido + cópia tracejada */}
          <path d="M12 4v16" />
          <rect x="5" y="7" width="3.6" height="10" rx="1" />
          <rect
            x="15.4"
            y="7"
            width="3.6"
            height="10"
            rx="1"
            strokeDasharray="2 2"
          />
          {/* seta de criação (esquerda -> direita) */}
          <path d="M9.4 12H14.6" />
          <path d="M13.4 10.8L14.6 12L13.4 13.2" />
          {/* sinal de mais dentro do lado tracejado */}
          <path d="M16.9 11V13" />
          <path d="M15.9 12H17.9" />
        </Svg>
      );
    case "unfold":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          {/* Desespelhar: mostra um par espelhado com o lado "removível" tracejado */}
          <path d="M12 4v16" />
          <rect x="5" y="7" width="3.6" height="10" rx="1" />
          <rect
            x="15.4"
            y="7"
            width="3.6"
            height="10"
            rx="1"
            strokeDasharray="2 2"
          />
          {/* seta de remoção (direita -> esquerda) */}
          <path d="M14.6 12H10.4" />
          <path d="M11.6 10.8L10.4 12L11.6 13.2" />
          {/* sinal de menos dentro do lado tracejado */}
          <path d="M16.2 12H18.2" />
        </Svg>
      );
    case "node":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
          <circle cx="6" cy="18" r="2" />
          <path d="M8 6H16" />
          <path d="M18 8V16" />
          <path d="M16 18H8" />
          <path d="M6 16V8" />
        </Svg>
      );
    default:
      // For future tools: return null until an icon is added.
      return null;
  }
}

export function getToolCursorIcon(tool: string): React.ReactNode | null {
  return getToolIcon(tool, "cursor");
}

export function isToolCursorOverlayEnabled(tool: string): boolean {
  if (tool === "select" || tool === "pan") return false;
  return (
    tool === "node" ||
    tool === "rectangle" ||
    tool === "circle" ||
    tool === "line" ||
    tool === "pen" ||
    tool === "curve" ||
    tool === "text" ||
    tool === "measure" ||
    tool === "pique" ||
    tool === "offset" ||
    tool === "extractMold" ||
    tool === "dart" ||
    tool === "mirror" ||
    tool === "unfold"
  );
}
