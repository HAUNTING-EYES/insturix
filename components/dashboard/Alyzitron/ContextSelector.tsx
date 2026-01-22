"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  Heart,
  MapPin,
  Check,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextValues } from "@/app/api/services/alyzitron/types";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Info } from "lucide-react";

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

const platforms: Pill[] = [
  { id: "Social Media", label: "Social Media" },
  { id: "Documentary", label: "Documentary" },
  { id: "Television / News", label: "Television / News" },
  { id: "OTT / YouTube", label: "OTT / YouTube" },
];

const countries = [
  { value: "global", label: "Global (International)" },

  // North America
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "mx", label: "Mexico" },

  // Europe
  { value: "uk", label: "United Kingdom" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "es", label: "Spain" },
  { value: "it", label: "Italy" },
  { value: "nl", label: "Netherlands" },
  { value: "ch", label: "Switzerland" },
  { value: "se", label: "Sweden" },
  { value: "no", label: "Norway" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "ie", label: "Ireland" },
  { value: "pl", label: "Poland" },
  { value: "pt", label: "Portugal" },
  { value: "be", label: "Belgium" },
  { value: "at", label: "Austria" },
  { value: "ru", label: "Russia" },
  { value: "ua", label: "Ukraine" },

  // Asia
  { value: "in", label: "India" },
  { value: "cn", label: "China" },
  { value: "jp", label: "Japan" },
  { value: "kr", label: "South Korea" },
  { value: "sg", label: "Singapore" },
  { value: "id", label: "Indonesia" },
  { value: "my", label: "Malaysia" },
  { value: "th", label: "Thailand" },
  { value: "vn", label: "Vietnam" },
  { value: "ph", label: "Philippines" },
  { value: "pk", label: "Pakistan" },
  { value: "bd", label: "Bangladesh" },
  { value: "lk", label: "Sri Lanka" },
  { value: "np", label: "Nepal" },

  // Middle East
  { value: "ae", label: "United Arab Emirates" },
  { value: "sa", label: "Saudi Arabia" },
  { value: "qa", label: "Qatar" },
  { value: "kw", label: "Kuwait" },
  { value: "om", label: "Oman" },
  { value: "il", label: "Israel" },
  { value: "tr", label: "Turkey" },

  // Africa
  { value: "za", label: "South Africa" },
  { value: "ng", label: "Nigeria" },
  { value: "eg", label: "Egypt" },
  { value: "ke", label: "Kenya" },
  { value: "gh", label: "Ghana" },
  { value: "ma", label: "Morocco" },

  // South America
  { value: "br", label: "Brazil" },
  { value: "ar", label: "Argentina" },
  { value: "cl", label: "Chile" },
  { value: "co", label: "Colombia" },
  { value: "pe", label: "Peru" },

  // Oceania
  { value: "au", label: "Australia" },
  { value: "nz", label: "New Zealand" },
];

