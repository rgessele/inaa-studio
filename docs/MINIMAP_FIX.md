# Minimap Selection Highlight Fix

## Problem
The user reported that the minimap was no longer highlighting the selected figure. This was because the `Minimap` component was rendering all figures with a static gray color (`#9ca3af`) and ignoring the selection state.

## Solution
We updated `components/editor/Minimap.tsx` to be aware of the selection state.

## Changes

### 1. Updated `components/editor/Minimap.tsx`
- Destructured `selectedFigureIds` from the `useEditor` hook.
- Inside the figure rendering loop, added a check: `const isSelected = selectedFigureIds.includes(f.id);`.
- Applied conditional styling based on `isSelected`:
  - **Stroke Color**: Changed from static `#9ca3af` (gray-400) to `isSelected ? "#2563eb" : "#9ca3af"` (blue-600 for selected).
  - **Stroke Width**: Increased visibility for selected items: `isSelected ? 2 / minimapScale : 1 / minimapScale`.

## Result
Selected figures now appear in blue and with a thicker line on the minimap, making it easy to locate them relative to the viewport.
