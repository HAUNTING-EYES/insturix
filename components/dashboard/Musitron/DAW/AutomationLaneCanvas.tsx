"use client";

import { useRef, useEffect, useCallback } from "react";
import type { AutomationLane } from "@/lib/musitron/daw-types";
import { useDAW } from "./DAWContext";
import { getValueRange, clampAutomationValue } from "@/lib/musitron/automation-utils";

const POINT_RADIUS = 5;
const HIT_RADIUS = 8;

interface AutomationLaneCanvasProps {
  lane: AutomationLane;
  trackId: string;
  zoom: number;
  width: number;
  height: number;
}

export default function AutomationLaneCanvas({
  lane,
  trackId,
  zoom,
  width,
  height,
}: AutomationLaneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { dispatch } = useDAW();
  const dragRef = useRef<{
    pointId: string;
    startX: number;
    startY: number;
    origTime: number;
    origValue: number;
  } | null>(null);
  const [min, max] = getValueRange(lane.param);

  const valueToY = useCallback(
    (value: number) => height - ((value - min) / (max - min)) * height,
    [height, min, max],
  );

  const yToValue = useCallback(
    (y: number) => clampAutomationValue(lane.param, min + ((height - y) / height) * (max - min)),
    [height, min, max, lane.param],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const defaultVal = lane.param === "gain" ? 1 : 0;
    const defaultY = valueToY(defaultVal);
    ctx.strokeStyle = "#2A2925";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, defaultY);
    ctx.lineTo(width, defaultY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (lane.points.length > 0) {
      ctx.strokeStyle = "#D4A652";
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const firstX = lane.points[0].time * zoom;
      const firstY = valueToY(lane.points[0].value);
      ctx.moveTo(0, firstY);
      if (firstX > 0) ctx.lineTo(firstX, firstY);

      for (let i = 0; i < lane.points.length; i++) {
        ctx.lineTo(lane.points[i].time * zoom, valueToY(lane.points[i].value));
      }

      const lastPt = lane.points[lane.points.length - 1];
      const lastX = lastPt.time * zoom;
      const lastY = valueToY(lastPt.value);
      if (lastX < width) ctx.lineTo(width, lastY);

      ctx.stroke();

      for (const point of lane.points) {
        const x = point.time * zoom;
        const y = valueToY(point.value);
        if (x < -POINT_RADIUS || x > width + POINT_RADIUS) continue;

        ctx.beginPath();
        ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = "#141413";
        ctx.fill();
        ctx.strokeStyle = "#D4A652";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [lane, width, height, zoom, valueToY]);

  const findPointAt = useCallback(
    (x: number, y: number): string | null => {
      for (const point of lane.points) {
        const px = point.time * zoom;
        const py = valueToY(point.value);
        if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) <= HIT_RADIUS) return point.id;
      }
      return null;
    },
    [lane.points, zoom, valueToY],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (e.button === 2) {
        const pointId = findPointAt(x, y);
        if (pointId) {
          dispatch({ type: "REMOVE_AUTOMATION_POINT", trackId, laneId: lane.id, pointId });
        }
        return;
      }

      const pointId = findPointAt(x, y);
      if (pointId) {
        const point = lane.points.find((p) => p.id === pointId)!;
        dragRef.current = {
          pointId,
          startX: e.clientX,
          startY: e.clientY,
          origTime: point.time,
          origValue: point.value,
        };

        const onMove = (me: MouseEvent) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = me.clientX - d.startX;
          const dy = me.clientY - d.startY;
          const newTime = Math.max(0, d.origTime + dx / zoom);
          const newValue = clampAutomationValue(
            lane.param,
            d.origValue - (dy / height) * (max - min),
          );
          dispatch({
            type: "MOVE_AUTOMATION_POINT",
            trackId,
            laneId: lane.id,
            pointId: d.pointId,
            time: newTime,
            value: newValue,
          });
        };

        const onUp = () => {
          dragRef.current = null;
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      } else {
        const time = Math.max(0, x / zoom);
        const value = yToValue(y);
        dispatch({
          type: "ADD_AUTOMATION_POINT",
          trackId,
          laneId: lane.id,
          point: { id: `ap-${Date.now()}`, time, value },
        });
      }
    },
    [dispatch, trackId, lane.id, lane.param, lane.points, zoom, height, min, max, findPointAt, yToValue],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      style={{ width, height, display: "block", cursor: "crosshair" }}
    />
  );
}
