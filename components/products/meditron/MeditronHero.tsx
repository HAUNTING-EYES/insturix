"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Building, Video, ChartBar, HandCoins } from "lucide-react";
import LinkNext from "next/link";

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

export default function MeditronHero() {
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
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/20 via-transparent to-green-600/20 blur-3xl" />
        {/* Floating Elements */}
        <motion.div
          style={{ y: y1 }}
          className="absolute top-20 left-10 w-32 h-32 bg-green-400/20 rounded-full blur-3xl"
        />
        <motion.div
          style={{ y: y2 }}
          className="absolute top-40 right-20 w-48 h-48 bg-emerald-400/20 rounded-full blur-3xl"
        />
        <motion.div
          style={{ y: y3 }}
          className="absolute bottom-20 left-1/4 w-40 h-40 bg-green-200/20 rounded-full blur-3xl"
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300 text-sm font-medium">
            <HandCoins className="w-4 h-4" />
            Connect with brands. Grow your career. Get sponsored.
          </div>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          variants={itemVariants}
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6"
        >
          <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
            Elevate Your Content
          </span>
          <br />
          <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-green-200 bg-clip-text text-transparent">
            With Meditron
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="text-lg md:text-xl text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto mb-8 leading-relaxed"
        >
          A platform connecting creators and businesses for collaborations, sponsorships, and growth opportunities. Boost your career and monetize your influence.
        </motion.p>

        {/* Stats */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-12 text-sm text-neutral-700 dark:text-neutral-300"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-green-500" />
            <span>Creator-Business Matching</span>
          </div>
          <div className="flex items-center gap-2">
            <ChartBar className="w-4 h-4 text-emerald-500" />
            <span>Search Optimization</span>
          </div>
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-green-400" />
            <span>Transparent Payments</span>
          </div>
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-emerald-400" />
            <span>Growth Opportunities</span>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <LinkNext href="/dashboard/meditron">
            <Button
              size="lg"
              className="bg-green-500 text-white hover:bg-green-600 border border-transparent px-8 py-3 text-lg font-semibold transition-colors duration-200"
            >
              Start Connecting
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </LinkNext>
        </motion.div>

        {/* Demo Video Placeholder */}
        <motion.div
          variants={itemVariants}
          className="relative max-w-4xl mx-auto p-1 rounded-2xl border border-green-500/20 bg-gradient-to-br from-white/5 to-transparent"
        >
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 via-transparent to-emerald-400/10 flex items-center justify-center">
              <div className="text-center text-white">
                <HandCoins className="w-16 h-16 mx-auto mb-4 opacity-70" />
                <p className="text-xl font-semibold">See Meditron in Action</p>
                <p className="text-sm opacity-60 mt-2">Your creator-business hub</p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
} 