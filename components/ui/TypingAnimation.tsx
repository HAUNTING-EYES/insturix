"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, memo } from "react";

interface TypingAnimationProps {
  messages: string[];
  textClass?: string;
  parentClass?: string;
  displayDuration?: number; // How long each message stays visible after entry animation (ms)
  characterDelay?: number; // Delay between each character appearing (ms)
  transitionDuration?: number; // Duration of character animation (ms)
  shouldLoop?: boolean;
  onComplete?: () => void;
}

const characterVariants = {
  hidden: {
    opacity: 0,
    y: 10,
    scale: 0.9,
    filter: "blur(4px)",
    transition: { duration: 0.15 },
  },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.15,
      delay: i * 0.02,
      ease: [0.2, 0.65, 0.3, 0.9] as any,
    },
  }),
  exit: (i: number) => ({
    opacity: 0,
    y: -20,
    scale: 0.9,
    filter: "blur(4px)",
    transition: {
      duration: 0.15,
      delay: i * 0.015,
      ease: [0.2, 0.65, 0.3, 0.9] as any,
    },
  }),
};

// Memoized character component for performance
const AnimatedCharacter = memo(
  ({ char, index }: { char: string; index: number }) => (
    <motion.span
      custom={index}
      variants={characterVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="inline-block origin-center"
      style={{
        willChange: "transform, opacity, filter",
        minWidth: char === " " ? "0.3em" : "auto",
      }}
    >
      {char}
    </motion.span>
  )
);
AnimatedCharacter.displayName = "AnimatedCharacter";

const AnimatedText = memo(({ text }: { text: string }) => {
  const words = text.split(" ");
  let globalCharIndex = 0;

  return (
    <span className="inline-flex flex-wrap justify-center items-end gap-x-[0.15em] gap-y-2">
      {words.map((word, wordIdx) => {
        const wordStart = globalCharIndex;
        globalCharIndex += word.length + (wordIdx !== words.length - 1 ? 1 : 0);

        return (
          <span
            key={`word-${wordIdx}`}
            className="inline-flex whitespace-nowrap"
          >
            {word.split("").map((char, idx) => (
              <AnimatedCharacter
                key={`${char}-${wordStart + idx}`}
                char={char}
                index={wordStart + idx}
              />
            ))}
            {wordIdx !== words.length - 1 && (
              <AnimatedCharacter
                key={`space-${wordStart + word.length}`}
                char=" "
                index={wordStart + word.length}
              />
            )}
          </span>
        );
      })}
    </span>
  );
});
AnimatedText.displayName = "AnimatedText";

export default function TypingAnimation({
  messages,
  textClass = "",
  parentClass = "",
  displayDuration = 3000,
  characterDelay = 40,
  transitionDuration = 350,
  shouldLoop = true,
  onComplete = () => {},
}: TypingAnimationProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  useEffect(() => {
    if (isTypingComplete && !shouldLoop) return;

    // Calculate total time for the current message
    const currentMessage = messages[currentMessageIndex];
    const typingDuration = currentMessage.length * characterDelay;
    const totalDuration = typingDuration + displayDuration;

    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => {
        const nextIndex = prev === messages.length - 1 ? 0 : prev + 1;
        if (nextIndex === 0 && !shouldLoop) {
          setIsTypingComplete(true);
          onComplete?.();
          return prev;
        }
        return nextIndex;
      });
    }, totalDuration);

    return () => clearInterval(interval);
  }, [
    isTypingComplete,
    messages,
    currentMessageIndex,
    characterDelay,
    displayDuration,
    shouldLoop,
    onComplete,
  ]);

  // Update the variant timing based on props
  useEffect(() => {
    characterVariants.hidden.transition.duration = transitionDuration / 1000;
    characterVariants.visible = (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        duration: transitionDuration / 1000,
        delay: i * (characterDelay / 1000),
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    });
    characterVariants.exit = (i: number) => ({
      opacity: 0,
      y: -20,
      scale: 0.9,
      filter: "blur(4px)",
      transition: {
        duration: transitionDuration / 1000,
        delay: i * ((characterDelay * 0.75) / 1000),
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    });
  }, [characterDelay, transitionDuration]);

  return (
    <div
      className={`relative h-auto flex items-end justify-center overflow-hidden ${parentClass}`}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={currentMessageIndex}
          className={textClass}
          style={{
            lineHeight: 1.2,
            maxWidth: "100%",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            minHeight: "2.4em",
            height: "auto",
            willChange: "transform",
          }}
        >
          <AnimatedText text={messages[currentMessageIndex]} />
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
