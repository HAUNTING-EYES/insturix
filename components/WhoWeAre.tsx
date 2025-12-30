"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";
import { companyData } from "@/components/data/Company-Data";
import Spotlight from "@/components/ui/Spotlight";
import DotGrid from "@/components/DotGrid";

export default function WhoWeAre() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Smooth progress
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Target Board Animations (Synced with Card Transitions)
  const bullseyeScale = useTransform(smoothProgress, [0, 0.2], [0, 1]);
  const bullseyeOpacity = useTransform(smoothProgress, [0, 0.1], [0, 1]);
  
  const innerRingProgress = useTransform(smoothProgress, [0.3, 0.5], [0, 1]);
  const outerRingProgress = useTransform(smoothProgress, [0.6, 0.8], [0, 1]);

  // Card Animations (Stacking Effect)
  // Card 1 (Mission): Base layer, scales down slightly as Card 2 enters
  const card1Scale = useTransform(smoothProgress, [0.3, 0.5], [1, 0.9]);
  const card1Opacity = useTransform(smoothProgress, [0.3, 0.5], [1, 0.5]);

  // Card 2 (Vision): Enters from bottom, covers Card 1
  const card2Y = useTransform(smoothProgress, [0.3, 0.5], ["100%", "0%"]);
  const card2Opacity = useTransform(smoothProgress, [0.3, 0.4], [0, 1]);
  const card2Scale = useTransform(smoothProgress, [0.6, 0.8], [1, 0.9]); // Scales down for Card 3

  // Card 3 (Story): Enters from bottom, covers Card 2
  const card3Y = useTransform(smoothProgress, [0.6, 0.8], ["100%", "0%"]);
  const card3Opacity = useTransform(smoothProgress, [0.6, 0.7], [0, 1]);

  return (
    <section ref={containerRef} className="relative h-[300vh] bg-neutral-950 text-neutral-50">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
          <DotGrid 
            baseColor="#404040" 
            activeColor="#737373" 
            dotSize={2} 
            gap={24} 
            proximity={100} 
            shockRadius={150}
          />
        </div>

        <div className="container mx-auto px-4 sm:px-6 h-full flex flex-col lg:flex-row relative z-10">
          
          {/* Left: Target Board */}
          <div className="hidden lg:flex lg:w-1/2 h-full items-center justify-center">
            <div className="relative w-[400px] h-[400px]">
              {/* Base Structure */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                <line x1="50" y1="0" x2="50" y2="100" stroke="#262626" strokeWidth="0.5" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="#262626" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="45" fill="none" stroke="#262626" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="30" fill="none" stroke="#262626" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="15" fill="none" stroke="#262626" strokeWidth="0.5" />
              </svg>

              {/* Animated Elements */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <motion.circle 
                  cx="50" cy="50" r="45" 
                  fill="none" 
                  stroke="#ffffff" 
                  strokeWidth="1.5"
                  style={{ pathLength: outerRingProgress }}
                  strokeDasharray="1 1"
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                />
                <motion.circle 
                  cx="50" cy="50" r="30" 
                  fill="none" 
                  stroke="#d4d4d4" 
                  strokeWidth="2"
                  style={{ pathLength: innerRingProgress }}
                  strokeDasharray="1 1"
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                />
              </svg>

              {/* Center Bullseye */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div 
                  style={{ scale: bullseyeScale, opacity: bullseyeOpacity }}
                  className="w-[30px] h-[30px] bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]"
                />
              </div>
            </div>
          </div>

          {/* Right: Stacking Cards */}
          <div className="w-full lg:w-1/2 h-full flex items-center justify-center relative">
            
            {/* Mission Card (Base) */}
            <motion.div 
              style={{ scale: card1Scale, opacity: card1Opacity }}
              className="absolute w-full max-w-lg"
            >
              <Spotlight 
                className="rounded-3xl p-8 border-neutral-800 bg-neutral-900/90 backdrop-blur-xl shadow-2xl"
                spotlightColor="rgba(255, 255, 255, 0.05)"
              >
                <h3 className="text-3xl sm:text-4xl font-bold mb-6 text-white">Our Mission</h3>
                <p className="text-lg sm:text-xl text-neutral-300 leading-relaxed">{companyData.mission}</p>
              </Spotlight>
            </motion.div>

            {/* Vision Card (Overlay 1) */}
            <motion.div 
              style={{ y: card2Y, opacity: card2Opacity, scale: card2Scale }}
              className="absolute w-full max-w-lg"
            >
              <Spotlight 
                className="rounded-3xl p-8 border-neutral-800 bg-neutral-900/90 backdrop-blur-xl shadow-2xl"
                spotlightColor="rgba(255, 255, 255, 0.05)"
              >
                <h3 className="text-3xl sm:text-4xl font-bold mb-6 text-white">Our Vision</h3>
                <p className="text-lg sm:text-xl text-neutral-300 leading-relaxed">{companyData.vision}</p>
              </Spotlight>
            </motion.div>

            {/* Story Card (Overlay 2) */}
            <motion.div 
              style={{ y: card3Y, opacity: card3Opacity }}
              className="absolute w-full max-w-lg"
            >
              <Spotlight 
                className="rounded-3xl p-8 border-neutral-800 bg-neutral-900/90 backdrop-blur-xl shadow-2xl"
                spotlightColor="rgba(255, 255, 255, 0.05)"
              >
                <h3 className="text-3xl sm:text-4xl font-bold mb-6 text-white">The Story</h3>
                <p className="text-lg sm:text-xl text-neutral-300 leading-relaxed">{companyData.story}</p>
              </Spotlight>
            </motion.div>

          </div>
        </div>
      </div>
    </section>
  );
}
