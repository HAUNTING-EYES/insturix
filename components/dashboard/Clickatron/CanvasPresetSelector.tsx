"use client";

import React from 'react';
import { motion, AnimatePresence, Easing } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Preset {
  name: string;
  ratio: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Content Creator Platform Icons
const YouTubeThumbnailIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect>
    <polygon points="10,9 15,12 10,15"></polygon>
  </svg>
);
const ReelsIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2" width="12" height="20" rx="2" ry="2"></rect>
    <circle cx="12" cy="8" r="2"></circle>
    <path d="M12 14v6"></path>
  </svg>
);
const InstagramPostIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="3" ry="3"></rect>
    <circle cx="12" cy="12" r="3"></circle>
    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"></circle>
  </svg>
);
const InstagramStoryIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="2" width="10" height="20" rx="3" ry="3"></rect>
    <path d="M12 7v10"></path>
    <circle cx="12" cy="7" r="1" fill="currentColor"></circle>
  </svg>
);

const presets: Preset[] = [
  { name: 'YouTube Thumbnail', ratio: '16:9', icon: YouTubeThumbnailIcon },
  { name: 'Reels/TikTok', ratio: '9:16', icon: ReelsIcon },
  { name: 'Instagram Post', ratio: '1:1', icon: InstagramPostIcon },
  { name: 'Instagram Story', ratio: '9:16', icon: InstagramStoryIcon },
  { name: 'Standard', ratio: '4:3', icon: YouTubeThumbnailIcon },
  { name: 'Portrait', ratio: '3:4', icon: ReelsIcon },
];

const fadeIn: {
    initial: { opacity: number; y: number };
    animate: { opacity: number; y: number };
    transition: { duration: number; ease: Easing };
} = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: 'easeOut' },
};


interface CanvasPresetSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export const CanvasPresetSelector: React.FC<CanvasPresetSelectorProps> = ({ value, onChange }) => {
  return (
    <motion.div {...fadeIn} className="w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {presets.map(preset => (
          <PresetCard
            key={preset.name}
            preset={preset}
            isSelected={value === preset.ratio}
            onSelect={() => onChange(preset.ratio)}
          />
        ))}
      </div>
    </motion.div>
  );
};

const PresetCard = ({ preset, isSelected, onSelect }: { preset: Preset, isSelected: boolean, onSelect: () => void }) => (
  <div
    onClick={onSelect}
    className={cn(
      "relative rounded-lg border p-3 cursor-pointer transition-all duration-200 group bg-[#131312]/50 hover:bg-[#1B1A18]/70 flex flex-col items-center justify-center",
      isSelected ? 'border-[#D4A652]/60 bg-[#D4A652]/10' : 'border-[#282724]/50 hover:border-[#282724]'
    )}
    style={{ minHeight: '90px' }}
  >
    <AnimatePresence>
      {isSelected && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          className="absolute top-1 right-1 bg-[#D4A652] rounded-full p-0.5"
        >
          <Check className="w-2.5 h-2.5 text-white" />
        </motion.div>
      )}
    </AnimatePresence>
    <preset.icon className={cn("w-6 h-6 mb-2 transition-colors", isSelected ? "text-[#D4A652]" : "text-[#7A776E] group-hover:text-[#B5B2A8]")} />
    <p className={cn("text-[11px] font-medium transition-colors text-center leading-tight mb-1", isSelected ? "text-[#ECE9E1]" : "text-[#B5B2A8] group-hover:text-[#ECE9E1]")}>{preset.name}</p>
    <p className={cn("text-[11px] transition-colors", isSelected ? "text-[#D4A652]" : "text-[#7A776E] group-hover:text-[#7A776E]")}>{preset.ratio}</p>
  </div>
);

