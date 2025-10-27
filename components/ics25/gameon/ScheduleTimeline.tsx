"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from 'react';

const milestones = [
  { date: "Nov 8", label: "Qualifiers (Online)" },
  { date: "Nov 15", label: "Finals (Online)" },
  { date: "Nov 22–23", label: "ICS'25 @ IIIT Delhi" },
  { date: "Nov 23", label: "GameOn Awards Ceremony" },
];

export default function ScheduleTimeline() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <section aria-label="Tournament schedule timeline" className="relative">
      <div className="mb-6 text-sm uppercase tracking-wide text-white/70">Schedule</div>
      <div className="relative pl-4">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#FF3B3B] via-white/20 to-[#4B5320]" />
        <div className="space-y-5">
          {milestones.map((m, i) => (
            <motion.div key={m.date} initial={{ opacity: 0, x: -8 }} animate={mounted ? { opacity: 1, x: 0 } : {}} transition={{ delay: i * 0.05 }} className="relative pl-6">
              <div className="absolute left-[-9px] top-1.5 w-4 h-4 rounded-full bg-white/10 border border-white/20 shadow-[0_0_20px_rgba(255,59,59,0.4)]" />
              <div className="text-sm text-white/60">{m.date}</div>
              <div className="text-base font-semibold">{m.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}



