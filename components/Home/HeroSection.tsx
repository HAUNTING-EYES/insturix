"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import BackgroundEffects from "@/components/ui/BackgroundEffects";
import MouseGlow from "@/components/ui/MouseGlow";
import { useRef } from "react";

export default function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -150]);
  
  return (
    <div ref={containerRef} className="relative h-[calc(100vh-4rem)] w-full flex flex-col items-center justify-center overflow-hidden bg-neutral-950 text-neutral-50 selection:bg-indigo-500/30 selection:text-indigo-200">
      <BackgroundEffects />
      <MouseGlow />
      
      {/* Cinematic Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
      
      <motion.div style={{ y: y1, x: -100 }} className="absolute top-1/4 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
      <motion.div style={{ y: y2, x: 100 }} className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container relative z-10 px-4 sm:px-6 flex flex-col items-center text-center perspective-[1000px] pt-20">
        
        {/* Main Heading with Shimmer */}
        <motion.h1
          initial={{ opacity: 0, y: 30, rotateX: 10 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="text-5xl sm:text-7xl md:text-[84px] font-bold tracking-tight mb-6 max-w-5xl mx-auto"
        >
          The Operating System for <br className="hidden sm:block" />
          <span className="relative inline-block">
            <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-neutral-400">
              Content Production.
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent blur-xl opacity-50 animate-pulse" />
          </span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="text-lg sm:text-xl text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Insturix provides the essential infrastructure to build, protect, and scale your digital presence. 
          <span className="text-neutral-200"> AI-powered tools</span>, <span className="text-neutral-200">enterprise-grade protection</span>, and <span className="text-neutral-200">premium brand partnerships</span>.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center gap-4"
        >
          <Link href="/signup" className="w-full sm:w-auto group">
            <button className="relative w-full sm:w-auto px-8 py-4 bg-white text-black font-semibold rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95">
              <span className="relative z-10 flex items-center justify-center gap-2">
                Start Building
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-500 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
            </button>
          </Link>
          <Link href="#features" className="w-full sm:w-auto">
            <button className="w-full sm:w-auto px-8 py-4 bg-neutral-900 text-white border border-neutral-800 font-semibold rounded-full hover:bg-neutral-800 hover:border-neutral-700 transition-all hover:scale-105 active:scale-95">
              Know More
            </button>
          </Link>
        </motion.div>

        {/* Startup Logos */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="mt-16 pt-8 border-t border-neutral-900 w-full max-w-4xl"
        >
          <p className="text-xs text-neutral-600 uppercase tracking-widest mb-6 font-medium">Backed by industry leaders</p>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-16">
             <div className="group relative">
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Image
                  src="/icons/Google_for_Startups_logo.svg"
                  alt="Google for Startups"
                  width={140}
                  height={40}
                  className="relative h-8 w-auto object-contain invert opacity-50 group-hover:opacity-100 transition-opacity duration-300"
                />
             </div>
             <div className="group relative">
                <div className="absolute inset-0 bg-cyan-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Image
                  src="/icons/Microsoft-for-Startups-alpha.png"
                  alt="Microsoft for Startups"
                  width={160}
                  height={40}
                  className="relative h-8 w-auto object-contain invert opacity-50 group-hover:opacity-100 transition-opacity duration-300"
                />
             </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
