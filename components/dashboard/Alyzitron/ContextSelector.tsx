"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gauge,
  Heart,
  Info,
  MapPin,
  Monitor,
  Sparkles,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { AlyzitronContentIntent, ContextValues } from "@/app/api/services/alyzitron/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface ContextSelectorProps {
  value: ContextValues;
  onChange: (next: ContextValues) => void;
  show: boolean;
}

const platforms = [
  "Social Media",
  "Documentary",
  "Television / News",
  "OTT / YouTube",
];

const contentIntentOptions: Array<{
  value: AlyzitronContentIntent | "auto";
  label: string;
  Icon: LucideIcon;
}> = [
  { value: "auto", label: "Auto", Icon: Gauge },
  { value: "own_content", label: "My content", Icon: UserRound },
  { value: "competitor_content", label: "Competitor", Icon: Target },
  { value: "reference_content", label: "Reference", Icon: Sparkles },
];

function withoutContentIntent(value: ContextValues): ContextValues {
  const next = { ...value };
  delete next.contentIntent;
  return next;
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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25 }}
          className="mx-auto mt-4 w-full max-w-4xl rounded-2xl border border-[#282724] bg-[#0F0F0E] p-6"
        >
          <div className="space-y-8">
            {/* Family Friendly */}
            <div className="flex items-center justify-between rounded-xl border border-[#1C1B19] bg-[#131312] p-4">
              <div className="flex items-center gap-3">
                <Heart className="h-4 w-4 text-[#D4A652]" />
                <div>
                  <p className="text-[14px] font-medium text-[#ECE9E1]">
                    Family Friendly
                  </p>
                  <p className="text-sm text-[#7A776E]">
                    Safe content handling for all audiences
                  </p>
                </div>
              </div>

              <Switch
                checked={value.familyFriendly}
                onCheckedChange={(checked) =>
                  onChange({ ...value, familyFriendly: checked })
                }
              />
            </div>

            {/* Analysis Lens */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-[#D4A652]" />
                <p className="text-[14px] font-medium text-[#ECE9E1]">Analysis lens</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {contentIntentOptions.map(({ value: optionValue, label, Icon }) => {
                  const active = (value.contentIntent ?? "auto") === optionValue;
                  const nextIntent = optionValue === "auto" ? undefined : optionValue;

                  return (
                    <button
                      key={optionValue}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onChange(nextIntent ? { ...value, contentIntent: nextIntent } : withoutContentIntent(value))
                      }
                      className={`flex h-11 items-center justify-center gap-2 rounded-full px-3 text-sm transition ${active
                          ? "bg-[#D4A652] text-black"
                          : "border border-[#282724] bg-[#131312] text-[#B5B2A8] hover:border-[#D4A652]/40 hover:text-[#ECE9E1]"
                        }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Platform */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Monitor className="h-4 w-4 text-[#D4A652]" />
                <p className="text-[14px] font-medium text-[#ECE9E1]">Platform</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {platforms.map((platform) => {
                  const active = value.platform === platform;

                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() =>
                        onChange({ ...value, platform })
                      }
                      className={`rounded-full px-4 py-2 text-sm transition ${active
                          ? "bg-[#D4A652] text-black"
                          : "border border-[#282724] bg-[#131312] text-[#B5B2A8]"
                        }`}
                    >
                      {platform}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Location */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#D4A652]" />
                <p className="text-[14px] font-medium text-[#ECE9E1]">Location</p>
              </div>

              <Input
                placeholder="Global (International)"
                value={value.location}
                onChange={(e) =>
                  onChange({ ...value, location: e.target.value })
                }
                className="h-11 border-[#282724] bg-[#131312] text-[14px] text-[#ECE9E1]"
              />
            </div>

            {/* Additional Details */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-[#D4A652]" />
                <p className="text-[14px] font-medium text-[#ECE9E1]">
                  Additional Details
                </p>
              </div>

              <Textarea
                placeholder="Add audience details, goals, or extra context..."
                value={value.additionalDetails}
                onChange={(e) =>
                  onChange({
                    ...value,
                    additionalDetails: e.target.value,
                  })
                }
                className="min-h-[120px] border-[#282724] bg-[#131312] text-[#ECE9E1]"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
