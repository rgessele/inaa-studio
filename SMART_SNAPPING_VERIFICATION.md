# Visual Verification Guide - Smart Snapping

## Purpose

This guide provides step-by-step instructions for visually verifying the smart snapping feature works correctly.

## Prerequisites

1. Log in to Inaá Studio
2. Access the editor interface
3. Ensure you're familiar with the node tool (N key or Node Tool button)

## Test Scenario 1: Closing a Shape (Garment Outline)

### Step 1: Draw Initial Shape
1. Select the **Line Tool** from the toolbar
2. Draw 4-5 connected line segments to create an open path (like the outline of a sleeve)
3. **Important**: Do NOT connect the last point to the first - leave it open

### Step 2: Activate Node Tool
1. Click the **Node Tool** button (icon with square and 4 corner nodes)
2. Or press the **N** key
3. Click on one of the line segments to select the shape
4. You should see small circles (anchors) at each vertex

### Step 3: Test Endpoint Snapping
1. Click and drag the **last endpoint** (the one that's not connected)
2. Slowly move it towards the **first endpoint**
3. **EXPECTED RESULT**:
   - When you get within ~10 pixels, a **yellow square** (8x8 px) appears
   - The node "jumps" to exactly align with the first point
   - The yellow square is centered on the first endpoint

### Step 4: Verify Closure
1. Release the mouse button while the yellow square is visible
2. **EXPECTED RESULT**:
   - The shape is now perfectly closed
   - The two endpoints are mathematically identical (no gap)
   - The yellow square disappears

## Test Scenario 2: Midpoint Snapping

### Step 1: Create Two Shapes
1. Draw a rectangle using the Rectangle Tool
2. Draw a line using the Line Tool (separate from the rectangle)

### Step 2: Test Midpoint Detection
1. Select the **Node Tool**
2. Select the line you just drew
3. Drag one endpoint towards the **middle** of one of the rectangle's edges
4. **EXPECTED RESULT**:
   - Yellow square appears at the midpoint of the rectangle's edge
   - The line endpoint snaps to this midpoint
   - The snap occurs when you're within ~10 pixels

## Test Scenario 3: Intersection Snapping

### Step 1: Create Crossing Lines
1. Draw a horizontal line
2. Draw a vertical line that crosses the first line

### Step 2: Create Third Line
1. Draw a third line away from the intersection

### Step 3: Test Intersection Snapping
1. Select **Node Tool**
2. Select the third line
3. Drag one of its endpoints towards the intersection of the first two lines
4. **EXPECTED RESULT**:
   - Yellow square appears at the exact intersection point
   - The endpoint snaps to the intersection
   - All three lines now meet at one perfect point

## Test Scenario 4: Self-Snap Prevention

### Step 1: Create a Shape
1. Draw a rectangle or any closed shape

### Step 2: Test Self-Snapping
1. Select **Node Tool**
2. Select the shape
3. Drag any vertex (node)
4. Move it around, including over other vertices of the **same** shape
5. **EXPECTED RESULT**:
   - Yellow square does NOT appear when hovering over other nodes of the same shape
   - This prevents the node from snapping to its adjacent nodes
   - Snapping only occurs with points from OTHER shapes

## Test Scenario 5: Multiple Snap Candidates

### Step 1: Create Dense Geometry
1. Draw 3-4 shapes close together (rectangles, circles, lines)
2. Ensure some endpoints are very close to each other

### Step 2: Test Nearest Selection
1. Select **Node Tool**
2. Select one shape and drag a node
3. Move it to an area where multiple snap points are nearby
4. **EXPECTED RESULT**:
   - Only ONE yellow square appears
   - It appears at the NEAREST snap point
   - As you move the node, the snap might switch to a different nearest point

## Visual Indicators to Verify

### Yellow Square Appearance
- **Color**: Amber/yellow (`#fbbf24` fill, `#f59e0b` stroke)
- **Size**: 8x8 pixels
- **Position**: Centered on the snap point (4px offset from center)
- **Opacity**: 80% (slightly transparent)
- **Timing**: Appears instantly when within threshold, disappears when released

### Snap Behavior
- **Activation Distance**: ~10 pixels from snap point
- **Deactivation**: Moves outside threshold or mouse released
- **Movement**: Node "jumps" to snap point (not gradual)
- **Precision**: Mathematically exact coordinates (no approximation)

## Common Issues and Troubleshooting

### Issue: Yellow Square Doesn't Appear

**Possible Causes**:
1. Not using the Node Tool (ensure it's selected)
2. No shape is selected (click on a shape first)
3. No nearby snap points (try moving closer to endpoints)
4. Dragging on background instead of a node anchor

**Solution**: 
- Verify Node Tool is active (check toolbar)
- Ensure you're dragging a node anchor (small circle)
- Try dragging towards a clearly visible endpoint

### Issue: Snap Seems Imprecise

**Verification**:
1. After snapping, zoom in significantly (use mouse wheel)
2. Check if the two points are perfectly aligned
3. The coordinates should be identical (no pixel gap)

**Expected**: Perfect alignment with no visible gap even at high zoom

### Issue: Can't Snap to Certain Points

**Check**:
1. Are you trying to snap to the same shape? (This is prevented)
2. Is the target actually a snap point type (endpoint, midpoint, intersection)?
3. Are you within the 10px threshold?

## Success Criteria Checklist

After testing, verify:

- [ ] Yellow square appears when near snap points
- [ ] Snapping works for endpoints
- [ ] Snapping works for midpoints
- [ ] Snapping works for intersections
- [ ] Self-snapping is prevented
- [ ] Nearest point is selected when multiple candidates exist
- [ ] Snap indicator disappears after releasing mouse
- [ ] Snapped points are mathematically identical (no gap)
- [ ] Works with all shape types (rectangles, circles, lines, curves)
- [ ] Can close a garment outline with perfect precision

## Performance Check

While testing, also verify:

- [ ] Snapping feels responsive (no lag during drag)
- [ ] Yellow square appears/disappears smoothly
- [ ] No visual glitches or flickering
- [ ] Works smoothly with multiple shapes on canvas

## Acceptance Test: The Blouse Outline

**Final Test** (matches acceptance criteria from issue):

1. Draw the outline of a blouse using multiple line segments:
   - Front neckline
   - Shoulder
   - Sleeve
   - Side seam
   - Bottom hem
   - Back to start (but don't connect)

2. Use Node Tool to drag the last point towards the first point

3. **PASS CRITERIA**:
   - Yellow square appears when close to first point
   - Last point snaps to first point
   - The outline closes perfectly with no gap
   - Coordinates are mathematically identical

---

## Notes for Developers

When verifying this feature in code review:

1. Check `components/editor/snapping.ts` for snap point calculation logic
2. Check `components/editor/Canvas.tsx` for integration in drag handlers
3. Verify the yellow square rendering in the Canvas Layer
4. Test with browser dev tools to confirm exact coordinate matching
5. Check console for any errors during snap operations

## Related Documentation

- `SMART_SNAPPING_IMPLEMENTATION.md` - Technical implementation details
- `NODE_TOOL_IMPLEMENTATION.md` - Node tool feature overview
- Issue #14 - Original feature request and acceptance criteria
