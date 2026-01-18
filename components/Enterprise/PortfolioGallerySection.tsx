"use client";

import React, { useRef, useState, useMemo } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { portfolioProjects, Project } from "@/data/creatives-portfolio";
import { PortfolioCard } from "@/components/creatives/PortfolioCard";
import { PortfolioVideoModal } from "@/components/creatives/PortfolioVideoModal";
import { cn } from "@/lib/utils";

// Utility to chunk array
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );
};

export default function PortfolioGallerySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // visibleIndex tracks the currently displayed row animation state
  const [visibleIndex, setVisibleIndex] = useState(0);
  
  // targetIndex tracks where the scroll wants us to be
  const [targetIndex, setTargetIndex] = useState(0);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Split projects: Mobile = 1 per row (stacked), Desktop = 3 per row (grid)
  const projectRows = useMemo(() => {
    return chunkArray(portfolioProjects, isMobile ? 1 : 3);
  }, [isMobile]);
  
  const totalRows = projectRows.length;
  
  // Height: Give enough scroll room to go through all cards
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Calculate target index based on raw scroll position
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    // Desktop: Spread triggers out (1.1x) to require more scroll effort
    // Mobile: 1.0x to map 1:1 with the increased scroll distance
    const multiplier = isMobile ? 1.0 : 1.1;
    const rawIndex = Math.floor(latest * totalRows * multiplier);
    const newTarget = Math.min(totalRows - 1, Math.max(0, rawIndex));
    if (newTarget !== targetIndex) {
        setTargetIndex(newTarget);
    }
  });

  // Smooth Step Effect: Slowly increment/decrement visibleIndex towards targetIndex
  // This ensures no layers are skipped even on fast scrolls
  React.useEffect(() => {
    if (visibleIndex === targetIndex) return;

    const timer = setTimeout(() => {
       setVisibleIndex((current) => {
          if (current < targetIndex) return current + 1;
          if (current > targetIndex) return current - 1;
          return current;
       });
    }, 200); // 200ms delay to give a more deliberate feel on mobile

    return () => clearTimeout(timer);
  }, [visibleIndex, targetIndex]);

  return (
    <section 
      ref={containerRef} 
      className="relative bg-neutral-950 w-full z-10"
      // Height: 120vh per card on mobile (very high resistance)
      // Desktop: 150vh per card (premium feel)
      style={{ height: `${totalRows * (isMobile ? 120 : 150) + 100}vh` }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col items-center justify-center">
        
        {/* Background Ambience */}
        <div className="absolute inset-0 bg-neutral-950 pointer-events-none">
           <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 blur-[120px] rounded-full" />
           <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 blur-[120px] rounded-full" />
        </div>

        <div className="relative z-10 w-full max-w-7xl flex flex-col h-full p-4 md:p-10 pt-24 md:pt-32">
            
            {/* Header - Stays at top, always visible */}
            <div 
               className="text-center mb-4 md:mb-8 flex-shrink-0 relative z-20"
            >
                <h2 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-500 mb-2 md:mb-4">
                  Our Work
                </h2>
                <p className="text-neutral-400 max-w-xl mx-auto text-sm md:text-base">
                  Scroll to explore selected projects from global brands.
                </p>
            </div>

            {/* Stack Container */}
            <div className="relative w-full flex-grow flex items-center justify-center">
              {projectRows.map((row, rowIndex) => {
                return (
                  <StackedRow 
                    key={rowIndex} 
                    row={row} 
                    currentIndex={visibleIndex}
                    index={rowIndex}
                    isMobile={isMobile}
                    onOpen={setSelectedProject}
                  />
                );
              })}
            </div>
        </div>
      </div>

      <PortfolioVideoModal 
        project={selectedProject} 
        isOpen={!!selectedProject} 
        onClose={() => setSelectedProject(null)} 
      />
    </section>
  );
}

// Sub-component for Stacking Logic
function StackedRow({ 
  row, 
  currentIndex,
  index,
  isMobile,
  onOpen
}: { 
  row: Project[], 
  currentIndex: number,
  index: number,
  isMobile: boolean,
  onOpen: (p: Project) => void
}) {
  const zIndex = index + 10;
  
  // Animation Variants
  const variants = {
    hiddenBelow: { 
        opacity: 0, 
        y: 100, 
        scale: 0.9,
        transition: { duration: 0.5 }
    },
    visible: { 
        opacity: 1, 
        y: 0, 
        scale: 1,
        transition: { duration: 0.5 }
    },
    hiddenAbove: {
        opacity: 0,
        y: -100,
        scale: 1.1,
        transition: { duration: 0.5 }
    }
  };

  const status = index < currentIndex ? "hiddenAbove" : index === currentIndex ? "visible" : "hiddenBelow";

  return (
    <motion.div
        initial="hiddenBelow"
        animate={status}
        variants={variants}
        style={{ zIndex, willChange: "transform, opacity" }}
        className={cn(
            "absolute w-full px-2 md:px-0",
            "flex items-center justify-center"
        )}
    >
        <div className={cn(
            "flex flex-wrap justify-center gap-4 w-full max-w-6xl"
        )}>
            {row.map((project) => (
                <div 
                  key={project.id} 
                  className={cn(
                    "w-full",
                    !isMobile && "md:w-[calc(33.333%-1rem)]"
                  )}
                >
                  <PortfolioCard project={project} onOpen={onOpen} />
                </div>
            ))}
        </div>
    </motion.div>
  );
}
