"use client";

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { VideoIdeaInput } from './VideoIdeaInput';
import { ClickatronLab } from './ClickatronLab';
import { ClickatronHistory } from './ClickatronHistory';
import { CanvasPreset } from '@/stores/useCanvasStore';

export interface InitialTaskData {
  videoIdea: string;
  selectedPreset: CanvasPreset;
}

export function ClickatronLayout() {
  const [taskData, setTaskData] = useState<InitialTaskData | null>(null);

  const handleIdeaSubmit = (data: InitialTaskData) => {
    setTaskData(data);
  };

  const handleReset = () => {
    setTaskData(null);
  };

  return (
    <div className="space-y-8">
      <AnimatePresence mode="wait">
        {!taskData ? (
          <motion.div key="idea-input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <VideoIdeaInput onSubmit={handleIdeaSubmit} />
          </motion.div>
        ) : (
          <motion.div key="lab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ClickatronLab
              initialTaskData={taskData}
              onReset={handleReset}
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      <ClickatronHistory />
    </div>
  );
}