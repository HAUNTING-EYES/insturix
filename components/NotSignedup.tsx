"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function NotSignedIn() {
  const router = useRouter();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleSignUp = () => {
    router.push("/signup");
  };

  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FED766", "#2AB7CA"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 text-white flex flex-col items-center justify-center p-4 overflow-hidden">
      {colors.map((color, index) => (
        <motion.div
          key={color}
          className="absolute rounded-full mix-blend-multiply filter blur-xl opacity-70"
          animate={{
            scale: [1, 1.2, 1],
            x: mousePosition.x / (index + 1) - 150,
            y: mousePosition.y / (index + 1) - 150,
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            repeatType: "reverse",
          }}
          style={{
            backgroundColor: color,
            height: "300px",
            width: "300px",
            top: `${index * 15}%`,
            left: `${index * 15}%`,
          }}
        />
      ))}
      <div className="relative w-full max-w-2xl mx-auto text-center z-10">
        <motion.h1
          className="text-8xl font-bold mb-8 tracking-tighter"
          animate={{ rotate: [0, -5, 5, -5, 0] }}
          transition={{ duration: 5, repeat: Infinity }}
        >
          NOT SIGNED UP
        </motion.h1>
        <motion.div
          className="h-2 bg-white w-full mb-8"
          animate={{ scaleX: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.p
          className="text-3xl mb-12 font-extrabold"
          animate={{
            color: colors,
            textShadow: colors.map((c) => `0 0 5px ${c}`),
          }}
          transition={{ duration: 5, repeat: Infinity }}
        >
          Oops! You&apos;re not in the cool club yet!
        </motion.p>
        <Button
          onClick={handleSignUp}
          className="bg-white text-black hover:bg-gray-200 text-2xl py-6 px-12 rounded-full transition-all duration-300 ease-in-out transform hover:scale-110 hover:rotate-3 shadow-lg"
        >
          Join the Party!
        </Button>
      </div>
      <motion.div
        className="absolute bottom-0 left-0 w-full h-4 bg-white"
        animate={{ scaleX: [0, 1, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
      />
      <motion.div
        className="absolute top-0 right-0 w-4 h-full bg-white"
        animate={{ scaleY: [0, 1, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
      />
    </div>
  );
}
