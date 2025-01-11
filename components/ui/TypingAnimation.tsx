"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export default function TypingAnimation({ text }: { text: string }) {
  const [typedText, setTypedText] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const messages = [
    "Automate Your Workflow",
    "Monetize Your Content",
    "Protect Your Creative Work",
    "Connect with Brands",
    "Level Up Your Content Creation Game"
  ];
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  useEffect(() => {
    let currentIndex = 0;
    let messageIndex = 0;
    let timeoutId: NodeJS.Timeout;

    const typeText = () => {
      const currentMessage = messages[messageIndex];
      const typingSpeed = 100;
      const messageDelay = 1500;

      if (currentIndex <= currentMessage.length) {
        setTypedText(currentMessage.slice(0, currentIndex));
        currentIndex++;
        timeoutId = setTimeout(typeText, typingSpeed);
      } else {
        if (messageIndex < messages.length - 1) {
          timeoutId = setTimeout(() => {
            setIsVisible(false); // Start fade-out
            timeoutId = setTimeout(() => {
              messageIndex++;
              setCurrentMessageIndex(messageIndex);
              currentIndex = 0;
              setTypedText("");
              setIsVisible(true); // Start fade-in
              timeoutId = setTimeout(typeText, typingSpeed);
            }, 500); // Wait for fade-out to complete
          }, messageDelay);
        } else {
          setIsTypingComplete(true);
        }
      }
    };

    timeoutId = setTimeout(typeText, 500);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.h1
        key={currentMessageIndex}
        className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl text-foreground min-h-[1.2em]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : -20 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      >
        {typedText}
        {!isTypingComplete && (
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            className="inline-block w-[4px] h-[1em] ml-1 align-middle bg-primary"
          />
        )}
      </motion.h1>
    </AnimatePresence>
  );
}
