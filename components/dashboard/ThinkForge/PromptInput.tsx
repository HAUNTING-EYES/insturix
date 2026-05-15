"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Plus, Lightbulb } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CustomIdeaForm from "./CustomIdeaForm";
import { Idea } from "@/app/dashboard/thinkforge/types";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  onCustomIdeaSubmit: (idea: Idea) => void;
  loading?: boolean;
}

export default function PromptInput({ onSubmit, onCustomIdeaSubmit, loading = false }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Array of rotating placeholders
  const placeholders = [
    "A viral video idea about sustainable living tips...",
    "A blog post that explains AI technology simply...",
    "A marketing slogan for a fitness app...",
    "A social media caption for a travel photo...",
    "A YouTube thumbnail title about cooking hacks...",
    "A product description for handmade jewelry...",
    "A podcast episode about entrepreneurship...",
    "A newsletter subject line for tech updates...",
    "An Instagram story idea for a coffee shop...",
    "A TikTok trend concept for dance moves...",
    "A LinkedIn post about career growth...",
    "A Twitter thread about productivity tips..."
  ];

  // Rotate placeholders every 3 seconds with animation
  useEffect(() => {
    if (loading) return; // Don't rotate when loading
    
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [loading, placeholders.length]);

  const handleSubmit = () => {
    if (!prompt.trim() || loading) return;
    onSubmit(prompt.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCustomIdeaSubmit = (idea: Idea) => {
    onCustomIdeaSubmit(idea);
  };

  if (showCustomForm) {
    return (
      <CustomIdeaForm
        onSubmit={handleCustomIdeaSubmit}
        onGoBack={() => setShowCustomForm(false)}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-[#0B0B0A] border-[#1C1B19] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-[#ECE9E1] flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#D4A652]" />
            Start Your Creative Journey
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Option Tabs */}
          <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
            <Button
              variant="ghost"
              className="flex-1 bg-[#D4A652]/20 text-[#D4A652] hover:bg-[#D4A652]/30"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              AI-Generated Ideas
            </Button>
            <Button
              onClick={() => setShowCustomForm(true)}
              variant="ghost"
              className="hidden md:flex flex-1 text-[#7A776E] hover:text-[#B5B2A8] hover:bg-[#1C1B19]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your Own
            </Button>
          </div>

          {/* AI Generation Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#B5B2A8]">
                Describe your content idea
              </label>
              <div className="relative">
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="" // Hide default placeholder
                  className="bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:ring-2 focus:ring-[#D4A652]"
                  disabled={loading}
                />
                {/* Animated placeholder overlay */}
                {!prompt && (
                  <div className="absolute inset-0 pointer-events-none flex items-center px-3">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={placeholderIndex}
                        initial={{ 
                          opacity: 0, 
                          rotateX: -15,
                          y: -5
                        }}
                        animate={{ 
                          opacity: 1, 
                          rotateX: 0,
                          y: 0
                        }}
                        exit={{ 
                          opacity: 0, 
                          rotateX: 15,
                          y: 5
                        }}
                        transition={{ 
                          duration: 0.5, 
                          ease: "easeInOut",
                          type: "spring",
                          stiffness: 100
                        }}
                        className="text-[#5F5E5A] text-sm select-none truncate"
                        style={{ perspective: 1000 }}
                      >
                        {placeholders[placeholderIndex]}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim() || loading}
              className="w-full bg-[#D4A652] hover:bg-[#D4A652] text-white font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Ideas...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Ideas
                </>
              )}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[#282724]" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-[#0B0B0A] px-2 text-[#5F5E5A]">Or</span>
            </div>
          </div>

          {/* Custom Idea Button */}
          <Button
            onClick={() => setShowCustomForm(true)}
            variant="outline"
            className="w-full border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Your Own Idea
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
} 