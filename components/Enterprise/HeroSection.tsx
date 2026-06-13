"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import HeroBackground3D from "./HeroBackground3D";

export default function EnterpriseHeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  return (
    <div ref={containerRef} className="relative h-[calc(100vh-4rem)] w-full flex flex-col items-center justify-center overflow-hidden bg-neutral-950 text-neutral-50 selection:bg-[#ff5722]/30 selection:text-[#ff5722]">
      <HeroBackground3D />
      
      <div className="container relative z-10 px-4 sm:px-6 flex flex-col items-center text-center perspective-[1000px] pt-20">
        
        {/* Testimonial Quote */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0 }}
          className="mb-8 max-w-3xl mx-auto"
        >
          <p className="text-lg sm:text-[18px] text-neutral-400 italic mb-2">
            "Insturix helped our team move from scattered content workflows to a reliable production system."
          </p>
          <p className="text-sm text-neutral-500">
            — Alex Rivera
          </p>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 30, rotateX: 10 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="text-[44px] sm:text-7xl md:text-[84px] font-bold tracking-tight mb-6 max-w-5xl mx-auto"
        >
          The Operating System for <br className="hidden sm:block" />
          <span className="relative inline-block">
            <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-neutral-400">
              Business Content.
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ff5722]/20 to-transparent blur-xl opacity-50 animate-pulse" />
          </span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="text-lg sm:text-[18px] text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Scale your brand's digital presence with Insturix.
          <span className="text-neutral-200"> AI-powered production</span>, <span className="text-neutral-200">brand safety & rights management</span>, and <span className="text-neutral-200">data-driven insights</span>.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center gap-4"
        >
          <Link href="/contact-sales" className="w-full sm:w-auto group">
            <button className="relative w-full sm:w-auto px-8 py-4 bg-white text-black font-semibold rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95">
              <span className="relative z-10 flex items-center justify-center gap-2">
                Contact Sales
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-[#ff5722] via-orange-500 to-[#ff5722] opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
            </button>
          </Link>
          <Link href="#features" className="w-full sm:w-auto">
            <button className="w-full sm:w-auto px-8 py-4 bg-neutral-900 text-white border border-neutral-800 font-semibold rounded-full hover:bg-neutral-800 hover:border-neutral-700 transition-all hover:scale-105 active:scale-95">
              Learn More
            </button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

