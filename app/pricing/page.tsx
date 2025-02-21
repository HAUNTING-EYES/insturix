"use client";

import React, { useState } from "react";
import Green from "@/components/pr/Green";
import Blue from "@/components/pr/Blue";
import Purple from "@/components/pr/Purple";
import Navbar from "@/components/Navbar";
import Red from "@/components/pr/Red";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

export default function Pricing() {
  const [cursorColor, setCursorColor] = useState("rgba(255, 255, 255, 0.15)");
  const [isCardHovered, setIsCardHovered] = useState(false);

  const handleCardHover = (color: string) => {
    setCursorColor(color);
    setIsCardHovered(true);
  };

  const handleCardLeave = () => {
    setCursorColor("rgba(255, 255, 255, 0.15)");
    setIsCardHovered(false);
  };

  return (
    <div className="relative">
      <CursorEffect variant="glow" color={cursorColor} size={500} blur={80} />
      <Navbar />
      {/* Background pattern */}
      <div className="fixed inset-0 -z-20">
        <div
          className={`absolute inset-0 transition-all duration-500 ease-in-out ${
            isCardHovered ? "scale-105" : "scale-100"
          }`}
        >
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
      </div>
      <div className="container mx-auto px-4 py-10 text-center pt-30">
        <h2 className="text-6xl font-bold text-center primtext mb-4">
          Subscription Plans
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div
            className="transform hover:scale-105 transition-transform duration-300"
            onMouseEnter={() => handleCardHover("rgba(34, 197, 94, 0.3)")} // green
            onMouseLeave={handleCardLeave}
          >
            <Green />
          </div>
          <div
            className="transform hover:scale-105 transition-transform duration-300"
            onMouseEnter={() => handleCardHover("rgba(59, 130, 246, 0.3)")} // blue
            onMouseLeave={handleCardLeave}
          >
            <Blue />
          </div>
          <div
            className="transform hover:scale-105 transition-transform duration-300"
            onMouseEnter={() => handleCardHover("rgba(168, 85, 247, 0.3)")} // purple
            onMouseLeave={handleCardLeave}
          >
            <Purple />
          </div>
          <div
            className="transform hover:scale-105 transition-transform duration-300"
            onMouseEnter={() => handleCardHover("rgba(239, 68, 68, 0.3)")} // red
            onMouseLeave={handleCardLeave}
          >
            <Red />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
