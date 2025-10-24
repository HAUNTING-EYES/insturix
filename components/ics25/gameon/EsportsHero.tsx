"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Trophy, Calendar, MapPin } from "lucide-react";
import Image from "next/image";
import Beams from "@/components/ics25/Beams";

export default function EsportsHero() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Throttle animation start if first load is fast
    const delay = performance.now() < 1000 ? 600 : 0;
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0C] text-white">
      <Beams />
  <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_20%_20%,rgba(255,59,59,0.22),transparent_50%),radial-gradient(800px_circle_at_80%_80%,rgba(75,83,32,0.22),transparent_50%)]" />
      <div className="orb -top-24 -left-24" />
      <div className="orb -bottom-28 -right-16" />

      <div className="relative p-8 md:p-12 grid lg:grid-cols-2 gap-10 items-center">
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={mounted ? { opacity: 1, y: 0 } : {}}
    transition={{ duration: 0.6 }}
    style={{ willChange: 'transform, opacity' }}
  >
          <div className="text-sm uppercase tracking-wide text-white/70">GameOn Esports @ ICS’25</div>
          <h1 className="mt-2 text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[#FF3B3B] via-[#FF6B6B] to-[#4B5320]">Valorant × BGMI</h1>
          
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/ics25/register"><Button className="bg-[#FF3B3B] text-white hover:bg-[#e03535]">Register Now</Button></Link>
            <Link href="#faqs"><Button variant="outline" className="border-white/30 text-white hover:bg-white/10">Rules & FAQs</Button></Link>
          </div>
          {/* Removed sticker chips per request */}
          <div className="mt-8 grid grid-cols-3 gap-4 mx-auto max-w-md text-center">
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-3">
              <div className="text-xs text-white/60">Prize Pool</div>
              <div className="text-sm font-semibold">₹25,000</div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-3">
              <div className="text-xs text-white/60">Total Teams</div>
              <div className="text-sm font-semibold">120</div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-3">
              <div className="text-xs text-white/60">Nov 1 & 8</div>
              <div className="text-sm font-semibold">Online</div>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={mounted ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative h-64 md:h-80 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent overflow-hidden"
          aria-label="GameOn esports arena visual"
          style={{ willChange: 'transform, opacity' }}
        >
          {/* Background image with graceful fallback */}
          <div className="absolute inset-0">
            <Image
              src="/ics25/gameon3.png"
              alt="GameOn esports arena with players and big screens"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
            {/* Fallback gradient overlay keeps premium tone even if image missing */}
            <div className="absolute inset-0 bg-[radial-gradient(600px_circle_at_25%_20%,rgba(255,59,59,0.18),transparent_55%),radial-gradient(700px_circle_at_80%_85%,rgba(75,83,32,0.18),transparent_55%)]" />
          </div>
          {/* Dark veil and shimmer for readability */}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 pointer-events-none shimmer-bg" />
          {/* Copy */}
          <div className="relative z-10 h-full w-full grid place-items-center text-center p-4">
            
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Note: Timeline-style pills are rendered inline in the hero for consistency with the ICS tickets block.
