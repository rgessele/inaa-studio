# Fix Summary - Synchronization & Performance

## Issues Addressed
1.  **Synchronization**: Measures, nodes, and texts were not moving with the figure during drag.
2.  **Performance**: The node optimization seemed to revert, causing lag.
3.  **Selection Tool**: Was not working correctly (likely due to missing drag handlers).
4.  **Minimap**: Was not showing the focus area.

## Changes Implemented

### 1. Merged Node Overlay into Figure Renderer
- **Moved `MemoizedNodeOverlay` inside `FigureRenderer`**:
  - Instead of rendering nodes as a separate layer in `Canvas.tsx`, they are now rendered inside the `FigureRenderer` component (which is a Konva Group).
  - **Benefit**: Nodes automatically move with the figure when it is dragged by Konva, without requiring any React state updates or manual synchronization.
  - **Benefit**: Reduced component overhead and complexity in `Canvas.tsx`.

### 2. Fixed Drag Handlers & Multi-Selection
- **Updated `FigureRenderer.tsx`**:
  - Added missing `onDragStart`, `onDragMove`, `onDragEnd` props to the interface and passed them to the Konva `Group`.
  - This ensures that the drag logic in `Canvas.tsx` is actually executed.
- **Optimized `onDragMove` in `Canvas.tsx`**:
  - Removed the `setDragPreviewPositions` state update during drag. This prevents the entire Canvas from re-rendering on every mouse move, restoring high performance.
  - Implemented **Direct Ref Manipulation** for multi-selection drag. When dragging one figure, other selected figures are moved by directly updating their Konva node positions via `figureNodeRefs`. This bypasses React and is extremely fast.

### 3. Fixed Minimap
- **Updated `Minimap.tsx`**:
  - Added a polling mechanism to retry fetching the Stage size if it's not immediately available on mount. This ensures the viewport rectangle is calculated correctly even if the Stage initializes slightly later than the Minimap.

## Verification
- **Build**: Passed (`npm run build`).
- **Logic**:
  - Single drag: Handled natively by Konva (draggable). Nodes move because they are children.
  - Multi drag: Handled by `onDragMove` updating refs. No React render.
  - Drop: `onDragEnd` updates React state (`setFigures`), syncing the model with the view.
