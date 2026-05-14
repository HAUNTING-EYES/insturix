"use client";

import { motion, MotionValue, useTransform, useMotionValue } from "framer-motion";
import { Products } from "./data/product-data";
import { cn } from "@/lib/utils";

// Flow connections showing the creative workflow
const FLOW_STEPS = [
  { label: "Sharpen your idea" },
  { label: "Generate visuals" },
  { label: "Craft video" },
  { label: "Analyze data" },
  { label: "Compose music" },
  { label: "Launch & Grow" },
];

interface ProductFlowDiagramProps {
  scrollProgress?: MotionValue<number>;
}

export const ProductFlowDiagram = ({ scrollProgress }: ProductFlowDiagramProps) => {
  const fallbackProgress = useMotionValue(0);
  const lineProgress = useTransform(
    scrollProgress || fallbackProgress,
    [0.10, 0.18],
    [0, 1]
  );

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 pt-0 md:pt-0">
      {/* Title */}
      <div className="text-center mb-8 md:mb-16">
        <h2 className="text-[18px] md:text-[44px] font-bold text-neutral-900 dark:text-white mb-1 md:mb-4 tracking-tight">
          Your Creative Journey
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-[11px] md:text-lg">
          From spark to share — we&apos;ve got every step covered
        </p>
      </div>

      {/* === DESKTOP LAYOUT === */}
      <div className="hidden md:block relative min-h-[420px]">
        {/* Desktop SVG */}
        <svg 
          className="absolute inset-0 pointer-events-none z-0"
          viewBox="0 0 1200 420"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Background dashed path */}
          <motion.path
            d="M 100,70 C 200,70 200,350 300,350 S 400,70 500,70 S 600,350 700,350 S 800,70 900,70 S 1000,350 1100,350"
            fill="none"
            stroke="white"
            strokeOpacity="0.15"
            strokeWidth="2"
            strokeDasharray="8,8"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
          
          {/* Progress path */}
          {scrollProgress && (
            <motion.path
              d="M 100,70 C 200,70 200,350 300,350 S 400,70 500,70 S 600,350 700,350 S 800,70 900,70 S 1000,350 1100,350"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              filter="url(#glow)"
              style={{ pathLength: lineProgress }}
            />
          )}
        </svg>

        {/* Desktop Product Grid - positioned to match SVG points */}
        <div className="relative z-10 grid grid-cols-6 gap-4 h-[420px]">
          {Products.map((product, i) => {
            const isTop = i % 2 === 0; // 0,2,4 are top; 1,3,5 are bottom
            
            return (
              <div
                key={product.Id}
                className={cn(
                  "flex flex-col items-center",
                  isTop ? "self-start -mt-4" : "self-end translate-y-12"
                )}
              >
                {/* Label above icon for top row */}
                {isTop && (
                  <span className="mb-4 text-[18px] text-neutral-400 font-[family-name:var(--font-caveat)] -rotate-3">
                    {FLOW_STEPS[i]?.label}
                  </span>
                )}
                
                {/* Icon */}
                <div 
                  className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg bg-white dark:bg-neutral-900 transition-transform hover:scale-110"
                  style={{
                    border: `2px dashed ${product.accentColor}50`,
                    boxShadow: `0 0 0 4px ${product.accentColor}10`
                  }}
                >
                  <product.Icon 
                    className="w-8 h-8" 
                    style={{ color: product.accentColor }} 
                  />
                </div>

                {/* Name */}
                <span className="mt-3 text-[14px] font-bold text-neutral-900 dark:text-white">
                  {product.name}
                </span>

                {/* Label below icon for bottom row */}
                {!isTop && (
                  <span className="mt-2 text-lg text-neutral-400 font-[family-name:var(--font-caveat)] rotate-3">
                    {FLOW_STEPS[i]?.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* === MOBILE LAYOUT === */}
      <div className="md:hidden relative">
        {/* Mobile: Simple alternating list with connecting line */}
        <div className="relative flex flex-col gap-6">
          {/* Vertical connecting line in the center */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 z-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]">
            {/* Background line */}
            <div className="absolute inset-0 bg-white/10" />
            {/* Progress line */}
            {scrollProgress && (
              <motion.div
                className="absolute top-0 left-0 right-0 bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.5)]"
                style={{ 
                  height: useTransform(lineProgress, [0, 1], ["0%", "100%"]) 
                }}
              />
            )}
          </div>

          {Products.map((product, i) => {
            const isLeft = i % 2 === 0;
            
            return (
              <motion.div
                key={product.Id}
                className={cn(
                  "relative z-10 flex items-center gap-3",
                  isLeft ? "flex-row-reverse pr-[55%]" : "flex-row pl-[55%]"
                )}
                initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
              >
                {/* Central Dot */}
                <div 
                  className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white dark:bg-neutral-950 border-2 z-20"
                  style={{ borderColor: product.accentColor }}
                />

                {/* Icon */}
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg bg-white dark:bg-neutral-900 shrink-0 z-10"
                  style={{
                    border: `2px dashed ${product.accentColor}50`,
                    boxShadow: `0 0 0 3px ${product.accentColor}10`
                  }}
                >
                  <product.Icon 
                    className="w-6 h-6" 
                    style={{ color: product.accentColor }} 
                  />
                </div>

                {/* Text */}
                <div className={cn(
                  "flex flex-col",
                  isLeft ? "items-end text-right" : "items-start text-left"
                )}>
                  <span className="text-sm font-bold text-neutral-900 dark:text-white">
                    {product.name}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-[family-name:var(--font-caveat)]">
                    {FLOW_STEPS[i]?.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
