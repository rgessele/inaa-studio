# Dart Tool Visual Guide

## Tool Location in UI

```
┌─────────────────────────────────────────────────────────────┐
│ TOOLBAR (Left Side)                                         │
├─────────────────────────────────────────────────────────────┤
│  [💾] Save                                                   │
│  [⬇] Export                                                  │
│  ───────────                                                 │
│  [↶] Undo                                                    │
│  [↷] Redo                                                    │
│  [⌫] Delete                                                  │
│  ───────────                                                 │
│  [→] Select (V)                                              │
│  [○] Edit Nodes (N)                                          │
│  [✋] Pan (H)                                                 │
│  ───────────                                                 │
│  [▭] Rectangle (R)                                           │
│  [○] Circle (C)                                              │
│  [─] Line (L)                                                │
│  [~] Curve (U)                                               │
│  [✎] Pen (Coming soon)                                       │
│  ───────────                                                 │
│  [T] Text (Coming soon)                                      │
│  [📏] Measure (M)                                            │
│  ───────────                                                 │
│  [▭▭] Seam Allowance (O)                                     │
│  [△] DART TOOL (D) ← NEW!                                   │
│  ───────────                                                 │
│  [🗑] Clear All                                              │
└─────────────────────────────────────────────────────────────┘
```

## Dart Tool Activation

When you press `D` or click the dart button:

```
┌─────────────────────────────────────────────────────────────┐
│                    CANVAS TOP PANEL                          │
├─────────────────────────────────────────────────────────────┤
│  Profundidade: [3.0▼] cm   Abertura: [2.0▼] cm             │
│  Clique em uma forma para adicionar pence                   │
└─────────────────────────────────────────────────────────────┘
```

## Dart Geometry

### Before Dart Application

```
Simple Line:
    P1 ──────────────────────────────── P2
```

### After Dart Application

```
Line with Dart:
    P1 ──────── L ╱╲ R ──────────── P2
                 ╱  ╲
                ╱    ╲  ← Depth (Profundidade)
               ╱      ╲
              A (Apex)

    |←── Opening ───→|
       (Abertura)
```

### Points Array Transformation

**Before:**

```javascript
points: [P1.x, P1.y, P2.x, P2.y]; // 2 vertices, 4 numbers
```

**After:**

```javascript
points: [
  P1.x,
  P1.y, // Start point
  L.x,
  L.y, // Left base
  A.x,
  A.y, // Apex (dart point)
  R.x,
  R.y, // Right base
  P2.x,
  P2.y, // End point
]; // 5 vertices, 10 numbers
```

## Dart on Different Shapes

### Rectangle with Dart on Top Edge

```
Original Rectangle:
    ┌─────────────────────┐
    │                     │
    │                     │
    │                     │
    └─────────────────────┘

With Dart:
    ┌──────╲   /─────────┐
    │       ╲ /           │
    │        v            │  ← Dart pointing inward
    │                     │
    └─────────────────────┘
```

### Circle with Dart

```
Original Circle:
        ╭─────╮
      ╱         ╲
     │           │
     │           │
      ╲         ╱
        ╰─────╯

With Dart:
        ╭──╲ /─╮
      ╱     v   ╲    ← Dart at position 50%
     │           │
     │           │
      ╲         ╱
        ╰─────╯
```

## Parameter Examples

### Shallow Wide Dart (Bust Dart)

```
Profundidade: 8 cm
Abertura: 4 cm

    ───────── ╲     / ─────────
               ╲   /
                ╲ /
                 v
                (8cm deep)
    |←── 4cm ───→|
```

### Deep Narrow Dart (Waist Dart)

```
Profundidade: 12 cm
Abertura: 2 cm

    ─────────── |   | ───────────
                |   |
                 \ /
                  |
                  |
                  v
                 (12cm)
    |←─ 2cm ─→|
```

### Small Dart (Shoulder Adjustment)

```
Profundidade: 3 cm
Abertura: 1.5 cm

    ──────────── \ / ────────────
                  v
                 (3cm)
    |← 1.5cm →|
```

## Usage Flow

```
1. Select Dart Tool
   └─ Press D or click triangle button

2. Configuration Panel Appears
   └─ Adjust Profundidade (depth)
   └─ Adjust Abertura (opening)

3. Click on Shape
   └─ Line, rectangle, circle, or curve
   └─ Dart appears immediately

4. Adjust Parameters (Real-time)
   └─ Change depth → dart updates
   └─ Change opening → dart updates

5. Switch Tools or Continue
   └─ Dart is permanently part of shape
   └─ Editable with node tool
   └─ Moveable with select tool
```

## Technical Details

### Coordinate System

```
Screen Coordinates:
    0,0 ───────→ X (right)
     │
     │
     ↓
     Y (down)
```

### Normal Vector Calculation

For horizontal line from (0,0) to (100,0):

```
Edge Vector: (100, 0)
Normal Vector: (0, -100)  [points downward/inward]

Normalized: (0, -1)
Scaled by depth (113px): (0, -113)
```

For vertical line from (0,0) to (0,100):

```
Edge Vector: (0, 100)
Normal Vector: (100, 0)  [points right/inward]

Normalized: (1, 0)
Scaled by depth (113px): (113, 0)
```

### Rotation Formula

```
Counter-clockwise 90° rotation:
(dx, dy) → (dy, -dx)

Example:
(100, 0) → (0, -100)  ✓ Points down
(0, 100) → (100, 0)   ✓ Points right
```

## Export Behavior

In the export modal:

```
┌────────────────────────────────────┐
│  Elementos do desenho              │
├────────────────────────────────────┤
│  ☑ Retângulos                      │
│  ☑ Círculos                        │
│  ☑ Linhas                          │
│  ☑ Curvas                          │
│  ☑ Pences      ← Can toggle on/off │
└────────────────────────────────────┘
```

## Integration with Other Tools

### With Node Tool (N)

```
All dart vertices become editable:
    P1 ● ●L ●A ●R ● P2
         ↑  ↑  ↑
    All nodes can be dragged
```

### With Select Tool (V)

```
Entire shape (including dart) moves together:
    ┌──────────────────┐
    │  [Drag anywhere] │
    │        ↓         │
    └──────────────────┘
```

### With Measure Tool (M)

```
Can measure dart dimensions:
    ←─── Opening ───→
         ╲    /
          ╲  /
           ↓
        Depth
```

## Keyboard Shortcuts Summary

```
D     - Activate Dart Tool
V     - Select Tool (to move darted shape)
N     - Node Tool (to edit dart vertices)
Cmd+Z - Undo dart operation
Cmd+Y - Redo dart operation
```

## Common Use Cases

### 1. Waist Dart on Skirt Pattern

```
Click on waistline → Dart inserted
Typical: Depth 10-12cm, Opening 2-3cm
```

### 2. Bust Dart on Bodice

```
Click on side seam → Dart inserted
Typical: Depth 8-10cm, Opening 3-4cm
```

### 3. Shoulder Dart

```
Click on shoulder seam → Dart inserted
Typical: Depth 3-5cm, Opening 1-2cm
```

## Tips

1. **Starting Values**: Default 3cm depth, 2cm opening works for most darts
2. **Position**: Currently fixed at middle (50%) - future enhancement
3. **Multiple Darts**: Apply to different shapes separately
4. **Undo Available**: Cmd+Z if dart doesn't look right
5. **Node Editing**: Use N tool to fine-tune dart vertices
6. **Export Control**: Toggle in export modal if needed

---

_This visual guide corresponds to the implementation in PR copilot/add-crease-tool-functionality_
