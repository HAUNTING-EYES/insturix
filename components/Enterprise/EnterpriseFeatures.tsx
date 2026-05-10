"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Globe, Video, BarChart3, Music, Shield, Zap, Users, BrainCircuit, CheckCircle2, Layers, ChartNoAxesColumnIncreasing } from "lucide-react";

function AiGeneration() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setScale((prev) => (prev === 1 ? 1.2 : 1));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="relative">
        <div className="absolute inset-0 bg-[#ff5722]/20 blur-2xl rounded-full" />
        <motion.span
          className="relative text-[110px] md:text-8xl text-white font-bold tracking-tighter"
          animate={{ scale }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          AI
        </motion.span>
      </div>
    </div>
  );
}

function AssetGrid() {
  const [layout, setLayout] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLayout((prev) => (prev + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const layouts = ["grid-cols-2", "grid-cols-3", "grid-cols-1"];

  return (
    <div className="h-full flex items-center justify-center">
      <motion.div
        className={`grid ${layouts[layout]} gap-1.5 w-full max-w-[140px] h-full`}
        layout
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="bg-zinc-700/50 rounded-md h-8 w-full border border-zinc-600/50"
            layout
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </motion.div>
    </div>
  );
}

function AnalyticsLoader() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoading(true);
      setTimeout(() => setLoading(false), 500);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="h-10 flex items-center justify-center overflow-hidden relative w-full">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loader"
              className="h-8 w-24 bg-[#ff5722]/20 rounded"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              exit={{ opacity: 0, y: -20, position: 'absolute' }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          ) : (
            <motion.span
              key="text"
              initial={{ y: 20, opacity: 0, filter: "blur(5px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              className="text-[32px] md:text-[44px] font-sans font-bold text-white tracking-tight"
            >
              10x
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <span className="text-sm text-zinc-400">Production Velocity</span>
      <div className="w-full max-w-[120px] h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#ff5722] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: loading ? 0 : "100%" }}
          transition={{ type: "spring", stiffness: 100, damping: 15, mass: 1 }}
        />
      </div>
    </div>
  );
}

function SecurityBadges() {
  const [shields, setShields] = useState([
    { id: 1, active: false },
    { id: 2, active: false },
    { id: 3, active: false }
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setShields(prev => {
        const nextIndex = prev.findIndex(s => !s.active);
        if (nextIndex === -1) {
          return prev.map(() => ({ id: Math.random(), active: false }));
        }
        return prev.map((s, i) => i === nextIndex ? { ...s, active: true } : s);
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-full gap-3">
      {shields.map((shield) => (
        <motion.div
          key={shield.id}
          className={`w-14 h-14 rounded-xl flex items-center justify-center border transition-colors duration-300 ${
            shield.active ? 'bg-[#ff5722]/20 border-[#ff5722]/50' : 'bg-zinc-800/50 border-zinc-700/50'
          }`}
          animate={{ scale: shield.active ? 1.05 : 1 }}
          transition={{ duration: 0.3 }}
        >
          <Lock className={`w-6 h-6 ${shield.active ? 'text-[#ff5722]' : 'text-zinc-600'}`} />
        </motion.div>
      ))}
    </div>
  );
}

function GlobalMonitor() {
  const [pulses] = useState([0, 1, 2, 3]);

  return (
    <div className="flex items-center justify-center h-full relative">
      <div className="relative z-10 bg-zinc-950 p-2 rounded-full border border-[#ff5722]/30">
        <Globe className="w-12 h-12 text-[#ff5722]" />
      </div>
      {pulses.map((pulse) => (
        <motion.div
          key={pulse}
          className="absolute border border-[#ff5722]/20 rounded-full"
          initial={{ width: "3rem", height: "3rem", opacity: 0.8 }}
          animate={{ width: "12rem", height: "12rem", opacity: 0 }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: pulse * 0.75,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
}

export default function EnterpriseFeatures() {
  return (
    <section id="features" className="py-24 bg-neutral-950 text-neutral-50 border-t border-neutral-900">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-left"
        >
          <p className="text-[#ff5722] text-sm uppercase tracking-widest font-medium mb-4">
            Business Features
          </p>
          <h2 className="text-[32px] sm:text-[44px] font-bold tracking-tight mb-4">
            Everything needed to scale.
          </h2>
          <p className="text-neutral-400 text-lg max-w-2xl">
            A comprehensive suite of tools designed for high-velocity content teams.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-[220px]">
          
          {/* 1. AI Generation (Editron) - Tall (2x2) */}
          <motion.div
            className="md:col-span-2 md:row-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.01, backgroundColor: "rgba(39, 39, 42, 0.8)" }}
          >
            <div className="flex-1 flex items-center justify-center">
              <AiGeneration />
            </div>
            <div className="mt-6 relative z-10">
              <h3 className="text-[18px] text-white font-semibold flex items-center gap-2 mb-2">
                <Video className="w-5 h-5 text-[#ff5722]" />
                AI Video Production
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Editron automates your video pipeline. Generate shorts, localized versions, and social cuts instantly.
              </p>
            </div>
          </motion.div>

          {/* 2. Asset Grid (Generation) - Standard (2x1) */}
          <motion.div
            className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 1.01, backgroundColor: "rgba(39, 39, 42, 0.8)" }}
          >
            <div className="flex-1">
              <AssetGrid />
            </div>
            <div className="mt-4">
              <h3 className="text-lg text-white font-semibold flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-orange-400" />
                Asset Generation
              </h3>
              <p className="text-zinc-400 text-sm">
              Create endless on-brand thumbnails and video variants in seconds.
              </p>
            </div>
          </motion.div>

          {/* 3. Global Monitor (Shield) - Tall (2x2) */}
          <motion.div
            className="md:col-span-2 md:row-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.01, backgroundColor: "rgba(39, 39, 42, 0.8)" }}
          >
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-full h-full">
                <GlobalMonitor />
              </div>
            </div>
            <div className="mt-auto relative z-20 bg-zinc-900/80 backdrop-blur-md rounded-2xl p-4 border border-zinc-800">
              <h3 className="text-[18px] text-white flex items-center gap-2 font-semibold mb-1">
                <ChartNoAxesColumnIncreasing className="w-5 h-5 text-[#ff5722]" />
                Global Trends
              </h3>
              <p className="text-zinc-400 text-sm">
              Stay ahead of what’s trending worldwide with ThinkForge ideation—so your next concept is already aligned with where the culture is going.
              </p>
            </div>
          </motion.div>

          {/* 4. Analytics (Alyzitron) - Standard (2x1) */}
          <motion.div
            className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.01, backgroundColor: "rgba(39, 39, 42, 0.8)" }}
          >
            <div className="flex-1">
              <AnalyticsLoader />
            </div>
            <div className="mt-4">
              <h3 className="text-lg text-white font-semibold flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-orange-400" />
                Market Intelligence
              </h3>
              <p className="text-zinc-400 text-sm">
                Predictive analytics for content ROI.
              </p>
            </div>
          </motion.div>

          {/* 5. Enterprise Security - Wide (3x1) */}
          <motion.div
            className="md:col-span-3 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.01, backgroundColor: "rgba(39, 39, 42, 0.8)" }}
          >
            <div className="flex-1">
              <SecurityBadges />
            </div>
            <div className="mt-4">
              <h3 className="text-[18px] text-white flex items-center gap-2 font-semibold mb-2">
                <Lock className="w-5 h-5 text-[#ff5722]" />
                Business Security
              </h3>
              <p className="text-zinc-400 text-sm">
                Bank-grade encryption and zero data retention policies.
              </p>
            </div>
          </motion.div>

          {/* 6. Collaboration - Wide (3x1) */}
          <motion.div
            className="md:col-span-3 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.01, backgroundColor: "rgba(39, 39, 42, 0.8)" }}
          >
            <div className="flex-1 flex items-center justify-center">
              <div className="relative">
                 <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full opacity-50" />
                 <Users className="w-16 h-16 text-orange-200 relative z-10" />
                 <motion.div 
                    className="absolute -top-4 -right-4 w-8 h-8 bg-[#ff5722] rounded-full border-2 border-zinc-900 flex items-center justify-center text-[11px] font-bold"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                 >
                    +5
                 </motion.div>
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-[18px] text-white font-semibold flex items-center gap-2 mb-2">
                <BrainCircuit className="w-5 h-5 text-orange-400" />
                Team Collaboration
              </h3>
              <p className="text-zinc-400 text-sm">
                Team workspace for seamless ideation, approval workflows, and asset management.
              </p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
