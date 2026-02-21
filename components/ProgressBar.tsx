"use client";

import { motion, useScroll, useSpring } from "framer-motion";

export default function ProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[2px] origin-left z-[70]"
      style={{
        scaleX,
        background:
          "linear-gradient(to right, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 1))",
      }}
    />
  );
} 