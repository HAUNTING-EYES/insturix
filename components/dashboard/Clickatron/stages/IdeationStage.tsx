"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Idea } from '@/types/clickatron';

interface IdeationStageProps {
  ideas: Idea[];
  onSelectIdea: (idea: Idea) => void;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as any
};

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export function IdeationStage({ ideas, onSelectIdea }: IdeationStageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!ideas || ideas.length === 0) {
    return (
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-8 text-center">
          <div className="inline-block mb-4">
            <Sparkles className="h-8 w-8 text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">
            Generating Ideas...
          </h2>
          <p className="text-zinc-400">
            The AI is warming up. Ideas will appear here shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-6 sm:p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold text-zinc-100 mb-3">
              Choose a Creative Direction
            </h2>
            <p className="text-zinc-400 text-lg">
              Which of these creative directions feels best for your thumbnail?
            </p>
          </div>

          <motion.div 
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="grid gap-4 sm:grid-cols-2"
          >
            {ideas.map((idea) => (
              <motion.div key={idea.id} variants={fadeIn}>
                <Card 
                  className={`group cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
                    selectedId === idea.id
                      ? 'bg-purple-500/20 border-purple-500/50 shadow-lg shadow-purple-500/20'
                      : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/80 hover:bg-zinc-900/60'
                  }`}
                  onClick={() => {
                    setSelectedId(idea.id);
                    onSelectIdea(idea);
                  }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">💡</div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-zinc-100 mb-2 group-hover:text-purple-200 transition-colors">
                          {idea.title}
                        </h3>
                        <p className="text-zinc-300 text-sm mb-3">
                          {idea.description}
                        </p>
                        <p className="text-zinc-400 text-xs">
                          <strong>Prompt:</strong> {idea.prompt}
                        </p>
                      </div>
                      <ArrowRight className={`h-5 w-5 transition-all duration-300 ${
                        selectedId === idea.id
                          ? 'text-purple-400 translate-x-1'
                          : 'text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-1'
                      }`} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <div className="text-center mt-8">
            <p className="text-zinc-500 text-sm">
              Click on a direction to generate your canvas.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}