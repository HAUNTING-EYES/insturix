"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from 'react';

const games = [
  { game: "Valorant", pool: "₹12,500", prizes: [{ place: "1st", amount: "₹7,000" }, { place: "2nd", amount: "₹4,000" }, { place: "3rd", amount: "₹1,500" }] },
  { game: "BGMI", pool: "₹12,500", prizes: [{ place: "1st", amount: "₹7,000" }, { place: "2nd", amount: "₹4,000" }, { place: "3rd", amount: "₹1,500" }] },
];

export default function PrizePoolBreakdown() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <section className="relative">
      <div className="mb-6 text-sm uppercase tracking-wide text-white/70">Prize Pool — Total ₹25,000</div>
      <div className="grid md:grid-cols-2 gap-6">
        {games.map((g, gIdx) => (
          <motion.div key={g.game} initial={{ opacity: 0, y: 12 }} animate={mounted ? { opacity: 1, y: 0 } : {}} transition={{ delay: gIdx * 0.1 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-center mb-4">
              <div className="text-lg font-bold text-white">{g.game}</div>
              <div className="text-sm text-white/60">Prize Pool: {g.pool}</div>
            </div>
            <div className="space-y-2">
              {g.prizes.map((p, pIdx) => (
                <div key={pIdx} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <span className="text-sm text-white/70">{p.place} Place</span>
                  <span className="text-base font-semibold text-white">{p.amount}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/50">Note: Prize split indicative; final distribution announced before finals.</p>
    </section>
  );
}



