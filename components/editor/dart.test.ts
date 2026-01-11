/**
 * Dart Tool Test Utilities
 *
 * This file contains test utilities and examples for the dart tool.
 * Use these to verify dart geometry calculations are correct.
 */

import {
  insertDartIntoLine,
  insertDartIntoRectangle,
  insertDartIntoPolyline,
} from "./dart";
import { PX_PER_CM } from "./constants";

/**
 * Test 1: Insert dart into a simple horizontal line
 * Expected: 10 points (5 vertices: start, left, apex, right, end)
 */
export function testDartInLine() {
  const depthPx = 3 * PX_PER_CM; // 3cm
  const openingPx = 2 * PX_PER_CM; // 2cm
  const positionRatio = 0.5; // Middle

  // Horizontal line from (0,0) to (100, 0)
  const linePoints = [0, 0, 100, 0];

  const result = insertDartIntoLine(
    { points: linePoints, tool: "line" } as any,
    positionRatio,
    depthPx,
    openingPx
  );

  console.log("Test: Dart in Line");
  console.log("Original points:", linePoints);
  console.log("Result points:", result);
  console.log("Number of vertices:", result.length / 2);
  console.log("Expected: 5 vertices (start, left base, apex, right base, end)");

  // Verify structure
  const isValid = result.length === 10; // 5 vertices * 2 coordinates
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, points: result };
}

/**
 * Test 2: Insert dart into rectangle top edge
 * Expected: Rectangle points with dart in top edge
 */
export function testDartInRectangle() {
  const width = 100;
  const height = 80;
  const depthPx = 3 * PX_PER_CM;
  const openingPx = 2 * PX_PER_CM;
  const positionRatio = 0.5;
  const edgeIndex = 0; // Top edge

  const result = insertDartIntoRectangle(
    { width, height, tool: "rectangle" } as any,
    edgeIndex,
    positionRatio,
    depthPx,
    openingPx
  );

  console.log("\nTest: Dart in Rectangle");
  console.log("Original: 4 corners");
  console.log("Result points:", result);
  console.log("Number of vertices:", result.length / 2);
  console.log("Expected: 7 vertices (4 corners + 3 dart points)");

  const isValid = result.length === 14; // 7 vertices * 2 coordinates
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, points: result };
}

/**
 * Test 3: Verify dart direction is inward (perpendicular to edge)
 */
export function testDartDirection() {
  const depthPx = 3 * PX_PER_CM;
  const openingPx = 1 * PX_PER_CM;

  // Horizontal line
  const horizontalLine = [0, 0, 100, 0];
  const hResult = insertDartIntoLine(
    { points: horizontalLine, tool: "line" } as any,
    0.5,
    depthPx,
    openingPx
  );

  // Apex should be at y = -depthPx (pointing down/inward for top edge)
  const apexY = hResult[5]; // 3rd vertex (index 2) y-coordinate
  const expectedY = -depthPx;
  const tolerance = 0.1;

  console.log("\nTest: Dart Direction");
  console.log("Horizontal line apex Y:", apexY);
  console.log("Expected Y:", expectedY);
  const isValid = Math.abs(apexY - expectedY) < tolerance;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, apexY };
}

/**
 * Test 4: Verify opening width is correct
 */
export function testDartOpening() {
  const depthPx = 3 * PX_PER_CM;
  const openingPx = 2 * PX_PER_CM;

  const linePoints = [0, 0, 100, 0];
  const result = insertDartIntoLine(
    { points: linePoints, tool: "line" } as any,
    0.5,
    depthPx,
    openingPx
  );

  // Get left and right base points
  const leftX = result[2]; // 2nd vertex x
  const rightX = result[6]; // 4th vertex x
  const actualOpening = rightX - leftX;

  console.log("\nTest: Dart Opening Width");
  console.log("Left base X:", leftX);
  console.log("Right base X:", rightX);
  console.log("Actual opening:", actualOpening);
  console.log("Expected opening:", openingPx);

  const tolerance = 0.1;
  const isValid = Math.abs(actualOpening - openingPx) < tolerance;
  console.log("Test passed:", isValid ? "✓" : "✗");

  return { success: isValid, actualOpening };
}

/**
 * Run all tests
 */
export function runAllDartTests() {
  console.log("═══════════════════════════════════════");
  console.log("  DART TOOL GEOMETRY TESTS");
  console.log("═══════════════════════════════════════\n");

  const tests = [
    testDartInLine(),
    testDartInRectangle(),
    testDartDirection(),
    testDartOpening(),
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
 * Visual representation of dart geometry
 */
export function visualizeDart() {
  console.log("\n");
  console.log("DART GEOMETRY VISUALIZATION");
  console.log("───────────────────────────────────────");
  console.log("");
  console.log("Original Line:");
  console.log("P1 ────────────────────────────── P2");
  console.log("");
  console.log("After Dart Application:");
  console.log("P1 ──────── L ╱╲ R ──────────── P2");
  console.log("             ╱  ╲");
  console.log("            ╱    ╲");
  console.log("           ╱      ╲");
  console.log("          A (Apex) ");
  console.log("          │        ");
  console.log("          │ Depth  ");
  console.log("          │        ");
  console.log("");
  console.log("Where:");
  console.log("  L = Left base point");
  console.log("  R = Right base point");
  console.log("  A = Apex (dart point)");
  console.log("  Opening = distance from L to R");
  console.log("  Depth = perpendicular distance from edge to A");
  console.log("");
  console.log(
    "Points Array: [P1.x, P1.y, L.x, L.y, A.x, A.y, R.x, R.y, P2.x, P2.y]"
  );
  console.log("───────────────────────────────────────\n");
}

// Export for console testing
if (typeof window !== "undefined") {
  (window as any).dartTests = {
    runAll: runAllDartTests,
    visualize: visualizeDart,
    testLine: testDartInLine,
    testRectangle: testDartInRectangle,
    testDirection: testDartDirection,
    testOpening: testDartOpening,
  };

  console.log("Dart tests available in console:");
  console.log("  window.dartTests.runAll()     - Run all tests");
  console.log("  window.dartTests.visualize()  - Show visual guide");
}
