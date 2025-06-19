"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import { UpgradePageContent } from "@/components/upgrade-plan/UpgradePageContent";
import { PLAN_THEME } from "@/lib/themeConfig";

export default function UpgradePage() {
  const searchParams = useSearchParams();
  const [cursorColor, setCursorColor] = useState<string>(PLAN_THEME.glow.color);

  const handleCardHover = (color: string) => {
    setCursorColor(color);
  };

  const handleCardLeave = () => {
    setCursorColor(PLAN_THEME.glow.color);
  };

  const initialPlan = searchParams.get('plan') || undefined;

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <CursorEffect variant="glow" color={cursorColor} size={500} blur={80} />
      </div>
      
      {/* Background pattern */}
      <div className="fixed inset-0 -z-20">
        <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.05]">
          <svg className="w-full h-full">
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 .5H32M.5 0V32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </div>

      <Navbar />

      <div className="container mx-auto px-4 pt-24 pb-20">
        <div
          onMouseEnter={() => handleCardHover(PLAN_THEME.glow.hoverColor)}
          onMouseLeave={handleCardLeave}
        >
          <UpgradePageContent
            mode="page"
            initialPlan={initialPlan}
            showNavigation={true}
          />
        </div>
      </div>

      <Footer />
    </div>
  );
}