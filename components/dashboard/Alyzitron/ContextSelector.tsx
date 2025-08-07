"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BadgeCheck, Target, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Pill = {
  id: string;
  label: string;
};

export type ContextValues = {
  niche: string;
  audience: string;
  tone: string;
};

interface ContextSelectorProps {
  value: ContextValues;
  onChange: (next: ContextValues) => void;
  show: boolean;
}

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.18, ease: "easeIn" as const } },
};

const defaultNiche: Pill[] = [
  { id: "tech-reviews", label: "Tech Reviews" },
  { id: "education", label: "Education" },
  { id: "vlogs", label: "Vlogs" },
  { id: "gaming", label: "Gaming" },
  { id: "finance", label: "Finance" },
];

const defaultAudience: Pill[] = [
  { id: "creators-18-35", label: "Creators • 18-35" },
  { id: "professionals", label: "Professionals" },
  { id: "students", label: "Students" },
  { id: "beginners", label: "Beginners" },
  { id: "experts", label: "Experts" },
];

const defaultTone: Pill[] = [
  { id: "educational", label: "Educational" },
  { id: "friendly", label: "Friendly" },
  { id: "entertaining", label: "Entertaining" },
  { id: "formal", label: "Formal" },
  { id: "persuasive", label: "Persuasive" },
];

function Section({
  icon,
  title,
  items,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  items: Pill[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800/40 ring-1 ring-inset ring-white/5">
          {icon}
        </span>
        <h4 className="text-[13px] font-medium text-zinc-100 tracking-tight">{title}</h4>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((p) => {
          const isActive = selected === p.id;
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={isActive}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={cn(
                "h-8 rounded-full px-3.5 text-xs",
                // minimal smooth transitions
                "transition-[background-color,color,border-color,box-shadow] duration-150 ease-out",
                // base
                "bg-zinc-900/60 text-zinc-200",
                "border border-zinc-800/70 ring-1 ring-white/5",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
                "hover:bg-zinc-800/60",
                // focus-visible for accessibility
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30 focus-visible:ring-offset-0",
                // active state
                isActive
                  ? "bg-zinc-100 text-zinc-900 border-zinc-200 ring-zinc-200 shadow-[0_1px_6px_rgba(255,255,255,0.15)]"
                  : ""
              )}
            >
              {p.label}
            </motion.button>
          );
        })}
        {/* custom free-text pill */}
        <input
          type="text"
          placeholder="Custom..."
          className={cn(
            "h-8 px-3.5 rounded-full text-xs text-zinc-200 placeholder:text-zinc-500 outline-none",
            "bg-zinc-900/40 border border-zinc-800/70 ring-1 ring-white/5",
            "focus:border-zinc-700 focus:bg-zinc-900/60 focus:ring-blue-400/20"
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value.trim();
              if (val) onSelect(val);
              (e.target as HTMLInputElement).value = "";
            }
          }}
        />
      </div>
    </div>
  );
}

export function ContextSelector({ value, onChange, show }: ContextSelectorProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="context-selector"
          variants={fade}
          initial="initial"
          animate="animate"
          exit="exit"
          className="mx-auto w-full mt-2 rounded-2xl bg-zinc-950/50 p-4 md:p-5 ring-1 ring-white/5 border border-zinc-800/70"
        >
          <div className="grid grid-cols-1 gap-6">
            <Section
              icon={<Target className="h-3.5 w-3.5 text-zinc-400" />}
              title="Niche"
              items={defaultNiche}
              selected={value.niche}
              onSelect={(id) => onChange({ ...value, niche: id })}
            />
            <Section
              icon={<Target className="h-3.5 w-3.5 text-zinc-400" />}
              title="Target Audience"
              items={defaultAudience}
              selected={value.audience}
              onSelect={(id) => onChange({ ...value, audience: id })}
            />
            <Section
              icon={<MessageSquare className="h-3.5 w-3.5 text-zinc-400" />}
              title="Intended Tone"
              items={defaultTone}
              selected={value.tone}
              onSelect={(id) => onChange({ ...value, tone: id })}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}