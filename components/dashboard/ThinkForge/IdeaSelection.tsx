"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shuffle, Sparkles, Loader2, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Idea } from "@/app/dashboard/thinkforge/types";
import { getToneBadgeColor, getToneDescription } from "@/app/dashboard/thinkforge/utils/toneUtils";
import { getToneColorClass } from "@/lib/thinkforge/tone";

interface IdeaSelectionProps {
  ideas: Idea[];
  onSelectIdea: (idea: Idea) => void;
  onShuffle: () => void;
  loading?: boolean;
  prompt: string;
}

export default function IdeaSelection({ 
  ideas, 
  onSelectIdea, 
  onShuffle, 
  loading = false,
  prompt 
}: IdeaSelectionProps) {

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-red-500" />
              Generated Ideas
            </h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-300"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <div className="space-y-2">
                    <p className="font-medium">Six Thinking Hats</p>
                    <p className="text-sm text-zinc-300">
                      Each idea uses a different thinking approach:
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-white border border-gray-300"></div>
                        <span><strong>White:</strong> Facts & data</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span><strong>Red:</strong> Emotions & feelings</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-black"></div>
                        <span><strong>Black:</strong> Caution & risks</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <span><strong>Yellow:</strong> Optimism & benefits</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span><strong>Green:</strong> Creativity & new ideas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span><strong>Blue:</strong> Process & organization</span>
                      </div>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Based on: "{prompt}"
          </p>
        </div>
        <Button
          onClick={onShuffle}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Shuffle className="h-4 w-4" />
          )}
          <span className="ml-2">Shuffle</span>
        </Button>
      </div>

      {/* Ideas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="wait">
          {ideas.map((idea, index) => (
            <motion.div
              key={idea.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ 
                duration: 0.3, 
                delay: index * 0.1 
              }}
            >
              <Card 
                className="bg-black/40 border-zinc-800 backdrop-blur-xl hover:border-zinc-700 transition-all cursor-pointer group"
                onClick={() => onSelectIdea(idea)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-medium text-zinc-100 group-hover:text-red-400 transition-colors">
                      {idea.idea}
                    </CardTitle>
                    <div 
                      className={`w-3 h-3 rounded-full flex-shrink-0 ml-2 ${getToneColorClass(idea.tone)}`}
                      title={getToneDescription(idea.tone)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Purpose</span>
                      <p className="text-sm text-zinc-300">{idea.purpose}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Style</span>
                      <p className="text-sm text-zinc-300">{idea.style}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Format</span>
                      <p className="text-sm text-zinc-300">{idea.format}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Platform</span>
                      <p className="text-sm text-zinc-300">{idea.platform}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500">
                      {getToneDescription(idea.tone)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Loading State */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-8"
        >
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-red-500 mx-auto mb-4" />
            <p className="text-zinc-400">Generating fresh ideas...</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
} 