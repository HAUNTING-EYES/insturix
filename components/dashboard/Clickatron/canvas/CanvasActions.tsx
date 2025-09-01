"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Download, Share2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CanvasActionsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onDownload: () => void;
    onShare: () => void;
    onResetZoom?: () => void;
}

export const CanvasActions: React.FC<CanvasActionsProps> = ({
    onZoomIn,
    onZoomOut,
    onDownload,
    onShare,
    onResetZoom
}) => {
    return (
        <TooltipProvider>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/80 rounded-xl p-2 flex items-center gap-1 shadow-2xl"
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
                            onClick={onDownload}
                            className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                        >
                            <Download className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Download</p>
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={onShare}
                            className="h-8 w-8 p-0 hover:bg-zinc-700/50 text-zinc-300 hover:text-white"
                        >
                            <Share2 className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Share</p>
                    </TooltipContent>
                </Tooltip>
            </motion.div>
        </TooltipProvider>
    );
};