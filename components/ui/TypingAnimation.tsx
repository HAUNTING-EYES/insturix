"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function TypingAnimation() {
  const [typedText, setTypedText] = useState("");
  const fullText = "Level Up Your Content Creation Game";

  useEffect(() => {
    let isTyping = true;
    let i = 0;

    const typeText = () => {
      if (isTyping) {
        if (i < fullText.length) {
          setTypedText(fullText.slice(0, i + 1));
          i++;
        } else {
          isTyping = false;
        }
      } else {
        if (i > 0) {
          setTypedText(fullText.slice(0, i - 1));
          i--;
        } else {
          isTyping = true;
        }
      }
    };

    const intervalId = setInterval(typeText, 100);

    return () => clearInterval(intervalId);
  }, []);

  const sentenceAnimation = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delay: 0.5,
        staggerChildren: 0.08,
      },
    },
  };
  return (
    <motion.h1
      className="text-6xl sm:text-6xl font-bold mb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent"
      initial="hidden"
      animate="visible"
      variants={sentenceAnimation}
    >
      {typedText}
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="text-7xl sm:text-6xl font-bold mb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent"
      >
        |
      </motion.span>
    </motion.h1>
  );
}
