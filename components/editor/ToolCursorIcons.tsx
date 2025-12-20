import React from "react";

type ToolName =
  | "select"
  | "pan"
  | "node"
  | "rectangle"
  | "circle"
  | "line"
  | "curve"
  | "measure"
  | "offset"
  | "dart"
  | "mirror"
  | "unfold";

type IconProps = {
  className?: string;
  strokeWidth?: number;
};

function Svg({ className, strokeWidth = 1.5, children }: React.PropsWithChildren<IconProps>) {
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

export function getToolIcon(tool: string, variant: ToolIconVariant): React.ReactNode | null {
  const className =
    variant === "cursor"
      ? "w-4 h-4 text-gray-700 dark:text-gray-200"
      : "w-5 h-5 stroke-current";
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
    case "curve":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M6 18C8.5 9.5 13.5 14.5 18 6" />
          <circle cx="6" cy="18" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18" cy="6" r="1.2" fill="currentColor" stroke="none" />
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
    case "offset":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <rect x="6" y="6" width="12" height="12" />
          <rect x="3" y="3" width="18" height="18" strokeDasharray="2 2" />
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
          <path d="M12 4v16" />
          <rect x="5" y="7" width="3.6" height="10" rx="1" />
          <rect x="15.4" y="7" width="3.6" height="10" rx="1" strokeDasharray="2 2" />
          <path d="M9.2 9.2C10.6 7.8 13.4 7.8 14.8 9.2" />
          <path d="M14.8 9.2L13.6 9" />
          <path d="M14.8 9.2L14.6 8" />
          <path d="M14.8 14.8C13.4 16.2 10.6 16.2 9.2 14.8" />
          <path d="M9.2 14.8L10.4 15" />
          <path d="M9.2 14.8L9.4 16" />
        </Svg>
      );
    case "unfold":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <path d="M12 4v16" />
          <rect x="5" y="7" width="4" height="10" rx="1" />
          <rect x="15" y="7" width="4" height="10" rx="1" />
          <path d="M9.5 12H14.5" />
          <path d="M13 10.5L14.5 12L13 13.5" />
        </Svg>
      );
    case "node":
      return (
        <Svg className={className} strokeWidth={strokeWidth}>
          <circle cx="7" cy="17" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="17" cy="17" r="1.4" fill="currentColor" stroke="none" />
          <path d="M8.2 16.2L11 9" />
          <path d="M12.8 9L15.8 16.2" />
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
    tool === "curve" ||
    tool === "measure" ||
    tool === "offset" ||
    tool === "dart" ||
    tool === "mirror" ||
    tool === "unfold"
  );
}
