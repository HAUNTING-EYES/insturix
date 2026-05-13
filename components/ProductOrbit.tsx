"use client";

import { motion, MotionValue, useTransform } from "framer-motion";
import { Products } from "./data/product-data";
import { cn } from "@/lib/utils";

interface ProductOrbitProps {
  progress: MotionValue<number>; // 0 = clustered, 1 = exploded
}

// Positions for 6 icons in a hexagonal/orbital arrangement
const ICON_POSITIONS = [
  { x: 0, y: -120, z: 50, rotateY: 0 },      // Top
  { x: 100, y: -60, z: -30, rotateY: 30 },   // Top-right
  { x: 100, y: 60, z: 30, rotateY: -20 },    // Bottom-right
  { x: 0, y: 120, z: -50, rotateY: 10 },     // Bottom
  { x: -100, y: 60, z: 40, rotateY: -30 },   // Bottom-left
  { x: -100, y: -60, z: -20, rotateY: 20 },  // Top-left
];

export const ProductOrbit = ({ progress }: ProductOrbitProps) => {
  // Global rotation of the whole cluster
  const clusterRotateY = useTransform(progress, [0, 0.5], [0, 45]);
  const clusterRotateX = useTransform(progress, [0, 0.5], [15, 5]);
  
  return (
    <div 
      className="relative w-full h-full flex items-center justify-center"
      style={{ perspective: "1000px" }}
    >
      <motion.div
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          rotateY: clusterRotateY,
          rotateX: clusterRotateX,
        }}
      >
        {Products.map((product, index) => {
          const pos = ICON_POSITIONS[index] || { x: 0, y: 0, z: 0, rotateY: 0 };
          
          // Explode outward as progress increases
          const explodeMultiplier = useTransform(progress, [0.5, 1], [1, 3]);
          const iconOpacity = useTransform(progress, [0.8, 1], [1, 0]);
          const iconScale = useTransform(progress, [0, 0.5, 1], [1, 1.1, 0.5]);
          
          return (
            <motion.div
              key={product.Id}
              className="absolute"
              style={{
                x: useTransform(explodeMultiplier, (m) => pos.x * m),
                y: useTransform(explodeMultiplier, (m) => pos.y * m),
                z: useTransform(explodeMultiplier, (m) => pos.z * m),
                rotateY: pos.rotateY,
                opacity: iconOpacity,
                scale: iconScale,
                transformStyle: "preserve-3d",
              }}
            >
              <div
                className={cn(
                  "w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center",
                  "bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl",
                  "border border-neutral-200 dark:border-neutral-800",
                  "shadow-xl hover:shadow-2xl transition-shadow duration-300"
                )}
                style={{
                  boxShadow: `0 10px 40px -10px ${product.accentColor}40`,
                }}
              >
                <product.Icon 
                  className="w-10 h-10 md:w-12 md:h-12" 
                  style={{ color: product.accentColor }} 
                />
              </div>
              
              {/* Label */}
              <motion.div 
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
                style={{ opacity: useTransform(progress, [0, 0.3], [1, 0]) }}
              >
                <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  {product.name}
                </span>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
};
