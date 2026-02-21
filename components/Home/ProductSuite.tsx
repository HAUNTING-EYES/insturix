"use client";

import { useRef, useState } from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, Wand2, BarChart3, Edit3, Music, Share2, Compass, CheckCircle } from "lucide-react";

const products = [
  {
    id: "editron",
    name: "Editron",
    tagline: "AI Video Editor",
    description: "Upload raw footage, let AI cut filler, add captions, and match your brand's pacing. Zero editing experience needed.",
    color: "#34D399",
    icon: Play,
    href: "/products/editron",
    visual: () => (
      <div className="w-full h-full flex flex-col gap-4 p-8 relative overflow-hidden bg-zinc-950/50">
        <div className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl relative overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-50" />
          <motion.div 
            animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center backdrop-blur-md"
          >
            <Play className="w-6 h-6 text-emerald-400 fill-emerald-400 ml-1" />
          </motion.div>
        </div>
        <div className="h-16 flex gap-2">
          <motion.div 
            initial={{ width: "0%" }} whileInView={{ width: "40%" }} transition={{ duration: 1 }}
            className="bg-emerald-500/20 rounded-lg border border-emerald-500/30 relative overflow-hidden"
          >
             <motion.div animate={{ x: ["-100%", "300%"] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 w-1/4 bg-white/10 skew-x-12" />
          </motion.div>
          <motion.div 
            initial={{ width: "0%" }} whileInView={{ width: "20%" }} transition={{ duration: 1, delay: 0.2 }}
            className="bg-emerald-500/10 rounded-lg border border-emerald-500/20" 
          />
          <motion.div 
            initial={{ width: "0%" }} whileInView={{ width: "40%" }} transition={{ duration: 1, delay: 0.4 }}
            className="bg-emerald-500/15 rounded-lg border border-emerald-500/30" 
          />
        </div>
      </div>
    ),
  },
  {
    id: "clickatron",
    name: "Clickatron",
    tagline: "AI Image Studio",
    description: "Generate scroll-stopping thumbnails and visuals. Sketch-to-edit, generative fill, and intelligent A/B testing built in.",
    color: "#818CF8",
    icon: Wand2,
    href: "/products/clickatron",
    visual: () => (
      <div className="w-full h-full p-8 flex flex-col items-center justify-center gap-6 relative bg-zinc-950/50">
        <div className="w-full h-48 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl relative overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-50" />
          <Wand2 className="w-12 h-12 text-indigo-400 absolute" />
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: "100%" }}
            transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="absolute bottom-0 left-0 w-full bg-indigo-500/10 border-t border-indigo-400/30 backdrop-blur-sm"
          />
        </div>
      </div>
    ),
  },
  {
    id: "alyzitron",
    name: "Alyzitron",
    tagline: "Content Analyzer",
    description: "Score your content before publishing. Deep analytics, compliance checks, and SEO optimization powered by brand-aware AI.",
    color: "#60A5FA",
    icon: BarChart3,
    href: "/products/alyzitron",
    visual: () => (
      <div className="w-full h-full p-8 flex flex-col gap-6 relative bg-zinc-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div 
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
              className="text-6xl font-black text-white"
            >
              94
            </motion.div>
            <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest border border-blue-500/30 px-3 py-1 rounded bg-blue-500/10">Score</div>
          </div>
          <p className="text-xs font-mono text-zinc-500">Analysis Complete</p>
        </div>
        <div className="flex-1 flex items-end gap-3 pb-2 w-full mt-4">
          {[35, 60, 45, 80, 55, 70, 95].map((h, i) => (
            <motion.div 
              key={i} 
              initial={{ height: 0 }}
              whileInView={{ height: `${h}%` }}
              transition={{ duration: 0.8, delay: i * 0.1, type: "spring" }}
              className="flex-1 rounded-t border-t-2" 
              style={{ backgroundColor: `rgba(96, 165, 250, 0.1)`, borderColor: 'rgba(96, 165, 250, 0.5)' }}
            />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "thinkforge",
    name: "ThinkForge",
    tagline: "AI Scriptwriter",
    description: "Turn ideas into brand-aligned scripts. Web search, tone matching, and structured markdown editing in one workspace.",
    color: "#F87171",
    icon: Edit3,
    href: "/products/thinkforge",
    visual: () => (
      <div className="w-full h-full p-8 flex flex-col gap-4 relative bg-zinc-950/50">
        <motion.div initial={{ width: 0 }} animate={{ width: "60%" }} className="h-4 bg-zinc-800 rounded" />
        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ delay: 0.1 }} className="h-4 bg-zinc-800/60 rounded" />
        <motion.div initial={{ width: 0 }} animate={{ width: "80%" }} transition={{ delay: 0.2 }} className="h-4 bg-zinc-800/60 rounded" />
        <div className="h-px w-full bg-zinc-800 my-4" />
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 p-6 relative overflow-hidden flex flex-col gap-3"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-400 to-transparent" />
          <div className="flex items-center gap-2 mb-2">
            <Edit3 className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Generating...</span>
          </div>
          <div className="h-3 w-3/4 bg-red-500/20 rounded" />
          <div className="h-3 w-5/6 bg-red-500/10 rounded" />
          <div className="h-3 w-1/2 bg-red-500/20 rounded" />
        </motion.div>
      </div>
    ),
  },
  {
    id: "musitron",
    name: "Musitron",
    tagline: "AI Music Generator",
    description: "Generate copyright-free background music that fits your mood and pacing. Prompt-based creation.",
    color: "#FBBF24",
    icon: Music,
    href: "/products/musitron",
    visual: () => (
      <div className="w-full h-full p-8 flex flex-col gap-8 justify-center relative bg-zinc-950/50">
        <div className="flex gap-4 items-center bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }}
            className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0"
          >
            <div className="w-3 h-3 bg-amber-400 rounded-full" />
          </motion.div>
          <div className="flex-1 h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
            <motion.div 
              initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full" 
            />
          </div>
          <span className="text-xs text-zinc-500 font-mono font-bold">2:34</span>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <svg className="w-full h-24" viewBox="0 0 200 60" preserveAspectRatio="none">
            {Array.from({length: 40}).map((_, i) => {
              const h = ((i * 17) % 35) + 10;
              const y = 30 - h/2;
              return (
                <motion.rect 
                  key={i} x={i * 5} y={y} width="3" height={h} rx="1.5" 
                  fill="rgba(251, 191, 36, 0.4)"
                  animate={{ height: [h, Math.max(10, h * 0.5), h], y: [y, 30 - Math.max(10, h * 0.5)/2, y] }}
                  transition={{ duration: 0.5 + Math.random(), repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }}
                />
              );
            })}
          </svg>
        </div>
      </div>
    ),
  },
  {
    id: "uploaderx",
    name: "UploaderX",
    tagline: "Multi-Platform Distribution",
    description: "Publish to YouTube, Instagram, TikTok, and Meta simultaneously. Schedule, optimize, and track.",
    color: "#2DD4BF",
    icon: Share2,
    href: "/products/uploaderx",
    visual: () => (
      <div className="w-full h-full p-8 flex flex-col gap-4 justify-center relative bg-zinc-950/50">
        {["YouTube", "Instagram", "TikTok"].map((platform, i) => (
          <motion.div 
            key={platform} 
            initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
            className="flex-1 max-h-[80px] rounded-xl bg-zinc-900 border border-zinc-800 flex items-center px-6 gap-4"
          >
            <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, delay: i }} className="w-2.5 h-2.5 rounded-full bg-teal-400" />
            <span className="text-sm font-semibold text-zinc-300">{platform}</span>
            <div className="ml-auto flex items-center gap-2 px-2 py-1 rounded bg-teal-500/10 border border-teal-500/20">
              <CheckCircle className="w-3 h-3 text-teal-400" />
              <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider">Ready</span>
            </div>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    id: "socialize",
    name: "Socialize",
    tagline: "Link-in-Bio Builder",
    description: "A smart link-in-bio that auto-updates with your latest content. Custom banners and AI styling.",
    color: "#FB923C",
    icon: Compass,
    href: "/products/socialize",
    visual: () => (
      <div className="w-full h-full p-8 flex flex-col items-center justify-center relative bg-zinc-950/50">
        <div className="w-64 border border-zinc-800 bg-zinc-900 rounded-[40px] p-2 pb-6 relative shadow-2xl overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-zinc-950 rounded-b-2xl border-x border-b border-zinc-800 z-10" />
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}
            className="w-full h-32 rounded-[32px] rounded-b-none bg-gradient-to-b from-orange-500/20 to-zinc-900 mb-10 flex justify-center relative"
          >
             <motion.div 
               initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.3 }}
               className="absolute -bottom-8 w-16 h-16 rounded-full bg-zinc-800 border-4 border-zinc-900 flex items-center justify-center shadow-lg"
             >
               <span className="text-xl font-bold text-orange-400">@</span>
             </motion.div>
          </motion.div>
          <div className="px-4 flex flex-col gap-3">
            {[1,2,3].map(i => (
              <motion.div 
                key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.1 }}
                className="h-10 w-full rounded-xl bg-zinc-950 border border-zinc-800 flex items-center px-4"
              >
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500/40 w-1/3" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    ),
  }
];

export default function ProductSuite() {
  const [activeItem, setActiveItem] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const segment = 1 / products.length;
    let newIndex = Math.floor(latest / segment);
    if (newIndex >= products.length) newIndex = products.length - 1;
    if (newIndex < 0) newIndex = 0;
    setActiveItem(newIndex);
  });

  return (
    <section id="suite" className="bg-zinc-950 relative" ref={containerRef}>
      <div style={{ height: `${products.length * 100}vh` }}>
        <div className="sticky top-0 h-screen w-full flex flex-col justify-center overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 flex flex-col h-full py-16 md:py-20">
            
            <div className="mb-8 md:mb-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-4">
                The Suite
              </p>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
                Seven tools.{" "}
                <span className="text-zinc-500">One ecosystem.</span>
              </h2>
            </div>

            <div className="flex items-center gap-3 mb-8">
              {products.map((_, i) => (
                <div
                  key={i}
                  className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${
                    i <= activeItem ? "bg-white" : "bg-zinc-800"
                  }`}
                />
              ))}
              <span className="text-xs text-zinc-500 font-mono tabular-nums ml-2">
                {String(activeItem + 1).padStart(2, "0")}/{String(products.length).padStart(2, "0")}
              </span>
            </div>
            
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
               
              <div className="lg:col-span-4 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeItem}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ 
                          backgroundColor: `${products[activeItem].color}15`,
                          border: `1px solid ${products[activeItem].color}30`
                        }}
                      >
                        {(() => {
                          const Icon = products[activeItem].icon;
                          return <Icon className="w-5 h-5" style={{ color: products[activeItem].color }} />;
                        })()}
                      </div>
                      <div>
                        <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                          {products[activeItem].name}
                        </h3>
                        <p className="text-xs font-semibold uppercase tracking-[0.15em] mt-1" style={{ color: products[activeItem].color }}>
                          {products[activeItem].tagline}
                        </p>
                      </div>
                    </div>
                    
                    <p className="text-lg text-zinc-400 leading-relaxed mb-8 max-w-md">
                      {products[activeItem].description}
                    </p>
                    
                    <Link href={products[activeItem].href}>
                      <button 
                        className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
                        style={{ color: products[activeItem].color }}
                      >
                        Explore {products[activeItem].name}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </Link>
                  </motion.div>
                </AnimatePresence>

                <div className="mt-12 space-y-1">
                  {products.map((product, index) => {
                    const isActive = index === activeItem;
                    return (
                      <button 
                        key={product.id}
                        onClick={() => setActiveItem(index)}
                        className={`block text-left text-sm font-medium transition-all duration-300 ${
                          isActive 
                            ? "text-white opacity-100" 
                            : "text-zinc-500 opacity-50 hover:opacity-80"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")} — {product.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Immersive App Visual */}
              <div className="hidden lg:flex lg:col-span-8 flex-col justify-center max-h-[600px] h-full">
                <div className="w-full h-full rounded-2xl bg-zinc-900/50 border border-zinc-800 relative overflow-hidden flex flex-col">
                  {/* Chrome top bar */}
                  <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-2 shrink-0">
                     <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    </div>
                  </div>
                  {/* Dynamic Visual Area */}
                  <div className="flex-1 relative overflow-hidden bg-zinc-950">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeItem}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 w-full h-full"
                      >
                        {products[activeItem].visual()}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
               
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