export function ContextSelector({
  value,
  onChange,
  show,
}: ContextSelectorProps) {
  const [openCountry, setOpenCountry] = useState(false);
  const [customMode, setCustomMode] = useState(false);

  // Sync customMode with value.platform on mount or external change
  useEffect(() => {
    const isStandard = platforms.some((p) => p.id === value.platform);
    if (!isStandard && value.platform) {
      setCustomMode(true);
    } else if (isStandard) {
      setCustomMode(false);
    }
  }, [value.platform]);

  const togglePlatform = (id: string) => {
    if (value.platform === id) {
      onChange({ ...value, platform: "" });
      setCustomMode(false);
    } else {
      onChange({ ...value, platform: id });
      setCustomMode(false);
    }
  };

  const enableCustomPlatform = () => {
    if (customMode) {
      // Toggle off
      setCustomMode(false);
      onChange({ ...value, platform: "" });
    } else {
      setCustomMode(true);
      onChange({ ...value, platform: "" });
    }
  };

  // const toggleFamilyFriendly removed as we use Switch now

  // Find label for valid location
  const currentLocation = countries.find((c) => c.label === value.location);
  const isLocationValid = !!currentLocation;
  const locationLabel = currentLocation?.label || value.location;

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
            {/* Family Friendly - Tri-state Buttons */}
            <div className="md:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 gap-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20">
                    <Heart className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-medium text-zinc-100">
                      Family-Friendly Handling
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Ensure content is suitable for all age groups.
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
            </div>

            {/* Platform Selection */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800/40 ring-1 ring-inset ring-white/5">
                  <Monitor className="h-3.5 w-3.5 text-zinc-400" />
                </span>
                <h4 className="text-[13px] font-medium text-zinc-100 tracking-tight">
                  Platform Awareness
                </h4>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {platforms.map((p) => {
                  const isActive = value.platform === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlatform(p.id)}
                      aria-pressed={isActive}
                      className={cn(
                        "h-8 rounded-full px-3.5 text-xs",
                        "transition-colors duration-200 ease-out",
                        "bg-zinc-900/60 text-zinc-200 border border-zinc-800/70",
                        "hover:bg-zinc-800/80 hover:text-zinc-100",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50",
                        isActive
                          ? "bg-zinc-100 text-zinc-900 border-zinc-200"
                          : "",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {/* Custom Platform Pill */}
                <button
                  type="button"
                  onClick={enableCustomPlatform}
                  aria-pressed={customMode}
                  className={cn(
                    "h-8 rounded-full px-3.5 text-xs",
                    "transition-colors duration-200 ease-out",
                    "bg-zinc-900/60 text-zinc-200 border border-zinc-800/70",
                    "hover:bg-zinc-800/80 hover:text-zinc-100",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50",
                    customMode
                      ? "bg-zinc-100 text-zinc-900 border-zinc-200"
                      : "",
                  )}
                >
                  Custom
                </button>
              </div>

              {/* Custom Platform Input */}
              <AnimatePresence>
                {customMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 10 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <Input
                      placeholder="Enter custom platform name..."
                      value={value.platform}
                      onChange={(e) =>
                        onChange({ ...value, platform: e.target.value })
                      }
                      className="bg-zinc-900/40 border-zinc-800/70 h-9 text-sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Location Input with Combobox */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800/40 ring-1 ring-inset ring-white/5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                </span>
                <h4 className="text-[13px] font-medium text-zinc-100 tracking-tight">
                  Location
                </h4>
              </div>

              <Popover open={openCountry} onOpenChange={setOpenCountry}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCountry}
                    className={cn(
                      "w-full h-10 justify-between bg-zinc-900/40 border-zinc-800/70 hover:bg-zinc-800/60 text-zinc-200 hover:text-zinc-100",
                      !value.location && "text-zinc-500",
                    )}
                  >
                    {value.location ? locationLabel : "Global (International)"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0 bg-zinc-900 border-zinc-800">
                  <Command className="bg-transparent">
                    <CommandInput
                      placeholder="Search country..."
                      className="h-9"
                    />
                    <CommandList>
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {countries.map((country) => (
                          <CommandItem
                            key={country.value}
                            value={country.label}
                            onSelect={(currentValue) => {
                              onChange({
                                ...value,
                                location:
                                  currentValue === value.location
                                    ? ""
                                    : currentValue,
                              });
                              setOpenCountry(false);
                            }}
                            className="text-zinc-200 aria-selected:bg-zinc-800 aria-selected:text-zinc-100"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value.location === country.label
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {country.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Validation Message for Location */}
              {value.location && !isLocationValid && (
                <p className="text-[11px] text-red-400 mt-2 ml-1">
                  No country is present in our list. Please select from the
                  dropdown.
                </p>
              )}
              {!value.location && (
                <p className="text-[11px] text-zinc-500 mt-2 ml-1 italic opacity-80">
                  (Default will be Global)
                </p>
              )}
            </div>

            {/* Additional Details */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800/40 ring-1 ring-inset ring-white/5">
                  <Info className="h-3.5 w-3.5 text-zinc-400" />
                </span>
                <h4 className="text-[13px] font-medium text-zinc-100 tracking-tight">
                  Additional Details
                </h4>
              </div>
              <Textarea
                placeholder="Add any specific context, audience details, or goals for this video analysis..."
                value={value.additionalDetails}
                onChange={(e) =>
                  onChange({ ...value, additionalDetails: e.target.value })
                }
                className="bg-zinc-900/40 border-zinc-800/70 min-h-[100px] text-sm text-zinc-200 placeholder:text-zinc-500"
              />
              <p className="text-[11px] text-zinc-500 mt-2 ml-1 italic opacity-80">
                Optional: Provide extra context to help the AI better analyze
                your content.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
