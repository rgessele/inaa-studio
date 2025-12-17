/**
 * Mirror Tool Test Utilities
 *
 * This file contains test utilities for the mirror tool.
 */

import { mirrorShape, mirrorPoint, mirrorPoints, getShapeCenter } from "./mirror";
import type { Shape } from "./types";

/**
 * Test 1: Mirror a point across vertical axis
 */
export function testMirrorPointVertical() {
  const point = { x: 100, y: 50 };
  const axis = "vertical" as const;
  const axisPosition = 200;

  const result = mirrorPoint(point, axis, axisPosition);

  console.log("Test: Mirror Point Vertical");
  console.log("Original point:", point);
  console.log("Axis position:", axisPosition);
  console.log("Result:", result);
  console.log("Expected: { x: 300, y: 50 }");

  const isValid = result.x === 300 && result.y === 50;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Test 2: Mirror a point across horizontal axis
 */
export function testMirrorPointHorizontal() {
  const point = { x: 100, y: 50 };
  const axis = "horizontal" as const;
  const axisPosition = 100;

  const result = mirrorPoint(point, axis, axisPosition);

  console.log("\nTest: Mirror Point Horizontal");
  console.log("Original point:", point);
  console.log("Axis position:", axisPosition);
  console.log("Result:", result);
  console.log("Expected: { x: 100, y: 150 }");

  const isValid = result.x === 100 && result.y === 150;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Test 3: Mirror a line shape vertically
 */
export function testMirrorLineVertical() {
  const shape: Shape = {
    id: "test-line",
    tool: "line",
    x: 0,
    y: 0,
    points: [0, 0, 100, 0], // Horizontal line
    stroke: "#000",
    strokeWidth: 2,
  };

  const axis = "vertical" as const;
  const axisPosition = 50; // Middle of the line

  const result = mirrorShape(shape, axis, axisPosition);

  console.log("\nTest: Mirror Line Vertical");
  console.log("Original points:", shape.points);
  console.log("Result points:", result.points);
  console.log("Expected: mirrored across x=50");

  const isValid = result.points && result.points.length === 4;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Test 4: Mirror a rectangle shape
 */
export function testMirrorRectangle() {
  const shape: Shape = {
    id: "test-rect",
    tool: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    stroke: "#000",
    strokeWidth: 2,
  };

  const axis = "vertical" as const;
  const center = getShapeCenter(shape);
  const axisPosition = center.x; // Use center

  const result = mirrorShape(shape, axis, axisPosition);

  console.log("\nTest: Mirror Rectangle");
  console.log("Original position:", { x: shape.x, y: shape.y });
  console.log("Result position:", { x: result.x, y: result.y });
  console.log("Center axis:", center.x);

  const isValid = result.width === shape.width && result.height === shape.height;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Test 5: Mirror a circle shape
 */
export function testMirrorCircle() {
  const shape: Shape = {
    id: "test-circle",
    tool: "circle",
    x: 100,
    y: 100,
    radius: 50,
    stroke: "#000",
    strokeWidth: 2,
  };

  const axis = "horizontal" as const;
  const axisPosition = 150;

  const result = mirrorShape(shape, axis, axisPosition);

  console.log("\nTest: Mirror Circle");
  console.log("Original position:", { x: shape.x, y: shape.y });
  console.log("Result position:", { x: result.x, y: result.y });
  console.log("Expected y:", 200); // 150 + (150 - 100)

  const isValid = result.y === 200 && result.x === 100 && result.radius === 50;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Test 6: Mirror points array
 */
export function testMirrorPoints() {
  const points = [0, 0, 10, 20, 30, 40];
  const axis = "vertical" as const;
  const axisPosition = 15;

  const result = mirrorPoints(points, axis, axisPosition);

  console.log("\nTest: Mirror Points Array");
  console.log("Original points:", points);
  console.log("Result points:", result);

  const isValid = result.length === points.length;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Run all tests
 */
export function runAllMirrorTests() {
  console.log("═══════════════════════════════════════");
  console.log("  MIRROR TOOL TESTS");
  console.log("═══════════════════════════════════════\n");

  const tests = [
    testMirrorPointVertical(),
    testMirrorPointHorizontal(),
    testMirrorLineVertical(),
    testMirrorRectangle(),
    testMirrorCircle(),
    testMirrorPoints(),
  ];

  const passedCount = tests.filter((t) => t.success).length;
  const totalCount = tests.length;

  console.log("\n═══════════════════════════════════════");
  console.log(`  RESULTS: ${passedCount}/${totalCount} tests passed`);
  console.log("═══════════════════════════════════════\n");

  return {
    passed: passedCount,
    total: totalCount,
    allPassed: passedCount === totalCount,
  };
}

// Export for console testing
if (typeof window !== "undefined") {
  (window as any).mirrorTests = {
    runAll: runAllMirrorTests,
    testPointVertical: testMirrorPointVertical,
    testPointHorizontal: testMirrorPointHorizontal,
    testLine: testMirrorLineVertical,
    testRectangle: testMirrorRectangle,
    testCircle: testMirrorCircle,
    testPoints: testMirrorPoints,
  };

  console.log("Mirror tests available in console:");
  console.log("  window.mirrorTests.runAll() - Run all tests");
}
