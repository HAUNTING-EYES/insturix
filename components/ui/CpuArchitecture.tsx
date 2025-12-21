"use client";

import { cn } from "@/lib/utils";
import React from "react";
import { motion } from "framer-motion";

export interface CpuArchitectureSvgProps {
  className?: string;
  width?: string;
  height?: string;
  text?: string;
  showCpuConnections?: boolean;
  lineMarkerSize?: number;
  animateText?: boolean;
  animateLines?: boolean;
  animateMarkers?: boolean;
}

const goals = [
  { id: 1, label: "Plan", x: 10, y: 20, anchor: "end", dx: -5 },
  { id: 2, label: "Scale", x: 180, y: 10, anchor: "start", dx: 5 },
  { id: 3, label: "Protect", x: 130, y: 20, anchor: "start", dx: 5 },
  { id: 4, label: "Analyze", x: 170, y: 80, anchor: "start", dx: 5 },
  { id: 5, label: "Automate", x: 118, y: 72, anchor: "start", dx: 5 },
  { id: 6, label: "Grow", x: 94.8, y: 95, anchor: "middle", dy: 8 },
  { id: 7, label: "Secure", x: 88, y: 88, anchor: "end", dx: -5 },
  { id: 8, label: "Create", x: 30, y: 30, anchor: "end", dx: -5 },
];

