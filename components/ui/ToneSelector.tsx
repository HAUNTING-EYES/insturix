"use client";

import { ThinkingHat } from "@/app/dashboard/thinkforge/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toneColors } from "@/lib/thinkforge/tone";

type ToneSelectorProps = {
  value: ThinkingHat;
  onChange: (tone: ThinkingHat) => void;
  className?: string;
};

export default function ToneSelector({ value, onChange, className }: ToneSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "w-3 h-3 rounded-full cursor-pointer",
            toneColors[value],
            className
          )}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 bg-neutral-900 border-neutral-700 flex gap-2">
        {Object.keys(toneColors).map((toneKey) => {
          const tone = toneKey as ThinkingHat;
          return (
            <button
              key={tone}
              onClick={() => {
                onChange(tone);
                setOpen(false);
              }}
              className={cn(
                "w-5 h-5 rounded-full border-2 border-transparent hover:border-white focus:outline-none",
                toneColors[tone]
              )}
            />
          );
        })}
      </PopoverContent>
    </Popover>
  );
} 