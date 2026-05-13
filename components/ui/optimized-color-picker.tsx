import React, { useState, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';
import { cn } from '@/lib/utils';

interface OptimizedColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Optimized color picker using react-colorful library
 * Uses a proven, well-tested color picker with excellent performance
 */
export const OptimizedColorPicker: React.FC<OptimizedColorPickerProps> = ({
  value,
  onChange,
  className,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={pickerRef} className="relative">
      {/* Color preview button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "w-8 h-8 rounded border cursor-pointer",
          "transition-transform hover:scale-105",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        style={{ backgroundColor: value }}
      />

      {/* react-colorful picker popup */}
      {isOpen && (
        <div className="absolute z-50 mt-2 p-3 bg-white dark:bg-zinc-900 border border-border rounded-lg shadow-lg">
          <HexColorPicker color={value} onChange={onChange} />
          
          {/* Current color display */}
          <div className="flex items-center gap-2 text-[11px] mt-3">
            <div 
              className="w-6 h-6 rounded border"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono">{value.toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  );
};
