"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Download, Share2, RotateCcw, Wand2, Square, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CanvasActionsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onDownload: (e?: React.MouseEvent) => void;
    onResetZoom?: () => void;
    onGenerativeFill?: (mode?: "rectangle" | "lasso", e?: React.MouseEvent) => void;
    isGenerativeFillActive?: boolean;
}

export const CanvasActions: React.FC<CanvasActionsProps> = ({
    onZoomIn,
    onZoomOut,
    onDownload,
    onResetZoom,
    onGenerativeFill,
    isGenerativeFillActive = false
}) => {
    const [isGenerativeFillExpanded, setIsGenerativeFillExpanded] = useState(false);

    // Sync with external active state
    React.useEffect(() => {
        if (!isGenerativeFillActive) {
            setIsGenerativeFillExpanded(false);
        }
    }, [isGenerativeFillActive]);

    const handleGenerativeFillClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isGenerativeFillExpanded) {
            // Close the expanded panel
            setIsGenerativeFillExpanded(false);
            onGenerativeFill?.(undefined, e);
        } else {
            // Open the expanded panel
            setIsGenerativeFillExpanded(true);
        }
    };

    const handleSelectionMode = (mode: "rectangle" | "lasso", e: React.MouseEvent) => {
        e.stopPropagation();
        // Close the expanded panel
        setIsGenerativeFillExpanded(false);
        // Pass the mode and event to parent
        onGenerativeFill?.(mode, e);
    };

    return (
        <TooltipProvider>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/80 rounded-xl p-2 flex items-center gap-1 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onZoomIn}
                            className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Zoom In</p>
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onZoomOut}
                            className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Zoom Out</p>
                    </TooltipContent>
                </Tooltip>

                {onResetZoom && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onResetZoom}
                                className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Reset Zoom</p>
                        </TooltipContent>
                    </Tooltip>
                )}

                <div className="w-px h-6 bg-zinc-700 mx-1"></div>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDownload(e);
                            }}
                            className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                        >
                            <Download className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Download</p>
                    </TooltipContent>
                </Tooltip>

                {onGenerativeFill && (
                    <>
                        <div className="w-px h-6 bg-zinc-700 mx-1"></div>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={isGenerativeFillExpanded ? "default" : "ghost"}
                                    size="sm"
                                    onClick={handleGenerativeFillClick}
                                    className={`h-8 w-8 p-0 ${
                                        isGenerativeFillExpanded
                                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                                            : "hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                                    }`}
                                    id="generative-fill-btn"
                                >
                                    <Wand2 className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="center">
                                <p>Generative Fill</p>
                            </TooltipContent>
                        </Tooltip>

                        {/* Expanded horizontal panel with selection tools */}
                        <AnimatePresence>
                            {isGenerativeFillExpanded && (
                                <motion.div
                                    initial={{ width: 0, opacity: 0 }}
                                    animate={{ width: "auto", opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex items-center gap-1 overflow-hidden"
                                >
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => handleSelectionMode("rectangle", e)}
                                                className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                                            >
                                                <Square className="w-4 h-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" align="center">
                                            <p>Rectangle Selection</p>
                                        </TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => handleSelectionMode("lasso", e)}
                                                className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" align="center">
                                            <p>Lasso Selection</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </motion.div>
        </TooltipProvider>
    );
};