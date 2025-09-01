"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RectangleHorizontal, Crop, ChevronDown } from 'lucide-react';

const aspectRatios = [
    { name: 'Square', ratio: '1:1', value: '1:1' },
    { name: 'Portrait', ratio: '4:5', value: '4:5' },
    { name: 'Vertical', ratio: '9:16', value: '9:16' },
    { name: 'Landscape', ratio: '16:9', value: '16:9' },
    { name: 'Widescreen', ratio: '1.85:1', value: '1.85:1' },
    { name: 'CinemaScope', ratio: '2.39:1', value: '2.39:1' },
];

interface AspectRatioSelectorProps {
    value: string;
    onChange: (value: string) => void;
}

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isCustom, setIsCustom] = useState(false);
    const [customWidth, setCustomWidth] = useState(16);
    const [customHeight, setCustomHeight] = useState(9);

    const selectedOption = aspectRatios.find(ar => ar.value === value);

    useEffect(() => {
        if (!selectedOption) {
            setIsCustom(true);
            // If value is a string like 'W:H' try to parse into width/height for the inputs
            if (typeof value === 'string' && value.includes(':')) {
                const parts = value.split(':').map(p => parseInt(p, 10));
                if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
                    setCustomWidth(parts[0]);
                    setCustomHeight(parts[1]);
                }
            }
        } else {
            setIsCustom(false);
        }
    }, [value, selectedOption]);


    const handleCustomChange = () => {
        if (customWidth > 0 && customHeight > 0) {
            onChange(`${customWidth}:${customHeight}`);
        }
    };

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
                <div className="flex items-center">
                    <RectangleHorizontal className="w-4 h-4 mr-2" />
                    <span>{selectedOption ? `${selectedOption.name} (${selectedOption.ratio})` : 'Custom'}</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg"
                    >
                        {aspectRatios.map(ar => (
                            <div
                                key={ar.name}
                                onClick={() => {
                                    onChange(ar.value);
                                    setIsOpen(false);
                                    setIsCustom(false);
                                }}
                                className="px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 cursor-pointer flex justify-between items-center"
                            >
                                <span>{ar.name}</span>
                                <span className="text-zinc-500">{ar.ratio}</span>
                            </div>
                        ))}
                        <div
                            onClick={() => {
                                setIsCustom(true);
                                setIsOpen(false);
                            }}
                            className="px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 cursor-pointer flex items-center"
                        >
                            <Crop className="w-4 h-4 mr-2" />
                            <span>Custom</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {isCustom && (
                <div className="mt-2 flex items-center gap-2">
                    <input
                        type="number"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(parseInt(e.target.value, 10))}
                        onBlur={handleCustomChange}
                        className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-sm"
                        placeholder="Width"
                    />
                    <span className="text-zinc-500">:</span>
                    <input
                        type="number"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(parseInt(e.target.value, 10))}
                        onBlur={handleCustomChange}
                        className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-sm"
                        placeholder="Height"
                    />
                </div>
            )}
        </div>
    );
};
