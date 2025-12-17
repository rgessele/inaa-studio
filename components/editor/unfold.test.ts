/**
 * Unfold Tool Test Utilities
 *
 * This file contains test utilities for the unfold tool.
 */

import { unfoldShape, canUnfoldShape, getSuggestedUnfoldAxis } from "./unfold";
import type { Shape } from "./types";

/**
 * Test 1: Unfold a simple vertical half-shape
 */
export function testUnfoldVertical() {
  // Half of a rectangular outline (left side)
  const shape: Shape = {
    id: "test-half",
    tool: "line",
    x: 0,
    y: 0,
    points: [
      0,
      0, // Top-left
      0,
      100, // Bottom-left
      50,
      100, // Bottom-right (at center)
      50,
      0, // Top-right (at center)
    ],
    stroke: "#000",
    strokeWidth: 2,
  };

  const axis = "vertical" as const;
  const axisPosition = 50; // Mirror at x=50

  const result = unfoldShape(shape, axis, axisPosition);

  console.log("Test: Unfold Vertical Half");
  console.log("Original points:", shape.points);
  console.log("Result points:", result?.points);
  console.log(
    "Expected: 8 vertices (4 original + 4 mirrored) = 16 coordinates"
  );

  const isValid = result !== null && result.points!.length === 16;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Test 2: Unfold a simple horizontal half-shape
 */
export function testUnfoldHorizontal() {
  // Half of a shape (top half)
  const shape: Shape = {
    id: "test-half-h",
    tool: "line",
    x: 0,
    y: 0,
    points: [
      0,
      0, // Left-top
      100,
      0, // Right-top
      100,
      50, // Right-center
      0,
      50, // Left-center
    ],
    stroke: "#000",
    strokeWidth: 2,
  };

  const axis = "horizontal" as const;
  const axisPosition = 50; // Mirror at y=50

  const result = unfoldShape(shape, axis, axisPosition);

  console.log("\nTest: Unfold Horizontal Half");
  console.log("Original points:", shape.points);
  console.log("Result points:", result?.points);
  console.log("Expected: 8 vertices = 16 coordinates");

  const isValid = result !== null && result.points!.length === 16;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Test 3: Can unfold shape validation
 */
export function testCanUnfold() {
  const lineShape: Shape = {
    id: "line",
    tool: "line",
    x: 0,
    y: 0,
    points: [0, 0, 100, 100],
    stroke: "#000",
    strokeWidth: 2,
  };

  const rectShape: Shape = {
    id: "rect",
    tool: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    stroke: "#000",
    strokeWidth: 2,
  };

  const circleShape: Shape = {
    id: "circle",
    tool: "circle",
    x: 50,
    y: 50,
    radius: 50,
    stroke: "#000",
    strokeWidth: 2,
  };

  console.log("\nTest: Can Unfold Validation");
  console.log("Line shape:", canUnfoldShape(lineShape));
  console.log("Rectangle shape:", canUnfoldShape(rectShape));
  console.log("Circle shape:", canUnfoldShape(circleShape));

  const isValid =
    canUnfoldShape(lineShape) === true &&
    canUnfoldShape(rectShape) === false &&
    canUnfoldShape(circleShape) === false;

  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid };
}

/**
 * Test 4: Suggested axis calculation
 */
export function testSuggestedAxis() {
  const shape: Shape = {
    id: "test",
    tool: "line",
    x: 10,
    y: 20,
    points: [0, 0, 100, 0, 100, 100],
    stroke: "#000",
    strokeWidth: 2,
  };

  const verticalAxis = getSuggestedUnfoldAxis(shape, "vertical");
  const horizontalAxis = getSuggestedUnfoldAxis(shape, "horizontal");

  console.log("\nTest: Suggested Axis");
  console.log("Vertical axis:", verticalAxis);
  console.log("Horizontal axis:", horizontalAxis);
  console.log("Expected vertical: 10 (leftmost)");
  console.log("Expected horizontal: 20 (topmost)");

  const isValid = verticalAxis === 10 && horizontalAxis === 20;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, verticalAxis, horizontalAxis };
}

/**
 * Test 5: Unfold creates closed path
 */
export function testUnfoldClosedPath() {
  // Simple L-shape (half of a rectangle)
  const shape: Shape = {
    id: "l-shape",
    tool: "line",
    x: 0,
    y: 0,
    points: [
      0,
      0, // Start
      0,
      100, // Down
      50,
      100, // Right to center
    ],
    stroke: "#000",
    strokeWidth: 2,
  };

  const axis = "vertical" as const;
  const axisPosition = 50;

  const result = unfoldShape(shape, axis, axisPosition);

  console.log("\nTest: Unfold Creates Closed Path");
  console.log("Original vertices:", shape.points!.length / 2);
  console.log("Result vertices:", result?.points ? result.points.length / 2 : 0);
  console.log("Expected: doubled vertices");

  const isValid =
    result !== null && result.points!.length === shape.points!.length * 2;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, result };
}

/**
 * Run all tests
 */
export function runAllUnfoldTests() {
  console.log("═══════════════════════════════════════");
  console.log("  UNFOLD TOOL TESTS");
  console.log("═══════════════════════════════════════\n");

  const tests = [
    testUnfoldVertical(),
    testUnfoldHorizontal(),
    testCanUnfold(),
    testSuggestedAxis(),
    testUnfoldClosedPath(),
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

/**
 * Visual representation of unfold operation
 */
export function visualizeUnfold() {
  console.log("\n");
  console.log("UNFOLD GEOMETRY VISUALIZATION");
  console.log("───────────────────────────────────────");
  console.log("");
  console.log("Original Half-Shape (left side):");
  console.log("┌──────┐");
  console.log("│      │ (axis)");
  console.log("│      │");
  console.log("└──────┘");
  console.log("");
  console.log("After Unfold:");
  console.log("┌──────┬──────┐");
  console.log("│      │      │");
  console.log("│      │      │");
  console.log("└──────┴──────┘");
  console.log("");
  console.log("Process:");
  console.log("1. Mirror original points across axis");
  console.log("2. Reverse mirrored points");
  console.log("3. Concatenate: original + reversed mirrored");
  console.log("4. Result: closed polyline");
  console.log("───────────────────────────────────────\n");
}

// Export for console testing
if (typeof window !== "undefined") {
  (window as any).unfoldTests = {
    runAll: runAllUnfoldTests,
    visualize: visualizeUnfold,
    testVertical: testUnfoldVertical,
    testHorizontal: testUnfoldHorizontal,
    testCanUnfold: testCanUnfold,
    testSuggestedAxis: testSuggestedAxis,
    testClosedPath: testUnfoldClosedPath,
  };

  console.log("Unfold tests available in console:");
  console.log("  window.unfoldTests.runAll()    - Run all tests");
  console.log("  window.unfoldTests.visualize() - Show visual guide");
}
