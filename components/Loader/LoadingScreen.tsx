"use client";
import { motion } from "framer-motion";
import "./loading.css";

export const LoadingScreen = () => {
  return (
    <motion.div
      className="loading-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="loading-square"
        animate={{
          rotate: [0, 90, 180, 270, 360],
          scale: [1, 1.2, 1],
        }}
        transition={{
          rotate: {
            duration: 1.5,
            ease: "linear",
            repeat: Infinity,
          },
          scale: {
            duration: 0.75,
            ease: "easeInOut",
            repeat: Infinity,
          },
        }}
      />
      <motion.h1
        className="loading-text"
        animate={{
          opacity: [1, 0.3, 1],
        }}
        transition={{
          duration: 1.5,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      >
        INSTURIX
      </motion.h1>
    </motion.div>
  );
};
