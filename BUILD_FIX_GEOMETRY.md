# Build Error Fix: Missing Exports in figureGeometry.ts

## Problem
The build failed with "Export dist doesn't exist in target module" in `components/editor/MeasureOverlay.tsx`. This was because `MeasureOverlay.tsx` was importing several geometry functions (`dist`, `midAndTangent`, `norm`, `perp`, `lerp`, etc.) from `components/editor/figureGeometry.ts`, but these functions were not actually exported from that file. They were previously defined locally in `Canvas.tsx`.

## Solution
We moved the common geometry functions from `Canvas.tsx` to `figureGeometry.ts` and exported them. This makes them available for both `Canvas.tsx` and `MeasureOverlay.tsx` (and other components).

## Changes

### 1. Updated `components/editor/figureGeometry.ts`
- Added and exported the following functions:
  - `dist(a, b)`
  - `lerp(a, b, t)`
  - `norm(v)`
  - `perp(v)`
  - `midAndTangent(points)`
  - `clamp(value, min, max)`
  - `pointToSegmentDistance(p, a, b)`
  - `normalizeUprightAngleDeg(angleDeg)`
  - `polylineLength(points)`
  - `polylinePointAtDistance(points, distancePx)`

### 2. Updated `components/editor/Canvas.tsx`
- Removed the local definitions of the functions listed above.
- Updated the import statement to import these functions from `./figureGeometry`.

## Result
`MeasureOverlay.tsx` can now successfully import the required geometry functions, resolving the build error. `Canvas.tsx` continues to work by importing the shared functions.
