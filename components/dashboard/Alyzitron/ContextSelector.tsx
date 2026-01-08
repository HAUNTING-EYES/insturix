"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextValues } from "@/app/api/services/alyzitron/types";

type Pill = {
  id: string;
  label: string;
};


interface ContextSelectorProps {
  value: ContextValues;
  onChange: (next: ContextValues) => void;
  show: boolean;
}

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: "easeOut" as const },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.18, ease: "easeIn" as const },
  },
};

const defaultNiche: Pill[] = [
  { id: "tech-reviews", label: "Tech Reviews" },
  { id: "education", label: "Education" },
  { id: "vlogs", label: "Vlogs" },
  { id: "gaming", label: "Gaming" },
  { id: "finance", label: "Finance" },
];

const defaultAudience: Pill[] = [
  { id: "creators", label: "Creators" },
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
  const [customValue, setCustomValue] = useState("");

  // Check if selected value is a custom one (not in predefined items)
  const isCustomSelected =
    selected && !items.some((item) => item.id === selected);

  // Validate input: only alphanumeric, spaces, and basic punctuation
  const validateInput = (value: string): boolean => {
    const regex = /^[a-zA-Z0-9\s\-_.,'!?()&]+$/;
    return regex.test(value) && value.length <= 100;
  };

  const handleCustomInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // If the input is completely cleared, deselect everything
    if (value === "") {
      setCustomValue("");
      onSelect(""); // Clear the selection
      return;
    }

    // Allow typing but validate on change
    if (validateInput(value)) {
      setCustomValue(value);

      // If user is typing a custom value, update state
      // Update even if it ends with spaces to preserve the input
      onSelect(value.trim());
    }
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement;
    const currentValue = input.value;

    if (e.key === "Enter") {
      const val = customValue.trim();
      if (val && validateInput(val)) {
        onSelect(val);
        setCustomValue("");
      }
    } else if (e.key === "Backspace") {
      // If we're at the last character and user presses backspace, clear the selection
      if (currentValue.length === 1) {
        setCustomValue("");
        onSelect(""); // Clear the selection
        e.preventDefault(); // Prevent the default backspace behavior
      }
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800/40 ring-1 ring-inset ring-white/5">
          {icon}
        </span>
        <h4 className="text-[13px] font-medium text-zinc-100 tracking-tight">
          {title}
        </h4>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((p) => {
          const isActive = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p.id);
                setCustomValue(""); // Clear custom input when predefined option is selected
              }}
              aria-pressed={isActive}
              className={cn(
                "h-8 rounded-full px-3.5 text-xs",
                // simplified hover effect
                "transition-colors duration-200 ease-out",
                // base state
                "bg-zinc-900/60 text-zinc-200 border border-zinc-800/70",
                // simple hover
                "hover:bg-zinc-800/80 hover:text-zinc-100",
                // focus for accessibility
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50",
                // active state
                isActive ? "bg-zinc-100 text-zinc-900 border-zinc-200" : ""
              )}
            >
              {p.label}
            </button>
          );
        })}

        {/* Custom input */}
        <input
          type="text"
          placeholder="Custom..."
          value={customValue || (isCustomSelected ? selected : "")}
          maxLength={100}
          className={cn(
            "h-8 px-3.5 rounded-full text-xs outline-none min-w-[80px]",
            "transition-colors duration-200 ease-out",
            // Base state - dark input
            "bg-zinc-900/40 border border-zinc-800/70",
            "text-zinc-200 placeholder:text-zinc-500",
            // Focus state - slightly lighter but still dark for readability
            "focus:border-blue-400/50 focus:bg-zinc-800/60 focus:ring-1 focus:ring-blue-400/20",
            // Selected state - use a blue accent instead of light background
            isCustomSelected
              ? "bg-blue-500/10 border-blue-400/50 text-blue-100 ring-1 ring-blue-400/20"
              : ""
          )}
          onChange={handleCustomInput}
          onKeyDown={handleCustomKeyDown}
          onFocus={() => {
            // If there's a custom selected value, put it in the input for editing
            if (isCustomSelected) {
              setCustomValue(selected);
            }
          }}
          onBlur={() => {
            // If input is empty after blur, ensure selection is cleared
            if (!customValue.trim()) {
              onSelect("");
              setCustomValue("");
            }
          }}
        />
      </div>

      {/* Validation message */}
      {customValue && !validateInput(customValue) && (
        <p className="text-xs text-red-400 mt-1 ml-1">
          Only letters, numbers, spaces and basic punctuation allowed (max 100
          characters)
        </p>
      )}
    </div>
  );
}

export function ContextSelector({
  value,
  onChange,
  show,
}: ContextSelectorProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="context-selector"
          variants={fade}
          initial="initial"
          animate="animate"
          exit="exit"
          className="mx-auto w-full mt-2 rounded-2xl bg-zinc-950/50 p-3 sm:p-4 md:p-6 ring-1 ring-white/5 border border-zinc-800/70"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
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
            
            {/* Additional Details */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800/40 ring-1 ring-inset ring-white/5">
                  <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
                </span>
                <h4 className="text-[13px] font-medium text-zinc-100 tracking-tight">
                  Additional Details
                </h4>
              </div>
              <textarea
                placeholder="Provide any additional context, requirements, or specific areas you'd like the analysis to focus on..."
                value={value.additionalDetails || ""}
                onChange={(e) => onChange({ ...value, additionalDetails: e.target.value })}
                className="w-full h-24 px-4 py-3 text-sm bg-zinc-900/40 border border-zinc-800/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 resize-none text-zinc-200 placeholder:text-zinc-500 transition-all font-light"
                rows={4}
              />
              <p className="text-[11px] text-zinc-500 mt-2 ml-1 italic opacity-80">
                Optional: Provide additional context to help tailor the analysis to your specific needs.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
