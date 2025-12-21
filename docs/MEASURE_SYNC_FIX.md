# Measure Synchronization Fix

## Problem
The user reported that edge measures (labels) were not moving in sync with the figure when dragging, especially during multi-selection. This was because the measures were rendered in a separate overlay (`measuresLabelsOverlay`) in `Canvas.tsx`, which relied on React state updates that are suppressed during drag operations for performance.

## Solution
We refactored the measure rendering logic to be part of the `FigureRenderer` component. This ensures that measures are children of the Konva `Group` representing the figure, so they automatically inherit all transformations (position, rotation) applied to the group during drag, without needing React state updates.

## Changes

### 1. Created `components/editor/MeasureOverlay.tsx`
- Extracted the measure rendering logic from `Canvas.tsx` into a new component.
- Implemented `MemoizedMeasureOverlay` with `React.memo`.
- Added a custom `arePropsEqual` function to optimize re-renders. It intelligently checks `selectedEdge` and `hoveredEdge` to ensure that a figure's measures only re-render if the selection/hover applies to *that specific figure*. This prevents unnecessary re-renders of all figures when hovering a single edge.

### 2. Updated `components/editor/FigureRenderer.tsx`
- Imported `MemoizedMeasureOverlay`.
- Added `showMeasures`, `isDark`, `selectedEdge`, and `hoveredEdge` to `FigureRendererProps`.
- Rendered `<MemoizedMeasureOverlay />` inside the `Group`.
- Updated `arePropsEqual` to include the new props.

### 3. Updated `components/editor/Canvas.tsx`
- Removed the massive `measuresLabelsOverlay` `useMemo` block.
- Replaced it with a simplified `draftMeasuresOverlay` that handles only draft figures (using `MemoizedMeasureOverlay`).
- Updated `MemoizedFigure` usage to pass the new props (`showMeasures`, `isDark`, `selectedEdge`, `hoveredEdge`).

## Benefits
- **Synchronization**: Measures now move perfectly with the figure during drag.
- **Performance**: The custom `arePropsEqual` in `MeasureOverlay` prevents unnecessary re-renders of measures for non-interacted figures.
- **Code Quality**: `Canvas.tsx` is significantly smaller and cleaner. Measure logic is encapsulated in its own component.
