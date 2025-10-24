"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import CountUp from "@/components/CountUp";

const stats = [
  { label: "Attendees", to: 800, suffix: "+" },
  { label: "Digital Reach", to: 50, suffix: "K+" },
  { label: "Creator Collabs", to: 200, suffix: "+" },
] as const;

export default function AboutICS25() {
  const [videoError, setVideoError] = useState(false);

  return (
    <div className="grid md:grid-cols-2 gap-8 items-center">
      <div>
        {!videoError ? (
          <video
            src="/ics25/ics25.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover rounded-2xl"
            aria-label="ICS'25 promotional video"
            onError={() => setVideoError(true)}
          />
        ) : (
          <div className="aspect-[16/10] rounded-2xl border border-white/60 dark:border-white/10 bg-gradient-to-br from-[#3A9EFF]/15 to-[#FF2EE6]/10 overflow-hidden flex items-center justify-center">
            <p className="text-white/70 text-sm">ICS'25</p>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100">About the Summit</h3>
        <p className="mt-3 text-zinc-700 dark:text-zinc-300">
          Insturix Creators Summit 2025 is India’s largest student‑led creator‑tech event. Two days packed with live competitions, AI tool showcases, inspiring talks, awards and structured networking.
        </p>
        <p className="mt-3 text-zinc-700 dark:text-zinc-300">
          Explore our flagship tools—Editron (AI editing), Alyzitron (analytics), Musitron (music), and ThinkForge (ideation)—and connect with brands, creators and fans.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }} className="rounded-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-4 text-center">
              <div className="text-2xl font-extrabold">
                <CountUp to={s.to} duration={1.6} suffix={s.suffix} numberClassName="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.55)]" />
              </div>
              <div className="text-xs mt-1 uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
