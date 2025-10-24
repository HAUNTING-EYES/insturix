"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export default function GameOnBlock() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0C] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_20%_20%,rgba(255,59,59,0.22),transparent_50%),radial-gradient(800px_circle_at_80%_80%,rgba(75,83,32,0.22),transparent_50%)]" />
      <div className="orb -top-20 -left-20"></div>
      <div className="orb -bottom-24 -right-10"></div>
      <div className="relative p-6 md:p-10 grid md:grid-cols-2 gap-8">
  <motion.div viewport={{ once: true, amount: 0.6 }}>
          <div className="text-sm uppercase tracking-wide text-white/70">GameOn Esports @ ICS’25</div>
          <h3 className="mt-2 text-3xl md:text-4xl font-extrabold">Valorant (5v5) & BGMI (4v4)</h3>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/ics25/gameon"><Button className="bg-white text-black hover:bg-zinc-200">Visit GameOn</Button></Link>
            <Link href="/ics25/gameon#faqs"><Button variant="outline" className="border-white/30 text-white hover:bg-white/10">FAQs</Button></Link>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 text-center">
            <TimelinePill label="Prize Pool" value="₹25,000" />
            <TimelinePill label="Total Teams" value="120" />
            <TimelinePill label="Nov 1 & 8" value="Online" />
          </div>
        </motion.div>
        <div className="relative min-h-48 rounded-2xl overflow-hidden border border-white/10">
          <Image src="/ics25/gameon3.png" alt="GameOn arena" fill className="object-cover" priority />
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 bg-[radial-gradient(500px_circle_at_20%_20%,rgba(255,59,59,0.16),transparent_55%),radial-gradient(600px_circle_at_80%_80%,rgba(75,83,32,0.16),transparent_55%)]" />
          <div className="relative p-6 grid place-items-center text-center">
            
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelinePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.04] p-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
