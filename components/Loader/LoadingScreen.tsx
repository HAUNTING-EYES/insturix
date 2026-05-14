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
      <motion.img
        src="/brand/insturix_white.png"
        alt="Insturix"
        width={80}
        height={80}
        style={{ borderRadius: 8 }}
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1, 0.95] }}
        transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.h1
        className="loading-text"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
      >
        INSTURIX
      </motion.h1>
    </motion.div>
  );
};
