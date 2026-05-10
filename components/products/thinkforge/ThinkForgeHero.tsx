"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Lightbulb, BrainCircuit } from "lucide-react";
import Link from "next/link";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.6,
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut" as any,
    },
  },
};

export default function ThinkForgeHero() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end start"],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, 500]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -500]);
  const y3 = useTransform(scrollYProgress, [0, 1], [0, 250]);

  return (
    <section ref={targetRef} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white dark:bg-black pt-16">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-neutral-100/10 dark:bg-grid-neutral-900/10 bg-[size:60px_60px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-transparent to-red-800/20 blur-3xl" />
        {/* Floating Elements */}
        <motion.div
          style={{ y: y1 }}
          className="absolute top-20 left-10 w-32 h-32 bg-red-500/20 rounded-full blur-3xl"
        />
        <motion.div
          style={{ y: y2 }}
          className="absolute top-40 right-20 w-48 h-48 bg-rose-400/20 rounded-full blur-3xl"
        />
        <motion.div
          style={{ y: y3 }}
          className="absolute bottom-20 left-1/4 w-40 h-40 bg-pink-500/20 rounded-full blur-3xl"
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 container mx-auto px-6 text-center"
      >
        {/* Badge */}
        <motion.div variants={itemVariants} className="mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Your creative sandbox for generating viral content ideas and scripts.
          </div>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          variants={itemVariants}
          className="text-[44px] md:text-7xl lg:text-8xl font-bold tracking-tight mb-6"
        >
          <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
            Ignite Your Creativity
          </span>
          <br />
          <span className="bg-gradient-to-r from-red-500 via-rose-400 to-pink-400 bg-clip-text text-transparent">
            With ThinkForge
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="text-lg md:text-[18px] text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto mb-8 leading-relaxed"
        >
          Brainstorm, refine, and script viral content ideas with AI-powered insights. Your journey to create viral content starts here.
        </motion.p>

        {/* Stats */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-12 text-sm text-neutral-700 dark:text-neutral-300"
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            <span>AI-Generated Ideas</span>
          </div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-red-500" />
            <span>Collaborative Brainstorming</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <span>Script Generation</span>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <Link href="/dashboard/thinkforge">
            <Button
              size="lg"
              className="bg-red-600 text-white hover:bg-red-700 border border-transparent px-8 py-3 text-lg font-semibold transition-colors duration-200"
            >
              Start Ideating
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </motion.div>

        {/* Demo Video Placeholder */}
        <motion.div
          variants={itemVariants}
          className="relative max-w-4xl mx-auto p-1 rounded-2xl border border-red-500/20 bg-gradient-to-br from-white/5 to-transparent"
        >
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-pink-400/10 flex items-center justify-center">
              <div className="text-center text-white">
                <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-70" />
                <p className="text-[18px] font-semibold">See ThinkForge in Action</p>
                <p className="text-sm opacity-60 mt-2">Your creative journey starts here</p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
} 