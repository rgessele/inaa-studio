"use client";

import React, { useEffect, useRef } from "react";
import { useEditor } from "./EditorContext";

interface RulerProps {
  orientation: "horizontal" | "vertical";
}

export function Ruler({ orientation }: RulerProps) {
  const { scale, position, unit, pixelsPerUnit, addGuide, updateGuide, removeGuide } =
    useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });
  const TICK_SIZE = 10;
  const LABEL_OFFSET = 4;

  const dragRef = useRef<
    | {
        pointerId: number;
        guideId: string | null;
      }
    | null
  >(null);

  const updateFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const drag = dragRef.current;
    if (!drag) return;

    const isHorizontal = orientation === "horizontal";

    const stageX = isHorizontal ? clientX - rect.left : clientX - rect.right;
    const stageY = isHorizontal ? clientY - rect.bottom : clientY - rect.top;

    const inCanvas = isHorizontal ? stageY > 0 : stageX > 0;
    const valuePx = isHorizontal
      ? (stageY - position.y) / scale
      : (stageX - position.x) / scale;

    // Create a guide only after the user drags into the stage area.
    if (!drag.guideId && inCanvas) {
      drag.guideId = addGuide(orientation, valuePx);
    }

    if (drag.guideId) {
      updateGuide(drag.guideId, valuePx);
    }
  };

  const endDrag = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!canvas || !drag) return;

    const rect = canvas.getBoundingClientRect();
    const isHorizontal = orientation === "horizontal";

    const overRuler = isHorizontal
      ? clientY >= rect.top && clientY <= rect.bottom
      : clientX >= rect.left && clientX <= rect.right;

    if (drag.guideId && overRuler) {
      removeGuide(drag.guideId);
    }
  };

  useEffect(() => {
    return () => {
      const active = dragRef.current;
      if (!active) return;
      dragRef.current = null;
      if (active.guideId) removeGuide(active.guideId);
    };
  }, [removeGuide]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // We rely on the parent div for background color to support themes
    // But we need to set text/stroke colors based on theme
    const isDark = document.documentElement.classList.contains("dark");
    ctx.strokeStyle = isDark ? "#4b5563" : "#d1d5db"; // gray-600 : gray-300
    ctx.fillStyle = isDark ? "#9ca3af" : "#6b7280"; // gray-400 : gray-500
    ctx.font = "10px Inter, sans-serif";
    ctx.lineWidth = 1;

    // Calculate start and end values based on viewport
    // position.x/y is the offset of the stage (in pixels)
    // scale is the zoom level

    // Visible range in PIXELS
    const startPx =
      orientation === "horizontal" ? -position.x / scale : -position.y / scale;

    const viewportSize = orientation === "horizontal" ? width : height;
    const endPx = startPx + viewportSize / scale;

    // We want to calculate intervals in UNITS
    // Convert visible range to units
    const startUnit = startPx / pixelsPerUnit;
    const endUnit = endPx / pixelsPerUnit;

    // Determine tick interval in UNITS
    // We want ticks roughly every 50-100 pixels on screen
    const minTickSpacingScreen = 50;
    // How many units fit in that screen space?
    const minIntervalUnit = minTickSpacingScreen / (pixelsPerUnit * scale);

    // Find a nice round number for the interval in UNITS
    const magnitude = Math.pow(10, Math.floor(Math.log10(minIntervalUnit)));
    let intervalUnit = magnitude;
    if (minIntervalUnit / magnitude > 5) intervalUnit = magnitude * 10;
    else if (minIntervalUnit / magnitude > 2) intervalUnit = magnitude * 5;
    else if (minIntervalUnit / magnitude > 1) intervalUnit = magnitude * 2;

    // Align start to interval
    const firstTickUnit = Math.floor(startUnit / intervalUnit) * intervalUnit;

    ctx.beginPath();

    // Loop through units
    // We add a small buffer to endUnit to ensure we catch the last tick
    for (
      let valUnit = firstTickUnit;
      valUnit <= endUnit + intervalUnit;
      valUnit += intervalUnit
    ) {
      // Convert unit value back to screen position
      const valPx = valUnit * pixelsPerUnit;

      const screenPos =
        orientation === "horizontal"
          ? valPx * scale + position.x
          : valPx * scale + position.y;

      // Skip if off screen
      if (screenPos < -50 || screenPos > viewportSize + 50) continue;

      // Format label
      const labelValue = parseFloat(valUnit.toFixed(4));

      if (orientation === "horizontal") {
        // Draw tick
        ctx.moveTo(screenPos, height);
        ctx.lineTo(screenPos, height - TICK_SIZE);
        // Draw label
        ctx.fillText(
          labelValue.toString(),
          screenPos + LABEL_OFFSET,
          height - LABEL_OFFSET
        );
      } else {
        // Draw tick
        ctx.moveTo(width, screenPos);
        ctx.lineTo(width - TICK_SIZE, screenPos);

        // Draw label (rotated for vertical)
        ctx.save();
        // Position text above the tick (smaller Y) and aligned right
        ctx.translate(width - LABEL_OFFSET, screenPos - LABEL_OFFSET);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(labelValue.toString(), 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();
  }, [scale, position, orientation, unit, pixelsPerUnit, canvasSize]);

  // Resize observer to handle window resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      setCanvasSize({ width: parent.clientWidth, height: parent.clientHeight });
    });

    resizeObserver.observe(parent);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      onPointerDown={(e) => {
        // Left button only.
        if (e.button !== 0) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        if (!canvas) return;

        dragRef.current = { pointerId: e.pointerId, guideId: null };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }

        const onMove = (evt: PointerEvent) => {
          if (!dragRef.current || dragRef.current.pointerId !== evt.pointerId) return;
          updateFromClient(evt.clientX, evt.clientY);
        };

        const onUp = (evt: PointerEvent) => {
          if (!dragRef.current || dragRef.current.pointerId !== evt.pointerId) return;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          endDrag(evt.clientX, evt.clientY);
          try {
            canvas.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
    />
  );
}

