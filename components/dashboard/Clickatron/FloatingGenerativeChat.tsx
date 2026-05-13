"use client";

import React, { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Wand2, Send, Sparkles, X, RotateCcw } from "lucide-react";

interface FloatingGenerativeChatProps {
  referenceImage?: {
    name: string;
    data: string;
  } | null;
  onGenerate: (prompt: string, settings: GenerativeSettings) => void;
  isGenerating?: boolean;
}

interface GenerativeSettings {
  referenceStrength: number;
}

const containerVariants = {
  collapsed: {
    paddingTop: "0.75rem",
    paddingBottom: "0.75rem",
    paddingLeft: "0.75rem",
    paddingRight: "0.75rem",
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
      padding: { duration: 0.3, ease: [0.4, 0.0, 0.2, 1] as const },
    },
  },
  expanded: {
    paddingTop: "1rem",
    paddingBottom: "1rem",
    paddingLeft: "1rem",
    paddingRight: "1rem",
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
      padding: { duration: 0.3, ease: [0.4, 0.0, 0.2, 1] as const },
    },
  },
};

const itemVariants = {
  collapsed: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
      ease: [0.4, 0.0, 0.2, 1] as const,
    },
  },
  expanded: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0.0, 0.2, 1] as const,
    },
  },
};

const headerVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.3, ease: [0.4, 0.0, 0.2, 1] as const },
      opacity: { duration: 0.2, ease: [0.4, 0.0, 0.2, 1] as const },
    },
  },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { duration: 0.3, ease: [0.4, 0.0, 0.2, 1] as const },
      opacity: { duration: 0.3, delay: 0.1, ease: [0.4, 0.0, 0.2, 1] as const },
    },
  },
};

export function FloatingGenerativeChat({
  referenceImage,
  onGenerate,
  isGenerating = false,
}: FloatingGenerativeChatProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<GenerativeSettings>({
    referenceStrength: 50,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isGenerating) return;

    onGenerate(prompt.trim(), settings);
    setPrompt("");
    setIsExpanded(false);
  }, [prompt, settings, onGenerate, isGenerating]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputFocus = () => {
    setIsExpanded(true);
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Only collapse if clicking outside the entire chat bubble
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (!prompt.trim()) {
        setIsExpanded(false);
      }
    }
  };

  return (
    <>
      {/* Minimal Chat Bubble */}
      <motion.div
        initial={{
          opacity: 0,
          y: 100,
          scale: 0.9,
        }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            opacity: {
              duration: 0.4,
              ease: [0.4, 0.0, 0.2, 1] as const,
              delay: 0.3,
            },
            y: {
              type: "spring",
              stiffness: 300,
              damping: 35,
              mass: 1,
              delay: 0.3,
            },
            scale: {
              type: "spring",
              stiffness: 300,
              damping: 35,
              mass: 1,
              delay: 0.3,
            },
          },
        }}
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50"
        onBlur={handleInputBlur}
      >
        <motion.div
          initial={{
            width: "min(95vw, 28rem)",
          }}
          animate={{
            width: isExpanded ? "min(95vw, 32rem)" : "min(95vw, 28rem)",
            transition: {
              duration: 0.3,
              ease: [0.4, 0.0, 0.2, 1] as const,
            },
          }}
        >
          <div className="bg-[#131312] border border-[#1C1B19] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
            {/* Header - Only show when expanded */}
            <motion.div
              variants={headerVariants}
              initial="collapsed"
              animate={isExpanded ? "expanded" : "collapsed"}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-[#1C1B19]/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#D4A652] rounded-full flex items-center justify-center">
                    <Wand2 className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-[#ECE9E1]">
                      AI Editor
                    </h3>
                    <p className="text-[11px] text-[#7A776E]">
                      Describe your changes
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-[#7A776E] hover:text-[#ECE9E1]"
                  onClick={() => setIsExpanded(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              variants={containerVariants}
              initial="collapsed"
              animate={isExpanded ? "expanded" : "collapsed"}
              className="p-4"
            >
              {/* Reference Image - Only show when expanded */}
              {referenceImage && (
                <motion.div
                  variants={itemVariants}
                  className="overflow-hidden"
                  style={{
                    display: isExpanded ? "block" : "none",
                    marginBottom: isExpanded ? "1rem" : "0",
                  }}
                >
                  <div className="flex items-center gap-3 p-3 bg-[#1B1A18]/30 rounded-lg">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#1B1A18]/50 flex-shrink-0">
                      <img
                        src={referenceImage.data}
                        alt="Reference"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-[#B5B2A8] truncate">
                        Reference: {referenceImage.name}
                      </p>
                      <p className="text-[11px] text-[#7A776E]">
                        Influencing generation
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Prompt Input */}
              <div className="relative flex items-center gap-2 bg-[#1B1A18] border border-[#1C1B19] rounded-xl p-2 shadow-lg">
                <input
                  ref={textareaRef as any}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  placeholder="AI Edit"
                  className="flex-1 bg-transparent border-0 px-2 py-2 text-[#ECE9E1] placeholder:text-[#7A776E] text-sm focus:outline-none"
                  disabled={isGenerating}
                />

                <Button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || isGenerating}
                  className="bg-[#D4A652] hover:bg-[#D4A652]/90 text-[#0B0B0A] h-8 w-8 p-0 rounded-lg shadow-md"
                  size="sm"
                >
                  {isGenerating ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    >
                      <Sparkles className="h-4 w-4" />
                    </motion.div>
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Advanced Settings (Expanded) - Only Reference Strength */}
              {referenceImage && (
                <div
                  className="transition-all duration-300 ease-out overflow-hidden border-t border-[#1C1B19]/50"
                  style={{
                    height: isExpanded ? "auto" : "0",
                    paddingTop: isExpanded ? "1rem" : "0",
                    marginTop: isExpanded ? "1rem" : "0",
                  }}
                >
                  <motion.div
                    variants={itemVariants}
                    className="space-y-4"
                    style={{
                      opacity: isExpanded ? 1 : 0,
                    }}
                  >
                    {/* Reference Strength */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[11px] text-[#B5B2A8]">
                          Reference Influence
                        </label>
                        <span className="text-[11px] text-[#7A776E]">
                          {settings.referenceStrength}%
                        </span>
                      </div>
                      <Slider
                        value={[settings.referenceStrength]}
                        onValueChange={([value]) =>
                          setSettings((prev) => ({
                            ...prev,
                            referenceStrength: value,
                          }))
                        }
                        min={0}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[11px] text-[#7A776E] mt-1">
                        <span>Subtle</span>
                        <span>Strong</span>
                      </div>
                    </div>

                    {/* Reset Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-[#282724] text-[#B5B2A8] hover:bg-[#1B1A18]/50"
                      onClick={() => setSettings({ referenceStrength: 50 })}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset Settings
                    </Button>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
