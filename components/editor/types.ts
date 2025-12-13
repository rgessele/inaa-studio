export type DrawingTool = "rectangle" | "circle" | "line";
export type Tool = DrawingTool | "select" | "pan";

export interface Shape {
  id: string;
  tool: DrawingTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
  stroke: string;
  strokeWidth: number;
  fill?: string;
  rotation?: number;
  opacity?: number;
  dash?: number[];
}
