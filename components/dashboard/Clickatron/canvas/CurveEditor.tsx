"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CurvePoint, ColorCurves } from '@/types/clickatron';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CurveEditorProps {
  curves: ColorCurves;
  onChange: (curves: ColorCurves) => void;
  disabled?: boolean;
}

type Channel = 'master' | 'red' | 'green' | 'blue';

const CHANNEL_COLORS = {
  master: '#ffffff',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
};

const GRID_SIZE = 4;

export function CurveEditor({ curves, onChange, disabled = false }: CurveEditorProps) {
  const [activeChannel, setActiveChannel] = useState<Channel>('master');
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);

  // Initialize curves if they are undefined (legacy data)
  const safeCurves = {
    master: curves?.master?.length ? curves.master : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    red: curves?.red?.length ? curves.red : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    green: curves?.green?.length ? curves.green : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    blue: curves?.blue?.length ? curves.blue : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  };

  const activePoints = safeCurves[activeChannel];



  // Convert normalized coordinates (0-1) to SVG coordinates (0-200)
  // SVG coordinate system: (0,0) is top-left, but for graph (0,0) is bottom-left
  const toSvgCoords = (point: CurvePoint) => ({
    x: point.x * 200,
    y: (1 - point.y) * 200,
  });

  const fromSvgCoords = (x: number, y: number) => ({
    x: Math.max(0, Math.min(1, x / 200)),
    y: Math.max(0, Math.min(1, 1 - y / 200)),
  });

  // Catmull-Rom spline interpolation
  const getSplinePath = (points: CurvePoint[]) => {
    if (points.length < 2) return '';

    // Sort points by x
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    const svgPoints = sortedPoints.map(toSvgCoords);

    let path = `M ${svgPoints[0].x} ${svgPoints[0].y}`;

    // Simple linear interpolation for now, can be upgraded to cubic spline if needed for smoother curves
    // Using simple lines is often preferred in photo editors for predictability unless using bezier handles
    // But let's try a basic smoothing
    
    // For now, let's stick to straight lines between points to match standard "Curves" behavior in many simple editors
    // or implement a basic cubic spline if we want that "Photoshop" feel.
    // Let's do a monotonic cubic spline or similar later if requested. 
    // For this implementation, we'll use straight lines for simplicity and robustness, 
    // or a simple smoothing if points are enough.
    
    // Actually, let's try a simple cubic bezier through points
    for (let i = 0; i < svgPoints.length - 1; i++) {
        const p0 = i > 0 ? svgPoints[i - 1] : svgPoints[i];
        const p1 = svgPoints[i];
        const p2 = svgPoints[i + 1];
        const p3 = i < svgPoints.length - 2 ? svgPoints[i + 2] : p2;

        // Catmull-Rom to Cubic Bezier conversion
        // cp1 = p1 + (p2 - p0) / 6
        // cp2 = p2 - (p3 - p1) / 6
        
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;

        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (disabled || draggedPointIndex !== null) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Convert from client coordinates to SVG viewBox coordinates
    const scaleX = 200 / rect.width;
    const scaleY = 200 / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;
    
    const newPoint = fromSvgCoords(svgX, svgY);

    // Don't add point if it's too close to existing points
    const isTooClose = activePoints.some(p => Math.abs(p.x - newPoint.x) < 0.05);
    if (isTooClose) return;

    const newPoints = [...activePoints, newPoint].sort((a, b) => a.x - b.x);
    
    onChange({
      ...safeCurves,
      [activeChannel]: newPoints,
    });
  };

  const handlePointMouseDown = (index: number, e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault(); // Prevent scrolling on touch
    setDraggedPointIndex(index);
  };

  const handlePointDoubleClick = (index: number, e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    // Don't remove endpoints
    if (index === 0 || index === activePoints.length - 1) return;

    const newPoints = activePoints.filter((_, i) => i !== index);
    onChange({
      ...safeCurves,
      [activeChannel]: newPoints,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (draggedPointIndex === null || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    
    // Get coordinates from either mouse or touch event
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Convert from client coordinates to SVG viewBox coordinates
    const scaleX = 200 / rect.width;
    const scaleY = 200 / rect.height;
    const svgX = (clientX - rect.left) * scaleX;
    const svgY = (clientY - rect.top) * scaleY;
    
    let newPoint = fromSvgCoords(svgX, svgY);

    // Get the current curves from the component (avoid stale closure)
    const currentCurves = {
      master: curves?.master?.length ? curves.master : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      red: curves?.red?.length ? curves.red : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      green: curves?.green?.length ? curves.green : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      blue: curves?.blue?.length ? curves.blue : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    };
    
    const currentPoints = currentCurves[activeChannel];

    // Constrain endpoints
    if (draggedPointIndex === 0) {
      newPoint.x = 0;
    } else if (draggedPointIndex === currentPoints.length - 1) {
      newPoint.x = 1;
    } else {
      // Constrain between neighbors
      const prevPoint = currentPoints[draggedPointIndex - 1];
      const nextPoint = currentPoints[draggedPointIndex + 1];
      newPoint.x = Math.max(prevPoint.x + 0.01, Math.min(nextPoint.x - 0.01, newPoint.x));
    }

    const newPoints = [...currentPoints];
    newPoints[draggedPointIndex] = newPoint;

    onChange({
      ...currentCurves,
      [activeChannel]: newPoints,
    });
  }, [draggedPointIndex, activeChannel, onChange, curves]);

  const handleMouseUp = useCallback(() => {
    setDraggedPointIndex(null);
  }, []);

  useEffect(() => {
    if (draggedPointIndex !== null) {
      // Add both mouse and touch event listeners
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove as any, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove as any);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [draggedPointIndex, handleMouseMove, handleMouseUp]);

  const resetChannel = () => {
    onChange({
      ...safeCurves,
      [activeChannel]: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex bg-zinc-800/50 rounded-lg p-1 gap-1">
          {(['master', 'red', 'green', 'blue'] as Channel[]).map((channel) => (
            <button
              key={channel}
              onClick={() => setActiveChannel(channel)}
              className={cn(
                "w-6 h-6 rounded flex items-center justify-center transition-all",
                activeChannel === channel ? "bg-zinc-700 shadow-sm" : "hover:bg-zinc-700/50"
              )}
            >
              <div 
                className="w-3 h-3 rounded-full border border-zinc-500"
                style={{ backgroundColor: channel === 'master' ? '#e4e4e7' : CHANNEL_COLORS[channel] }}
              />
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetChannel}
          disabled={disabled}
          className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </Button>
      </div>

      <div className="relative aspect-square w-full bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden select-none">
        {/* Grid */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="border-r border-b border-zinc-800/50 last:border-r-0 [&:nth-child(4n)]:border-r-0 [&:nth-child(n+13)]:border-b-0" />
          ))}
        </div>
        
        {/* Diagonal Reference Line */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <line x1="0" y1="100%" x2="100%" y2="0" stroke="white" strokeDasharray="4 4" />
        </svg>

        {/* Curve Graph */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          viewBox="0 0 200 200"
          preserveAspectRatio="none"
          onClick={handleSvgClick}
        >
          <path
            d={getSplinePath(activePoints)}
            fill="none"
            stroke={CHANNEL_COLORS[activeChannel]}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-md"
          />

          {/* Control Points */}
          {activePoints.map((point, index) => {
            const coords = toSvgCoords(point);
            return (
              <g key={index} transform={`translate(${coords.x}, ${coords.y})`}>
                <circle
                  r="12" // Larger hit area
                  fill="transparent"
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => handlePointMouseDown(index, e)}
                  onTouchStart={(e) => handlePointMouseDown(index, e)}
                  onDoubleClick={(e) => handlePointDoubleClick(index, e)}
                />
                <circle
                  r="4"
                  fill={CHANNEL_COLORS[activeChannel]}
                  stroke="white"
                  strokeWidth="2"
                  className="pointer-events-none"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
