# Node Tool Implementation - Summary for Future Development

## Critical Architectural Changes

### Shape Data Structure (BREAKING CHANGE)
**Before:** Shapes used Konva primitives (Rect, Circle) with properties like width, height, radius
**After:** ALL shapes use Konva.Line with `points` array and `closed` property

```typescript
// Rectangle (4 vertices)
points: [0, 0, width, 0, width, height, 0, height]
closed: true

// Circle (32 vertices approximation)
points: [cos(θ₀)*r, sin(θ₀)*r, cos(θ₁)*r, sin(θ₁)*r, ...]
closed: true

// Line (2 vertices)
points: [x1, y1, x2, y2]
closed: false
```

### Helper Functions
```typescript
createRectanglePoints(width: number, height: number): number[]
createCirclePoints(radius: number, segments: number = 32): number[]
```

Located in: `components/editor/Canvas.tsx` lines 32-43

### Backward Compatibility
Shape interface still maintains `width`, `height`, `radius` properties for:
- Transformation operations (resizing)
- Legacy shape support
- Export functionality

When transforming shapes, BOTH legacy properties AND points array are updated.

## Node Tool Functionality

### State Management
- `selectedNodeIndex: number | null` - Tracks which vertex is selected
- Cleared when switching tools or clicking background
- Separate from `selectedShapeId` which tracks shape selection

### Rendering Logic
When node tool is active AND shape is selected:
1. Iterate through `shape.points` array (every 2 values = one vertex)
2. Render draggable anchor circle at each vertex
3. If node selected, highlight adjacent segments (closed shapes only)

### Visual Feedback
- Node anchors: 5px radius, primary color (#673b45), white stroke
- Selected node: Red (#ff6b6b)
- Adjacent segments: Red highlight, +2px stroke width, 60% opacity

### Performance Optimization
During drag:
1. Visual updates happen directly on Konva nodes (no React state)
2. Only drag end commits to React state and history
3. Prevents excessive re-renders

## Future Developers: Important Notes

### When Adding New Shape Types
1. Ensure shape has `points` array
2. Add to rendering switch statement in Canvas.tsx
3. Determine if shape should be `closed: true` (filled) or `closed: false`
4. Node anchors will automatically work if points array exists

### When Modifying Transformations
1. Update BOTH legacy properties (width/height/radius) AND points array
2. Use helper functions to regenerate points: `createRectanglePoints()`, `createCirclePoints()`
3. See `handleShapeTransformEnd()` lines 512-524 for reference

### When Adding Export/Import Features
- Points array is the source of truth for shape geometry
- Legacy properties are maintained for convenience
- Export can use points array directly for accurate geometry

### Keyboard Shortcuts (TODO)
- 'N' key should activate node tool (not yet implemented)
- See `components/editor/useKeyboardShortcuts.ts` for pattern

### Testing Checklist
Always test:
1. Draw shape → transform with handles → switch to node tool → verify anchors at correct positions
2. Edit nodes → undo → redo → verify shape state
3. Edit nodes → save project → reload → verify nodes persist correctly

## Known Limitations
1. Cannot add/remove nodes from paths (future enhancement)
2. No multi-node selection (future enhancement)
3. No grid snapping for nodes (future enhancement)
4. Curve shapes have special handling (Bézier control points)

## Files to Review for Context
- `components/editor/Canvas.tsx` - Main implementation
- `components/editor/types.ts` - Type definitions
- `components/editor/EditorToolbar.tsx` - Tool button
- `NODE_TOOL_IMPLEMENTATION.md` - Technical specification
- `NODE_TOOL_TESTING.md` - Test cases

## Common Pitfalls to Avoid
❌ Don't assume shapes are Konva.Rect or Konva.Circle
❌ Don't ignore the points array when transforming shapes
❌ Don't forget to regenerate points after changing width/height/radius
❌ Don't use non-null assertions without checking the condition
✅ Always check `if (shape.points)` before accessing
✅ Always update both legacy properties and points array
✅ Use helper functions for consistency
