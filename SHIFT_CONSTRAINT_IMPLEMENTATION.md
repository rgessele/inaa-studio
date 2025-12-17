# SHIFT Constraint Implementation - Issue #13

## Overview

This document describes the implementation of the SHIFT key constraint for creating perfect squares and circles during shape drawing in Inaá Studio.

## Feature Requirements (from Issue #13)

### 1. Deformable Rectangles ✅
- **Requirement**: Don't use Konva.Rect. Generate Konva.Line with 'closed: true' and 4 calculated points.
- **Status**: Already implemented (see NODE_TOOL_IMPLEMENTATION.md)
- **Implementation**: Rectangles are created with 4-point closed paths using `createRectanglePoints(width, height)`

### 2. Deformable Ellipses (Circles) ✅
- **Requirement**: Don't use Konva.Circle. Generate Konva.Path with Bézier curves or high-resolution polygon.
- **Status**: Already implemented (see NODE_TOOL_IMPLEMENTATION.md)
- **Implementation**: Circles are created with 32-point closed paths using `createCirclePoints(radius, segments = 32)`

### 3. SHIFT Constraint ✅ (NEW)
- **Requirement**: Holding SHIFT during creation should force 1:1 proportion (Square/Perfect Circle).
- **Status**: Newly implemented
- **Implementation**: See below

## Implementation Details

### State Management

Added `isShiftPressed` state to track SHIFT key status:

```typescript
const [isShiftPressed, setIsShiftPressed] = useState(false);
```

### Keyboard Event Handlers

Modified keyboard event handlers to track SHIFT key state:

```typescript
const handleKeyDown = (event: KeyboardEvent) => {
  if (isTypingElement(event.target)) return;
  if (event.code === "Space") {
    event.preventDefault();
    setIsSpacePressed(true);
  }
  if (event.key === "Shift") {
    setIsShiftPressed(true);
  }
};

const handleKeyUp = (event: KeyboardEvent) => {
  if (isTypingElement(event.target)) return;
  if (event.code === "Space") {
    event.preventDefault();
    setIsSpacePressed(false);
    setIsPanDrag(false);
  }
  if (event.key === "Shift") {
    setIsShiftPressed(false);
  }
};
```

### Rectangle Constraint

When drawing a rectangle with SHIFT pressed, the smaller of width/height is used for both dimensions:

```typescript
if (lastShape.tool === "rectangle") {
  let rect = normalizeRectangle({ x: lastShape.x, y: lastShape.y }, pos);
  
  // If SHIFT is pressed, force 1:1 aspect ratio (square)
  if (isShiftPressed) {
    const size = Math.min(rect.width, rect.height);
    rect.width = size;
    rect.height = size;
  }
  
  updatedShapes[shapeIndex] = {
    ...lastShape,
    width: rect.width,
    height: rect.height,
    x: rect.x,
    y: rect.y,
    points: createRectanglePoints(rect.width, rect.height),
  };
}
```

### Circle Behavior

Circles already use diagonal distance for radius calculation, so they are always perfect circles regardless of SHIFT key:

```typescript
} else if (lastShape.tool === "circle") {
  const dx = pos.x - lastShape.x;
  const dy = pos.y - lastShape.y;
  
  // Circles always use diagonal distance for radius (naturally perfect circles)
  // SHIFT key has no effect on circle behavior
  const radius = Math.sqrt(dx * dx + dy * dy);
  
  updatedShapes[shapeIndex] = {
    ...lastShape,
    radius,
    points: createCirclePoints(radius),
  };
}
```

**Note**: The SHIFT constraint for circles is documented but has no behavioral difference since circles are already constrained to perfect circular shape by their nature (using radial distance).

## User Experience

### Rectangle Tool
- **Without SHIFT**: Draw any rectangle (any width/height ratio)
- **With SHIFT**: Draw perfect square (width = height = min(width, height))

### Circle Tool
- **Without SHIFT**: Draw perfect circle
- **With SHIFT**: Draw perfect circle (no visual difference)

## Acceptance Criteria ✅

All acceptance criteria from Issue #13 are met:

1. ✅ **Create a circle**: Circles are created with 32-point polygon (deformable)
2. ✅ **Switch to node tool**: Node tool is available and functional
3. ✅ **Deform the circle**: Can drag any of the 32 vertices to "squash" the circle

### Example Workflow

1. Select Circle tool
2. Click and drag to create a circle
3. Switch to Node tool (N or click node tool button)
4. Select the circle
5. Drag any of the 32 vertex anchors
6. Result: Circle deforms into custom shape

## Files Modified

- `components/editor/Canvas.tsx`: Added SHIFT key tracking and constraint logic

## Testing

A standalone test HTML file was created (`/tmp/test-shift-constraint.html`) to validate the SHIFT constraint logic independently. The test confirms:

- SHIFT key state is properly tracked
- Rectangle dimensions are constrained to 1:1 when SHIFT is pressed
- Rectangle dimensions are free when SHIFT is not pressed

## Future Enhancements

Potential improvements:

1. Visual indicator when SHIFT is active (e.g., overlay text or icon)
2. Support SHIFT for other shape types (if added in future)
3. Alternative constraint modes (e.g., Ctrl for other ratios)

## Related Documentation

- `NODE_TOOL_IMPLEMENTATION.md` - Details on deformable shape architecture
- `NODE_TOOL_SUMMARY.md` - Summary of node tool functionality
- `NODE_TOOL_TESTING.md` - Test cases for node editing
