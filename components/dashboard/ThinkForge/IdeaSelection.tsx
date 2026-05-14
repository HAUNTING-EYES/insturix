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
            <h2 className="text-[18px] font-semibold text-[#ECE9E1] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#D4A652]" />
              Generated Ideas
            </h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-[#7A776E] hover:text-[#B5B2A8]"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <div className="space-y-2">
                    <p className="font-medium">Six Thinking Hats</p>
                    <p className="text-sm text-[#B5B2A8]">
                      Each idea uses a different thinking approach:
                    </p>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-white border border-gray-300"></div>
                        <span><strong>White:</strong> Facts & data</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#D4A652]"></div>
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
          <p className="text-sm text-[#7A776E] mt-1">
            Based on: "{prompt}"
          </p>
        </div>
        <Button
          onClick={onShuffle}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19]"
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
                className="bg-[#0B0B0A] border-[#1C1B19] backdrop-blur-xl hover:border-[#282724] transition-all cursor-pointer group"
                onClick={() => onSelectIdea(idea)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-[14px] font-medium text-[#ECE9E1] group-hover:text-[#D4A652] transition-colors">
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
                      <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Purpose</span>
                      <p className="text-sm text-[#B5B2A8]">{idea.purpose}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Style</span>
                      <p className="text-sm text-[#B5B2A8]">{idea.style}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Format</span>
                      <p className="text-sm text-[#B5B2A8]">{idea.format}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-[#5F5E5A] uppercase tracking-wide">Platform</span>
                      <p className="text-sm text-[#B5B2A8]">{idea.platform}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#1C1B19]">
                    <p className="text-[11px] text-[#5F5E5A]">
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
            <Loader2 className="h-8 w-8 animate-spin text-[#D4A652] mx-auto mb-4" />
            <p className="text-[#7A776E]">Generating fresh ideas...</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
} 