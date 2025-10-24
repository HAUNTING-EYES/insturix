"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from 'react';

const casters = [
  { name: "TBD Caster 1", role: "Host" },
  { name: "TBD Caster 2", role: "Play-by-Play" },
  { name: "TBD Analyst", role: "Analyst" },
];

export default function CastersLineup() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const delay = performance.now() < 1000 ? 600 : 0;
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <section className="relative">
      <div className="mb-6 text-sm uppercase tracking-wide text-white/70">On the Desk</div>
      <div className="grid sm:grid-cols-3 gap-4">
        {casters.map((c, i) => (
          <motion.div key={c.name} initial={{ opacity: 0, y: 10 }} animate={mounted ? { opacity: 1, y: 0 } : {}} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center" style={{ willChange: 'transform, opacity' }}>
            <div className="mx-auto mb-3 h-16 w-16 rounded-full border border-white/10 bg-white/5" />
            <div className="font-semibold">{c.name}</div>
            <div className="text-xs text-white/60">{c.role}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
