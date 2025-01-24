"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface HoverCardProps {
  children: React.ReactNode;
  className?: string;
}

export function HoverCard({ children, className = "" }: HoverCardProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isTouch, setIsTouch] = useState(true); // Default to touch for SSR

  useEffect(() => {
    // Check if device supports hover
    const hasHover = window.matchMedia("(hover: hover)").matches;
    setIsTouch(!hasHover);

    // Double-check touch capability
    const touchCheck = () => {
      setIsTouch(true);
      window.removeEventListener("touchstart", touchCheck);
    };
    window.addEventListener("touchstart", touchCheck);

    return () => window.removeEventListener("touchstart", touchCheck);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isTouch) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [isTouch]
  );

  const variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <motion.div
      className={`section-card relative overflow-hidden ${className}`}
      onMouseMove={!isTouch ? handleMouseMove : undefined}
      onMouseEnter={!isTouch ? () => setIsHovered(true) : undefined}
      onMouseLeave={!isTouch ? () => setIsHovered(false) : undefined}
      whileHover={!isTouch ? { scale: 1.02 } : undefined}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <AnimatePresence>
        {isHovered && !isTouch && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{
              background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, 
                                rgb(var(--shimmer-color)/var(--shimmer-opacity)), 
                                transparent 40%)`,
            }}
          />
        )}
      </AnimatePresence>
      {children}
    </motion.div>
  );
}
