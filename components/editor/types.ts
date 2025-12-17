export type DrawingTool = "rectangle" | "circle" | "line" | "curve";
export type Tool = DrawingTool | "select" | "pan" | "node" | "measure";

export interface Shape {
  id: string;
  tool: DrawingTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
  controlPoint?: { x: number; y: number }; // For Bézier curves
  stroke: string;
  strokeWidth: number;
  fill?: string;
  rotation?: number;
  opacity?: number;
  dash?: number[];
}
