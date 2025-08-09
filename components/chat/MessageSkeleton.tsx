import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";

const loadingMessages = [
  "ForgeAI is thinking...",
  "Analyzing your request...", 
  "Crafting a response...",
  "Generating insights...",
  "Processing ideas...",
];

export default function MessageSkeleton() {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [dots, setDots] = useState("");

  // Rotate through loading messages
  useEffect(() => {
    const messageInterval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 3000); // Slower rotation for less distraction

    return () => clearInterval(messageInterval);
  }, []);

  // Animate typing dots
  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 600); // Slightly slower for smoother feel

    return () => clearInterval(dotInterval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="flex justify-start"
    >
      <div className="relative flex max-w-[80%]">
        {/* Red accent line - matching chat bubble style */}
        <div className="w-1 rounded-r bg-red-500" />
        
        {/* Main content container */}
        <div className="flex-1 rounded-r-lg rounded-t-lg p-4 bg-zinc-800/80 backdrop-blur border border-zinc-700/50">
          <div className="flex items-center gap-3">
            {/* Simplified AI Avatar */}
            <div className="flex-shrink-0 relative">
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  opacity: [0.7, 1, 0.7]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="p-1"
              >
                <BrainCircuit className="h-5 w-5 text-red-500" />
              </motion.div>
            </div>

            {/* Loading message with dots */}
            <div className="flex items-center gap-1">
              <motion.span
                key={currentMessageIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-sm text-zinc-300"
              >
                {loadingMessages[currentMessageIndex]}
              </motion.span>
              <span className="text-sm text-zinc-400 font-mono w-4">
                {dots}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
} 