"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, memo } from "react";
const parentVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.2 } },
};

interface TypingAnimationProps {
  messages: string[];
  textClass?: string;
  parentClass?: string;
  displayDuration?: number; // How long each message stays visible after entry animation (ms)
  characterDelay?: number; // Delay between each character appearing (ms)
  transitionDuration?: number; // Duration of character animation (ms)
  shouldLoop?: boolean;
  onComplete?: () => void;
  showCaret?: boolean; // Show blinking caret at the end
  caretClass?: string; // Tailwind classes for caret
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
  ({ char, index, setCharRef }: { char: string; index: number; setCharRef?: (i: number, el: HTMLElement | null) => void }) => (
    <motion.span
      ref={(el) => setCharRef?.(index, el)}
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

const AnimatedText = memo(({ text, setCharRef }: { text: string; setCharRef?: (i: number, el: HTMLElement | null) => void }) => {
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
                setCharRef={setCharRef}
              />
            ))}
            {wordIdx !== words.length - 1 && (
              <AnimatedCharacter
                key={`space-${wordStart + word.length}`}
                char=" "
                index={wordStart + word.length}
                setCharRef={setCharRef}
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
  showCaret = false,
  caretClass = "ml-2 inline-block h-[0.9em] w-[2px] bg-white/70",
}: TypingAnimationProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const lastAdvanceAtRef = useRef<number>(Date.now());
  const [typedIndex, setTypedIndex] = useState(0);
  const [isTypingPhase, setIsTypingPhase] = useState(true);
  const messageStartAtRef = useRef<number>(Date.now());
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const charRefs = useRef<(HTMLElement | null)[]>([]);

  const setCharRef = (i: number, el: HTMLElement | null) => {
    charRefs.current[i] = el;
  };

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    if (isTypingComplete && !shouldLoop) return;

    const currentMessage = messages[currentMessageIndex];
    const safeCharDelay = Number.isFinite(characterDelay) ? characterDelay : 40;
    const safeDisplay = Number.isFinite(displayDuration) ? displayDuration : 3000;
    const typingDuration = Math.max(0, currentMessage?.length ?? 0) * safeCharDelay;
    const totalDuration = Math.max(800, typingDuration + safeDisplay);

    // Reset caret and refs for new message
    charRefs.current = [];
    messageStartAtRef.current = Date.now();
    setIsTypingPhase(true);
    setTypedIndex(0);

    // During typing phase, update typedIndex based on time elapsed
    const caretInterval = window.setInterval(() => {
      const elapsed = Date.now() - messageStartAtRef.current;
      const idx = Math.min(currentMessage?.length ?? 0, Math.floor(elapsed / safeCharDelay));
      setTypedIndex(idx);
      if (elapsed >= typingDuration) {
        setIsTypingPhase(false);
      }
    }, Math.max(16, Math.floor(safeCharDelay / 2)));

    const timeoutId = window.setTimeout(() => {
      setCurrentMessageIndex((prev) => {
        const isLast = prev >= messages.length - 1;
        if (isLast) {
          if (shouldLoop) return 0;
          setIsTypingComplete(true);
          onComplete?.();
          return prev;
        }
        return prev + 1;
      });
      lastAdvanceAtRef.current = Date.now();
    }, totalDuration);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(caretInterval);
    };
  }, [
    currentMessageIndex,
    messages,
    characterDelay,
    displayDuration,
    shouldLoop,
    onComplete,
    isTypingComplete,
  ]);

  // Watchdog to prevent stall: if no advance in ~6s, force next message
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - lastAdvanceAtRef.current;
      if (elapsed > 6000) {
        setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
        lastAdvanceAtRef.current = Date.now();
      }
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [messages]);

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
          variants={parentVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className={`${textClass} relative`}
          ref={wrapperRef}
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
          <AnimatedText text={messages[currentMessageIndex]} setCharRef={setCharRef} />
          {showCaret && (() => {
            const i = Math.max(0, Math.min(typedIndex - 1, charRefs.current.length - 1));
            const charEl = charRefs.current[i] ?? null;
            const wrapperEl = wrapperRef.current;
            let style: any = { opacity: 0 };
            if (charEl && wrapperEl) {
              const c = charEl.getBoundingClientRect();
              const w = wrapperEl.getBoundingClientRect();
              style = {
                left: c.right - w.left,
                top: c.top - w.top,
                height: '0.95em',
                opacity: 1,
              };
            }
            return (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute w-[2px] bg-white/80"
                style={style}
                animate={isTypingPhase ? { opacity: [0.6, 1, 0.6] } : { opacity: [0.3, 1, 0.3] }}
                transition={{ duration: isTypingPhase ? 0.8 : 1.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            );
          })()}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
