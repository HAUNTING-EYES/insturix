"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Zap, Shield, TrendingUp, CheckCircle, BarChart3, Brain } from "lucide-react";
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


import { useScroll, useTransform } from "framer-motion";

export default function AlyzitronHero() {
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
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-blue-800/20 blur-3xl" />
        
        {/* Floating Elements */}
        <motion.div
          style={{ y: y1 }}
          className="absolute top-20 left-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"
        />
        <motion.div
          style={{ y: y2 }}
          className="absolute top-40 right-20 w-48 h-48 bg-cyan-400/20 rounded-full blur-3xl"
        />
        <motion.div
          style={{ y: y3 }}
          className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm font-medium">
            <Zap className="w-4 h-4" />
            Pre-Publication Video Analysis
          </div>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          variants={itemVariants}
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6"
        >
          <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
            Perfect Your Video,
          </span>
          <br />
          <span className="bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Before You Publish
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="text-lg md:text-xl text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto mb-8 leading-relaxed"
        >
          Get AI-powered feedback to fix flaws, improve your script, and enhance content quality. Maximize your video's potential before it ever goes live.
        </motion.p>

        {/* Stats */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-12 text-sm text-neutral-700 dark:text-neutral-300"
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>Improvement Suggestions</span>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <span>In-depth Quality Scores</span>
          </div>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            <span>AI-Powered Feedback</span>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <Link href="/dashboard">
            <Button
              size="lg"
              className="bg-blue-600 text-white hover:bg-blue-700 border border-transparent px-8 py-3 text-lg font-semibold transition-colors duration-200"
            >
              Start Analyzing
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <Link href="http://localhost:3000/dashboard/alyzitron/report/6858308b4abf451df9c0fd18" passHref>
            <Button
              variant="outline"
              size="lg"
              className="border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 px-8 py-3 text-lg font-semibold transition-colors duration-200"
            >
              <BarChart3 className="mr-2 w-5 h-5" />
              Demo Report
            </Button>
          </Link>
        </motion.div>

        {/* Demo Video Placeholder */}
        <motion.div
          variants={itemVariants}
          className="relative max-w-4xl mx-auto p-1 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-white/5 to-transparent"
        >
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-blue-400/10 flex items-center justify-center">
              <div className="text-center text-white">
                <Play className="w-16 h-16 mx-auto mb-4 opacity-70" />
                <p className="text-xl font-semibold">Demo Video</p>
                <p className="text-sm opacity-60 mt-2">See Alyzitron in action</p>
              </div>
            </div>
            
            {/* Floating UI Elements Preview */}
            <div className="absolute top-4 left-4 bg-black/20 backdrop-blur-md rounded-lg p-3 text-white text-sm border border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Analyzing...</span>
              </div>
            </div>
            
            <div className="absolute bottom-4 right-4 bg-black/20 backdrop-blur-md rounded-lg p-3 text-white text-sm border border-white/10">
              <div className="text-xs opacity-70">Risk Score</div>
              <div className="text-lg font-bold text-cyan-400">2.3/10</div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}