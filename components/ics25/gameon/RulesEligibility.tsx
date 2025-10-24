"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from 'react';

const rules = [
  {
    title: "Eligibility",
    items: [
      "Open to all",
      "Valid ID required for finalists.",
      "Mixed‑city teams permitted.",
    ],
  },
  {
    title: "Fair Play",
    items: [
      "Zero tolerance for cheating or toxicity.",
      "Admin decisions are final for disputes.",
      "Standard anti‑cheat checks apply.",
    ],
  },
  {
    title: "Online Setup",
    items: [
      "Stable internet required for all matches.",
      "Discord mandatory for team comms.",
      "Standard anti-cheat software required.",
    ],
  },
];

export default function RulesEligibility() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const delay = performance.now() < 1000 ? 600 : 0;
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <section className="relative">
      <div className="mb-6 text-sm uppercase tracking-wide text-white/70">Rules & Eligibility</div>
      <div className="grid md:grid-cols-3 gap-4">
        {rules.map((card, i) => (
          <motion.div key={card.title} initial={{ opacity: 0, y: 10 }} animate={mounted ? { opacity: 1, y: 0 } : {}} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" style={{ willChange: 'transform, opacity' }}>
            <div className="text-white font-semibold mb-2">{card.title}</div>
            <ul className="text-sm text-white/80 list-disc list-inside space-y-1">
              {card.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
