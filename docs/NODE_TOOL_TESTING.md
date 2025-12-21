# Node Tool Testing Guide

## Prerequisites

1. Start the development server: `npm run dev`
2. Navigate to the editor page
3. Ensure you're authenticated (or bypass auth for testing)

## Test Cases

### Test 1: Rectangle to Trapezoid Transformation ⭐ (Acceptance Criteria)

**Objective:** Verify that a rectangle can be deformed into a trapezoid by dragging a single vertex.

**Steps:**

1. Select the Rectangle tool from the toolbar
2. Draw a rectangle on the canvas (click and drag)
3. Click the "Editar Nós (N)" button in the toolbar (node tool)
4. Click on the rectangle to select it
5. Observe 4 node anchors appear at each corner (small circles with white borders)
6. Drag one of the top corner nodes horizontally (left or right)
7. Observe the rectangle deforms into a trapezoid shape

**Expected Results:**

- ✅ 4 node anchors visible at rectangle corners when selected with node tool
- ✅ Dragging a node updates only that vertex position
- ✅ Other 3 vertices remain in their original positions
- ✅ Shape maintains closed path (all 4 sides still connected)
- ✅ Shape can be deformed into trapezoid, parallelogram, or arbitrary quadrilateral

### Test 2: Circle Vertex Editing

**Objective:** Verify circle shapes can be deformed using node editing.

**Steps:**

1. Select the Circle tool
2. Draw a circle on the canvas
3. Switch to node tool
4. Select the circle
5. Observe multiple node anchors (32 points around the circle)
6. Drag individual nodes to deform the circle

**Expected Results:**

- ✅ 32 node anchors visible around the circle perimeter
- ✅ Dragging nodes deforms the circle into irregular shapes
- ✅ Can create ellipse-like or blob-like shapes

### Test 3: Visual Highlighting of Adjacent Segments

**Objective:** Verify that selecting a node highlights its adjacent line segments.

**Steps:**

1. Draw a rectangle
2. Switch to node tool and select the rectangle
3. Click on one of the corner node anchors
4. Observe visual highlighting

**Expected Results:**

- ✅ Selected node changes color to red (#ff6b6b)
- ✅ Two line segments connected to the selected node are highlighted in red
- ✅ Highlighted segments have increased stroke width and opacity
- ✅ Other segments remain in default color

### Test 4: Tool Switching Behavior

**Objective:** Verify proper state management when switching between tools.

**Steps:**

1. Draw a rectangle using rectangle tool
2. Switch to node tool and select the rectangle
3. Select a specific node anchor (should turn red)
4. Switch to select tool
5. Switch back to node tool

**Expected Results:**

- ✅ Node anchors disappear when switching to select tool
- ✅ Transformer handles (resize boxes) appear with select tool
- ✅ Node anchors reappear when switching back to node tool
- ✅ Previously selected node is no longer selected (anchors back to default color)

### Test 5: Background Click Deselection

**Objective:** Verify clicking background clears selection.

**Steps:**

1. Draw and select a shape with node tool
2. Select a node anchor
3. Click on empty canvas area

**Expected Results:**

- ✅ Shape deselects (node anchors disappear)
- ✅ Selected node index cleared

### Test 6: Dragging and Undo/Redo

**Objective:** Verify node editing integrates with undo/redo system.

**Steps:**

1. Draw a rectangle
2. Switch to node tool, select rectangle
3. Drag one corner to create a trapezoid
4. Press Ctrl+Z (undo)
5. Press Ctrl+Y (redo)

**Expected Results:**

- ✅ Undo restores rectangle to original shape
- ✅ Redo reapplies the trapezoid transformation
- ✅ Shape maintains node editability throughout

### Test 7: Transformation Compatibility

**Objective:** Verify node editing works after using transformation handles.

**Steps:**

1. Draw a rectangle
2. Switch to select tool
3. Use transformation handles to resize the rectangle
4. Switch to node tool
5. Drag a corner node

**Expected Results:**

- ✅ 4 node anchors still appear at corners (points regenerated correctly)
- ✅ Node positions match the transformed rectangle
- ✅ Nodes can be dragged to further deform the shape

### Test 8: Line Shape Node Editing

**Objective:** Verify line shapes support node editing.

**Steps:**

1. Draw a line using line tool
2. Switch to node tool, select line
3. Drag either endpoint

**Expected Results:**

- ✅ 2 node anchors visible (one at each end)
- ✅ Dragging endpoints changes line angle and length
- ✅ Line remains connected between the two nodes

### Test 9: Node Tool with Curves

**Objective:** Verify curve shapes show node anchors for their control points.

**Steps:**

1. Draw a curve using curve tool
2. Switch to node tool, select curve
3. Observe node anchors

**Expected Results:**

- ✅ Node anchors appear at curve endpoints
- ✅ Dragging endpoint nodes affects curve shape
- ✅ Control point anchor (from select tool) is NOT shown in node tool mode

### Test 10: Performance with Multiple Shapes

**Objective:** Verify node tool performs well with multiple shapes.

**Steps:**

1. Draw 5-10 different shapes (mix of rectangles and circles)
2. Switch to node tool
3. Select and edit different shapes sequentially

**Expected Results:**

- ✅ Switching between shapes is responsive
- ✅ Only selected shape shows node anchors
- ✅ No performance degradation or lag during node dragging

## Visual Verification Checklist

### Node Anchor Appearance

- [ ] Node anchors are small circles (5px radius)
- [ ] Default color: primary color (#673b45)
- [ ] Selected node color: red (#ff6b6b)
- [ ] White border (2px stroke width)
- [ ] Clearly visible against dark canvas background

### Highlighting Behavior

- [ ] Adjacent segments highlighted when node selected
- [ ] Highlight color matches selected node (red)
- [ ] Highlight has appropriate opacity (60%)
- [ ] Highlight stroke width increases by 2px

### Tool Button

- [ ] Node tool button visible in toolbar
- [ ] Custom SVG icon (square with 4 corner nodes)
- [ ] Active state styling (primary color background)
- [ ] Tooltip shows "Editar Nós (N)"

## Known Limitations

1. Keyboard shortcut (N) not yet implemented
2. Cannot add/remove nodes from paths (future enhancement)
3. Multi-node selection not supported
4. Grid snapping for nodes not implemented

## Debugging Tips

- Use browser DevTools console to check for errors
- Inspect Konva layer to see node anchor elements
- Check shape.points array in React DevTools to verify coordinates
- Enable React DevTools to monitor state changes
