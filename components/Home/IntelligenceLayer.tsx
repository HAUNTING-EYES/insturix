"use client";

import { motion } from "framer-motion";
import { Play, Wand2, BarChart3, Edit3, Music, Share2, Compass, Database } from "lucide-react";
import { ScannerDivider } from "@/components/ui/ScannerDivider";

export default function IntelligenceLayer() {
  const services = [
    { name: "Editron", icon: Play, color: "#34D399", angle: 0 },
    { name: "Clickatron", icon: Wand2, color: "#818CF8", angle: 51 },
    { name: "Alyzitron", icon: BarChart3, color: "#60A5FA", angle: 103 },
    { name: "ThinkForge", icon: Edit3, color: "#F87171", angle: 154 },
    { name: "Musitron", icon: Music, color: "#FBBF24", angle: 206 },
    { name: "UploaderX", icon: Share2, color: "#2DD4BF", angle: 257 },
    { name: "Socialize", icon: Compass, color: "#FB923C", angle: 309 },
  ];

  return (
    <section className="py-24 bg-zinc-950 relative">
      <div className="container mx-auto px-4 sm:px-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left — Text */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-zinc-500 font-semibold text-sm tracking-[0.15em] uppercase mb-4">
              The Intelligence Layer
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6 leading-tight">
              Every tool shares one brain.
            </h2>
            <p className="text-lg text-zinc-400 leading-relaxed mb-8">
              The Brand Vault is a persistent memory layer that stores your tone, pacing, color grades, fonts, and visual preferences. Every service in Insturix queries it automatically — so your output is always on-brand, without repeating yourself.
            </p>

            <div className="space-y-4">
              {[
                { label: "Brand Vault", desc: "Your tone, visuals, and style stored securely." },
                { label: "Universal Agent", desc: "One command orchestrates multiple tools at once." },
                { label: "Self-Correcting AI", desc: "Generations are checked against your guidelines before delivery." },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="flex gap-4 items-start"
                >
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mt-0.5">
                    <span className="text-zinc-400 text-sm font-bold">{i + 1}</span>
                  </div>
                  <div>
                    <h4 className="text-zinc-100 font-semibold mb-0.5">{item.label}</h4>
                    <p className="text-sm text-zinc-500">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right — Diagram */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative"
          >
            <div className="w-full aspect-square max-w-[480px] mx-auto relative mt-10 lg:mt-0">
              {/* Central hub */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="w-28 h-28 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col items-center justify-center gap-2">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl pointer-events-none" />
                  <Database className="w-8 h-8 text-zinc-300" />
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Brand Vault</span>
                </div>
              </div>
              
              {/* Service nodes arranged in a circle */}
              {services.map((service) => {
                const radius = 42; // percentage from center
                const rad = (service.angle * Math.PI) / 180;
                const x = 50 + radius * Math.cos(rad);
                const y = 50 + radius * Math.sin(rad);
                const Icon = service.icon;
                
                return (
                  <div key={service.name} className="absolute z-10" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
                    <div className="flex flex-col items-center gap-1.5">
                      <div 
                        className="w-12 h-12 rounded-xl border flex items-center justify-center shadow-lg bg-zinc-900 relative overflow-hidden"
                        style={{ borderColor: `${service.color}30` }}
                      >
                        <div className="absolute inset-0 opacity-10" style={{ backgroundColor: service.color }} />
                        <Icon className="w-5 h-5 relative z-10" style={{ color: service.color }} />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-400 whitespace-nowrap">{service.name}</span>
                    </div>
                  </div>
                );
              })}

              {/* Connecting Animated SVG lines */}
              <svg className="absolute inset-0 w-full h-full z-0" viewBox="0 0 100 100">
                <defs>
                  {/* Create a gradient for the pulse effect to look like flying data */}
                  <linearGradient id="data-pulse" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                {services.map((service, i) => {
                  const radius = 35; // End the line slightly before the node
                  const startRadius = 12; // Start the line slightly outside the center node
                  const rad = (service.angle * Math.PI) / 180;
                  const x1 = 50 + startRadius * Math.cos(rad);
                  const y1 = 50 + startRadius * Math.sin(rad);
                  const x2 = 50 + radius * Math.cos(rad);
                  const y2 = 50 + radius * Math.sin(rad);
                  
                  return (
                    <g key={service.name}>
                      {/* Base subtle track line */}
                      <line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke="rgb(63, 63, 70)"
                        strokeWidth="0.5"
                        strokeDasharray="2 4"
                      />
                      {/* Animated traveling data packet */}
                      <motion.line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={service.color}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        initial={{ pathLength: 0, pathOffset: 0, opacity: 0 }}
                        animate={{ 
                          pathLength: [0, 0.2, 0],
                          pathOffset: [0, 0.8, 1],
                          opacity: [0, 1, 0]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "linear",
                          delay: (i * 0.3) % 2 
                        }}
                        style={{ filter: `drop-shadow(0 0 4px ${service.color})` }}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </motion.div>

        </div>
      </div>

      {/* Section divider */}
      <div className="mt-24">
        <ScannerDivider />
      </div>
    </section>
  );
}
