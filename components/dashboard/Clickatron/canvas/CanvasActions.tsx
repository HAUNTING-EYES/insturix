"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CanvasActionsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onDownload: () => void;
    onShare: () => void;
}

export const CanvasActions: React.FC<CanvasActionsProps> = ({
    onZoomIn,
    onZoomOut,
    onDownload,
    onShare
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-900/80 backdrop-blur-md border border-zinc-700/80 rounded-lg p-2 flex items-center gap-2 shadow-lg"
        >
            <Button variant="ghost" size="icon" onClick={onZoomIn}>
                <ZoomIn className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onZoomOut}>
                <ZoomOut className="w-5 h-5" />
            </Button>
            <div className="w-px h-6 bg-zinc-700 mx-1"></div>
            <Button variant="ghost" size="icon" onClick={onDownload}>
                <Download className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onShare}>
                <Share2 className="w-5 h-5" />
            </Button>
        </motion.div>
    );
};