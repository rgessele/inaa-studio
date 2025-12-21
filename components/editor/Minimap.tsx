"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Stage, Layer, Line, Rect } from "react-konva";
import type Konva from "konva";
import { useEditor } from "./EditorContext";
import { figureLocalPolyline } from "./figurePath";

const MINIMAP_WIDTH = 240;
const MINIMAP_HEIGHT = 160;

export function Minimap() {
  const {
    figures,
    position,
    scale,
    showMinimap,
    setShowMinimap,
    setPosition,
    getStage,
    selectedFigureIds,
  } = useEditor();

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  // Keep track of main stage size
  useEffect(() => {
    const stage = getStage();
    if (!stage) return;

    const updateSize = () => {
      setStageSize({
        width: stage.width(),
        height: stage.height(),
      });
    };

    updateSize();
    
    // Retry getting stage size if it wasn't available initially
    const interval = setInterval(() => {
      const s = getStage();
      if (s && (stageSize.width === 0 || stageSize.height === 0)) {
        setStageSize({
          width: s.width(),
          height: s.height(),
        });
      }
    }, 500);

    const onResize = () => {
      // Small delay to let Canvas update first
      setTimeout(updateSize, 100);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearInterval(interval);
    };
  }, [getStage, stageSize.width, stageSize.height]);

  // Calculate world bounds of all figures
  const worldBounds = useMemo(() => {
    if (figures.length === 0) {
      return { x: -500, y: -500, width: 1000, height: 1000 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const f of figures) {
      // Use a simplified bounding box estimation from nodes
      for (const n of f.nodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
    }

    // Add some padding around figures
    const width = maxX - minX;
    const height = maxY - minY;
    
    // If single point or empty
    if (!Number.isFinite(minX)) return { x: -500, y: -500, width: 1000, height: 1000 };

    return {
      x: minX - 100,
      y: minY - 100,
      width: Math.max(width, 100) + 200,
      height: Math.max(height, 100) + 200,
    };
  }, [figures]);

  // Calculate minimap scale to fit world bounds
  const minimapScale = useMemo(() => {
    const scaleX = MINIMAP_WIDTH / worldBounds.width;
    const scaleY = MINIMAP_HEIGHT / worldBounds.height;
    return Math.min(scaleX, scaleY);
  }, [worldBounds]);

  // Calculate viewport rectangle in minimap coordinates
  const viewportRect = useMemo(() => {
    if (stageSize.width === 0) return null;

    // Visible world area
    const visibleX = -position.x / scale;
    const visibleY = -position.y / scale;
    const visibleW = stageSize.width / scale;
    const visibleH = stageSize.height / scale;

    // Convert to minimap coordinates
    // Minimap origin (0,0) corresponds to worldBounds.x, worldBounds.y
    const x = (visibleX - worldBounds.x) * minimapScale;
    const y = (visibleY - worldBounds.y) * minimapScale;
    const w = visibleW * minimapScale;
    const h = visibleH * minimapScale;

    return { x, y, w, h };
  }, [position, scale, stageSize, worldBounds, minimapScale]);

  const handleMapClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const ptr = stage.getPointerPosition();
    if (!ptr) return;

    // Convert click on minimap to world coordinates
    const worldX = worldBounds.x + ptr.x / minimapScale;
    const worldY = worldBounds.y + ptr.y / minimapScale;

    // Center the main canvas on this point
    // New position should be such that (worldX, worldY) is at center of screen
    // screenCenter = position + world * scale
    // position = screenCenter - world * scale
    const screenCenterX = stageSize.width / 2;
    const screenCenterY = stageSize.height / 2;

    setPosition({
      x: screenCenterX - worldX * scale,
      y: screenCenterY - worldY * scale,
    });
  };

  const handleDragViewport = (
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    // Dragging the viewport rect
    const newX = e.target.x();
    const newY = e.target.y();

    // Convert back to world coordinates
    const worldX = worldBounds.x + newX / minimapScale;
    const worldY = worldBounds.y + newY / minimapScale;

    // worldX is the top-left of the viewport
    // position = -world * scale
    setPosition({
      x: -worldX * scale,
      y: -worldY * scale,
    });
    
    // Reset position of the rect in Konva (we control it via props)
    e.target.position({ x: viewportRect?.x || 0, y: viewportRect?.y || 0 });
  };

  if (!showMinimap) {
    return (
      <button
        onClick={() => setShowMinimap(true)}
        className="absolute bottom-32 right-3 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-floating border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-all hover:scale-105"
        title="Abrir Navegador"
      >
        <span className="material-symbols-outlined text-[20px]">map</span>
      </button>
    );
  }

  return (
    <div 
      className="absolute bottom-32 right-3 z-20 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 shadow-floating animate-in fade-in zoom-in-95 duration-200"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
    >
      <button
        onClick={() => setShowMinimap(false)}
        className="absolute top-1 right-1 z-30 flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        title="Fechar Navegador"
      >
        <span className="material-symbols-outlined text-[12px]">close</span>
      </button>

      <Stage
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        onClick={handleMapClick}
        onTap={handleMapClick}
      >
        <Layer>
          {/* Background for the map area */}
          <Rect
            width={MINIMAP_WIDTH}
            height={MINIMAP_HEIGHT}
            fill="transparent"
          />

          {/* Simplified figures */}
          {figures.map((f) => {
            // Transform figure to minimap coordinates
            // f.x, f.y are in world coords
            // We need to shift by worldBounds.x, worldBounds.y and scale
            const mx = (f.x - worldBounds.x) * minimapScale;
            const my = (f.y - worldBounds.y) * minimapScale;
            
            // For performance, we can just draw the polyline or even a bounding box
            // Let's try polyline first, it's nicer
            const flatPoints = figureLocalPolyline(f, 1); // Low detail
            const isSelected = selectedFigureIds.includes(f.id);

            return (
              <Line
                key={f.id}
                x={mx}
                y={my}
                points={flatPoints}
                scaleX={minimapScale}
                scaleY={minimapScale}
                rotation={f.rotation}
                stroke={isSelected ? "#2563eb" : "#9ca3af"} // blue-600 if selected, else gray-400
                strokeWidth={isSelected ? 2 / minimapScale : 1 / minimapScale}
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          })}

          {/* Viewport Rectangle */}
          {viewportRect && (
            <Rect
              x={viewportRect.x}
              y={viewportRect.y}
              width={viewportRect.w}
              height={viewportRect.h}
              stroke="#a855f7" // guide-neon
              strokeWidth={2}
              fill="rgba(168, 85, 247, 0.1)"
              draggable
              onDragMove={handleDragViewport}
              dragBoundFunc={(pos) => {
                // Constrain drag if needed, or just let it fly
                return pos;
              }}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
