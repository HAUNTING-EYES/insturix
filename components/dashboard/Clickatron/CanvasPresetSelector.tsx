"use client";

import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { motion, AnimatePresence, Easing } from 'framer-motion';
import { Check, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

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
const TwitterPostIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="10" rx="2" ry="2"></rect>
    <path d="M8 12h8"></path>
  </svg>
);

const presets: Preset[] = [
  { name: 'YouTube Thumbnail', ratio: '16:9', icon: YouTubeThumbnailIcon },
  { name: 'Reels/TikTok', ratio: '9:16', icon: ReelsIcon },
  { name: 'Instagram Post', ratio: '1:1', icon: InstagramPostIcon },
  { name: 'Instagram Story', ratio: '9:16', icon: InstagramStoryIcon },
  { name: 'Twitter Post', ratio: '16:9', icon: TwitterPostIcon },
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

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;

interface CanvasPresetSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export const CanvasPresetSelector: React.FC<CanvasPresetSelectorProps> = ({ value, onChange }) => {
  const isPreset = useMemo(() => presets.some(p => p.ratio === value), [value]);
  const [customWidth, setCustomWidth] = useState<string>('');
  const [customHeight, setCustomHeight] = useState<string>('');

  useEffect(() => {
    if (!isPreset) {
      const [w, h] = value.split(':');
      setCustomWidth(w || '');
      setCustomHeight(h || '');
    }
  }, [isPreset, value]);

  const handleBlur = () => {
    let w = parseFloat(customWidth);
    let h = parseFloat(customHeight);

    if (isNaN(w) || w <= 0) w = 1;
    if (isNaN(h) || h <= 0) h = 1;

    const commonDivisor = gcd(w * 100, h * 100);
    const simplifiedWidth = (w * 100) / commonDivisor;
    const simplifiedHeight = (h * 100) / commonDivisor;

    onChange(`${simplifiedWidth}:${simplifiedHeight}`);
  };

  return (
    <motion.div {...fadeIn} className="w-full">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {presets.map(preset => (
          <PresetCard
            key={preset.name}
            preset={preset}
            isSelected={value === preset.ratio}
            onSelect={() => onChange(preset.ratio)}
          />
        ))}
      </div>
      
      {/* Custom Preset - Full width below main presets */}
      <div className="mt-4">
        <CustomPresetCard
          isSelected={!isPreset}
          width={customWidth}
          height={customHeight}
          onSelect={() => {
            if (isPreset) {
              onChange('4:3');
            }
          }}
          onWidthChange={(e) => setCustomWidth(e.target.value)}
          onHeightChange={(e) => setCustomHeight(e.target.value)}
          onBlur={handleBlur}
        />
      </div>
    </motion.div>
  );
};

const PresetCard = ({ preset, isSelected, onSelect }: { preset: Preset, isSelected: boolean, onSelect: () => void }) => (
  <div
    onClick={onSelect}
    className={cn(
      "relative rounded-lg border-2 p-3 sm:p-4 cursor-pointer transition-all duration-200 group bg-zinc-900/50 hover:bg-zinc-800/70",
      isSelected ? 'border-purple-500 shadow-lg shadow-purple-500/10' : 'border-zinc-700 hover:border-zinc-500'
    )}
    style={{ minHeight: '120px' }}
  >
    <AnimatePresence>
      {isSelected && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          className="absolute top-2 right-2 bg-purple-500 rounded-full p-1"
        >
          <Check className="w-3 h-3 text-white" />
        </motion.div>
      )}
    </AnimatePresence>
    <div className="flex flex-col items-center justify-center h-full text-center">
      <preset.icon className={cn("w-10 h-10 sm:w-12 sm:h-12 mb-2 transition-colors", isSelected ? "text-purple-400" : "text-zinc-400 group-hover:text-zinc-300")} />
      <p className={cn("text-sm font-medium transition-colors", isSelected ? "text-zinc-100" : "text-zinc-300 group-hover:text-zinc-100")}>{preset.name}</p>
      <p className={cn("text-xs transition-colors", isSelected ? "text-zinc-400" : "text-zinc-500 group-hover:text-zinc-400")}>{preset.ratio}</p>
    </div>
  </div>
);

const CustomPresetCard = ({
  isSelected,
  width,
  height,
  onSelect,
  onWidthChange,
  onHeightChange,
  onBlur,
}: {
  isSelected: boolean;
  width: string;
  height: string;
  onSelect: () => void;
  onWidthChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onHeightChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) => {
  const aspectRatio = useMemo(() => {
    const w = parseFloat(width) || 1;
    const h = parseFloat(height) || 1;
    return w / h;
  }, [width, height]);

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative rounded-lg border-2 p-3 sm:p-4 cursor-pointer transition-all duration-200 group bg-zinc-900/50 hover:bg-zinc-800/70 flex flex-col items-center justify-center',
        isSelected
          ? 'border-purple-500 shadow-lg shadow-purple-500/10'
          : 'border-zinc-700 hover:border-zinc-500'
      )}
      style={{ minHeight: '100px' }}
    >
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute top-2 right-2 bg-purple-500 rounded-full p-1 z-10"
          >
            <Check className="w-3 h-3 text-white" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center justify-between h-full text-center w-full">
        <div className="w-full flex justify-center items-center">
            <Edit3
                className={cn(
                    'w-6 h-6 mr-2 transition-colors',
                    isSelected
                    ? 'text-purple-400'
                    : 'text-zinc-400 group-hover:text-zinc-300'
                )}
                />
            <p
            className={cn(
                'text-sm font-medium transition-colors',
                isSelected
                ? 'text-zinc-100'
                : 'text-zinc-300 group-hover:text-zinc-100'
            )}
            >
            Custom Ratio
            </p>
        </div>

        <div className="w-full h-10 flex items-center justify-center my-2 overflow-hidden">
            {isSelected && (
                <motion.div
                    initial={{opacity: 0, scale: 0.8}}
                    animate={{opacity: 1, scale: 1}}
                    className="h-full w-full max-w-[80px] max-h-[40px] flex items-center justify-center"
                >
                     <div
                        className="bg-purple-500/20 rounded-sm transition-all duration-300"
                        style={{
                            width: aspectRatio >= 1 ? '100%' : `${aspectRatio * 100}%`,
                            height: aspectRatio < 1 ? '100%' : `${(1 / aspectRatio) * 100}%`,
                        }}
                    />
                </motion.div>
            )}
        </div>

        <div className="h-8 w-full">
          {isSelected ? (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-1"
            >
              <Input
                type="number"
                placeholder="W"
                value={width}
                onChange={onWidthChange}
                onBlur={onBlur}
                onClick={(e) => e.stopPropagation()}
                className="w-16 h-full text-center bg-zinc-950/50 border-zinc-700 rounded-md text-sm"
                min="0.1"
                step="0.1"
                autoFocus
              />
              <span className="text-zinc-500">:</span>
              <Input
                type="number"
                placeholder="H"
                value={height}
                onChange={onHeightChange}
                onBlur={onBlur}
                onClick={(e) => e.stopPropagation()}
                className="w-16 h-full text-center bg-zinc-950/50 border-zinc-700 rounded-md text-sm"
                min="0.1"
                step="0.1"
              />
            </motion.div>
          ) : (
            <p className="text-xs text-zinc-500 group-hover:text-zinc-400">Enter custom ratio</p>
          )}
        </div>
      </div>
    </div>
  );
};
