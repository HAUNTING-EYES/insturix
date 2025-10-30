"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Play, Sparkles, Music, Cpu, Mic2, Mic, Gamepad2, Award, Handshake } from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import ModalOverlay from "@/components/ModalOverlay";
import { getHighlightDetail, type HighlightKey } from "@/components/ics25/highlightDetails";

type Item = {
  icon: React.ComponentType<any>;
  title: string;
  desc: string;
};

const items: Item[] = [
  { icon: Play, title: "Reel-Making Battles", desc: "Create viral clips live with Insturix tools." },
  { icon: Sparkles, title: "Speed Editing Showdown", desc: "Race to cut the most epic short video." },
  { icon: Mic, title: "Talent Showdown", desc: "Showcase your talent and launch your creator journey." },
  { icon: Cpu, title: "ThinkForge Ideation", desc: "ForgeAI to spark scripts and hooks." },
  { icon: Mic2, title: "Creator Panels", desc: "Talks on trends, growth and AI workflows." },
  { icon: Gamepad2, title: "GameOn Esports", desc: "Fully online Valorant & BGMI tournament." },
  { icon: Award, title: "Creator Awards", desc: "Celebrating innovation across categories." },
  { icon: Handshake, title: "Networking Zones", desc: "Meet brands, collab partners and fans." },
];

export default function HighlightsGrid() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<React.ReactNode>("");
  const [title, setTitle] = useState<string>("Details");
  const [IconComp, setIconComp] = useState<React.ComponentType<any> | null>(null);
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const openDetails = useCallback((title: string, icon: React.ComponentType<any>) => {
    setTitle(title);
    setIconComp(() => icon);
    // Map title to curated content; cast to HighlightKey for type-safety
    setContent(getHighlightDetail(title as HighlightKey));
    setOpen(true);
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {items.map((item, i) => (
          <HighlightCard
            key={i}
            item={item}
            index={i}
            mounted={mounted}
            shouldReduceMotion={shouldReduceMotion}
            onOpen={() => openDetails(item.title, item.icon)}
          />
        ))}
      </div>
      <ModalOverlay open={open} onClose={() => setOpen(false)} title={title} icon={IconComp ? <IconComp className="h-4 w-4" /> : null}>
        {content}
      </ModalOverlay>
    </>
  );
}

function HighlightCard({ item, index, mounted, shouldReduceMotion, onOpen }: { item: Item; index: number; mounted: boolean; shouldReduceMotion: boolean | null; onOpen: () => void }) {
  const Icon = item.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, delay: index * 0.05 }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative group cursor-pointer rounded-2xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-5 overflow-hidden tilt-hover",
        "hover:shadow-[0_0_0_1px_rgba(58,158,255,0.35),0_10px_60px_-10px_rgba(255,46,230,0.25)] transition-all"
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute -inset-8 bg-[radial-gradient(600px_circle_at_var(--x)_var(--y),rgba(58,158,255,0.15),transparent_40%)]" />
      </div>
      <div className="relative z-10 grid grid-rows-[auto_auto_1fr_auto] h-full">
        <div className="w-11 h-11 rounded-xl bg-[#0A0A0C] text-white flex items-center justify-center shadow-inner shadow-white/10 mb-4 relative overflow-hidden">
          <div className="absolute inset-0 opacity-0 group-hover:opacity-40 shimmer-bg" />
          <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-105" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</h3>
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{item.desc}</p>
        <div className="mt-3 text-xs text-[#3A9EFF] self-end">Learn more →</div>
      </div>
    </motion.div>
  );
}