const CpuArchitecture = ({
  className,
  width = "100%",
  height = "100%",
  text = "INSTURIX",
  showCpuConnections = true,
  animateText = true,
  lineMarkerSize = 18,
  animateLines = true,
  animateMarkers = true,
}: CpuArchitectureSvgProps) => {
  return (
    <svg
      className={cn("text-neutral-400 overflow-visible", className)}
      width={width}
      height={height}
      viewBox="0 0 200 100"
    >
      {/* Paths */}
      <g
        stroke="currentColor"
        fill="none"
        strokeWidth="0.3"
        strokeDasharray="100 100"
        pathLength="100"
        markerStart="url(#cpu-circle-marker)"
      >
        {/* 1st */}
        <path
          strokeDasharray="100 100"
          pathLength="100"
          d="M 10 20 h 79.5 q 5 0 5 5 v 30"
        />
        {/* 2nd */}
        <path
          strokeDasharray="100 100"
          pathLength="100"
          d="M 180 10 h -69.7 q -5 0 -5 5 v 30"
        />
        {/* 3rd */}
        <path d="M 130 20 v 21.8 q 0 5 -5 5 h -10" />
        {/* 4th */}
        <path d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50" />
        {/* 5th */}
        <path
          strokeDasharray="100 100"
          pathLength="100"
          d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20"
        />
        {/* 6th */}
        <path d="M 94.8 95 v -36" />
        {/* 7th */}
        <path d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14" />
        {/* 8th */}
        <path d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20" />
        {/* Animation For Path Starting */}
        {animateLines && (
          <animate
            attributeName="stroke-dashoffset"
            from="100"
            to="0"
            dur="1.5s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.25,0.1,0.5,1"
            keyTimes="0; 1"
          />
        )}
      </g>

      {/* Goal Labels */}
      {goals.map((goal, i) => (
        <motion.text
          key={goal.id}
          x={goal.x + (goal.dx || 0)}
          y={goal.y + (goal.dy || 0)}
          textAnchor={goal.anchor as "start" | "middle" | "end" | "inherit" | undefined}
          className="text-[4px] fill-neutral-400 font-medium uppercase tracking-wider"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 + i * 0.1, duration: 0.5 }}
          alignmentBaseline="middle"
        >
          {goal.label}
        </motion.text>
      ))}

      {/* 1. Blue Light */}
      <g mask="url(#cpu-mask-1)">
        <circle
          className="cpu-architecture cpu-line-1"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-blue-grad)"
        />
      </g>
      {/* 2. Yellow Light */}
      <g mask="url(#cpu-mask-2)">
        <circle
          className="cpu-architecture cpu-line-2"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-yellow-grad)"
        />
      </g>
      {/* 3. Pinkish Light */}
      <g mask="url(#cpu-mask-3)">
        <circle
          className="cpu-architecture cpu-line-3"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-pinkish-grad)"
        />
      </g>
      {/* 4. White Light */}
      <g mask="url(#cpu-mask-4)">
        <circle
          className="cpu-architecture cpu-line-4"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-white-grad)"
        />
      </g>
      {/* 5. Green Light */}
      <g mask="url(#cpu-mask-5)">
        <circle
          className="cpu-architecture cpu-line-5"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-green-grad)"
        />
      </g>
      {/* 6. Orange Light */}
      <g mask="url(#cpu-mask-6)">
        <circle
          className="cpu-architecture cpu-line-6"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-orange-grad)"
        />
      </g>
      {/* 7. Cyan Light */}
      <g mask="url(#cpu-mask-7)">
        <circle
          className="cpu-architecture cpu-line-7"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-cyan-grad)"
        />
      </g>
      {/* 8. Rose Light */}
      <g mask="url(#cpu-mask-8)">
        <circle
          className="cpu-architecture cpu-line-8"
          cx="0"
          cy="0"
          r="8"
          fill="url(#cpu-rose-grad)"
        />
      </g>
      {/* CPU Box */}
      <g>
        {/* Cpu connections */}
        {showCpuConnections && (
          <g fill="url(#cpu-connection-gradient)">
            <rect x="93" y="37" width="2.5" height="5" rx="0.7" />
            <rect x="104" y="37" width="2.5" height="5" rx="0.7" />
            <rect
              x="116.3"
              y="44"
              width="2.5"
              height="5"
              rx="0.7"
              transform="rotate(90 116.25 45.5)"
            />
            <rect
              x="122.8"
              y="44"
              width="2.5"
              height="5"
              rx="0.7"
              transform="rotate(90 116.25 45.5)"
            />
            <rect
              x="104"
              y="16"
              width="2.5"
              height="5"
              rx="0.7"
              transform="rotate(180 105.25 39.5)"
            />
            <rect
              x="114.5"
              y="16"
              width="2.5"
              height="5"
              rx="0.7"
              transform="rotate(180 105.25 39.5)"
            />
            <rect
              x="80"
              y="-13.6"
              width="2.5"
              height="5"
              rx="0.7"
              transform="rotate(270 115.25 19.5)"
            />
            <rect
              x="87"
              y="-13.6"
              width="2.5"
              height="5"
              rx="0.7"
              transform="rotate(270 115.25 19.5)"
            />
          </g>
        )}
        {/* Main CPU Rectangle */}
        <rect
          x="80"
          y="40"
          width="40"
          height="20"
          rx="2"
          fill="#101010"
          stroke="#262626"
          strokeWidth="0.5"
          filter="url(#cpu-light-shadow)"
        />
        {/* CPU Text */}
        <text
          x="100"
          y="51.5"
          fontSize="5"
          fill={animateText ? "url(#cpu-text-gradient)" : "white"}
          fontWeight="700"
          letterSpacing="0.1em"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {text}
        </text>
      </g>
      {/* Masks */}
      <defs>
        <mask id="cpu-mask-1">
          <path
            d="M 10 20 h 79.5 q 5 0 5 5 v 24"
            strokeWidth="0.5"
            stroke="white"
          />
        </mask>
        <mask id="cpu-mask-2">
          <path
            d="M 180 10 h -69.7 q -5 0 -5 5 v 24"
            strokeWidth="0.5"
            stroke="white"
          />
        </mask>
        <mask id="cpu-mask-3">
          <path
            d="M 130 20 v 21.8 q 0 5 -5 5 h -10"
            strokeWidth="0.5"
            stroke="white"
          />
        </mask>
        <mask id="cpu-mask-4">
          <path
            d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50"
            strokeWidth="0.5"
            stroke="white"
          />
        </mask>
        <mask id="cpu-mask-5">
          <path
            d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20"
            strokeWidth="0.5"
            stroke="white"
          />
        </mask>
        <mask id="cpu-mask-6">
          <path d="M 94.8 95 v -36" strokeWidth="0.5" stroke="white" />
        </mask>
        <mask id="cpu-mask-7">
          <path
            d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14"
            strokeWidth="0.5"
            stroke="white"
          />
        </mask>
        <mask id="cpu-mask-8">
          <path
            d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20"
            strokeWidth="0.5"
            stroke="white"
          />
        </mask>
        {/* Gradients */}
        <radialGradient id="cpu-blue-grad" fx="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-yellow-grad" fx="1">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-pinkish-grad" fx="1">
          <stop offset="0%" stopColor="#EC4899" />
          <stop offset="50%" stopColor="#DB2777" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-white-grad" fx="1">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-green-grad" fx="1">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-orange-grad" fx="1">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-cyan-grad" fx="1">
          <stop offset="0%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-rose-grad" fx="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <filter
          id="cpu-light-shadow"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feDropShadow
            dx="1.5"
            dy="1.5"
            stdDeviation="1"
            floodColor="black"
            floodOpacity="0.1"
          />
        </filter>
        <marker
          id="cpu-circle-marker"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth={lineMarkerSize}
          markerHeight={lineMarkerSize}
        >
          <circle
            id="innerMarkerCircle"
            cx="5"
            cy="5"
            r="2"
            fill="currentColor"
            stroke="none"
          >
            {animateMarkers && (
              <animate attributeName="r" values="0; 2; 1.5" dur="1s" />
            )}
          </circle>
        </marker>
        {/* Cpu connection gradient */}
        <linearGradient
          id="cpu-connection-gradient"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor="#4F4F4F" />
          <stop offset="60%" stopColor="#121214" />
        </linearGradient>
        {/* CPU Text Gradient */}
        <linearGradient id="cpu-text-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#666666">
            <animate
              attributeName="offset"
              values="-2; -1; 0"
              dur="3s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0; 0.5; 1"
              keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
            />
          </stop>
          <stop offset="25%" stopColor="white">
            <animate
              attributeName="offset"
              values="-1; 0; 1"
              dur="3s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0; 0.5; 1"
              keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
            />
          </stop>
          <stop offset="50%" stopColor="#666666">
            <animate
              attributeName="offset"
              values="0; 1; 2;"
              dur="3s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0; 0.5; 1"
              keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
            />
          </stop>
        </linearGradient>
      </defs>
    </svg>
  );
};

export { CpuArchitecture };

