"use client";

import React, { useRef } from "react";
import { easeInOut } from "framer-motion";
import { motion } from "framer-motion";
import { Shield, Zap, Eye, Brain, Target, AlertTriangle, BarChart3 } from "lucide-react";
import { useScroll, useTransform } from "framer-motion";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Feedback",
    description: "Receive a detailed list of strengths and areas for improvement, helping you refine your content before publishing.",
    gradient: "from-blue-500 to-blue-600",
    delay: 0.1,
  },
  {
    icon: BarChart3,
    title: "Comprehensive Scoring",
    description: "Get detailed scores on content quality, pacing, originality, technical quality, and more to understand your video's potential.",
    gradient: "from-blue-400 to-blue-500",
    delay: 0.2,
  },
  {
    icon: Eye,
    title: "Actionable Suggestions",
    description: "Get concrete suggestions for improving your title, description, script, and even your delivery.",
    gradient: "from-blue-500 to-cyan-500",
    delay: 0.3,
  },
  {
    icon: Target,
    title: "Target Audience Analysis",
    description: "Understand who your video will appeal to and get suggestions on how to better target your desired audience.",
    gradient: "from-blue-600 to-blue-500",
    delay: 0.4,
  },
  {
    icon: Shield,
    title: "Compliance & Risk Check",
    description: "A quick check for potential copyright issues and community guideline compliance to keep your channel safe.",
    gradient: "from-blue-500 to-blue-400",
    delay: 0.5,
  },
  {
    icon: Zap,
    title: "Instant Analysis",
    description: "Get your detailed analysis in minutes, so you can quickly iterate and improve your content.",
    gradient: "from-blue-400 to-blue-600",
    delay: 0.6,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.6,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: easeInOut,
    },
  },
};


export default function AlyzitronFeatures() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [-200, 200]);
  const y2 = useTransform(scrollYProgress, [0, 1], [100, -100]);

  return (
    <section ref={targetRef} className="relative py-32 bg-white dark:bg-black">
      {/* Background Pattern */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-neutral-100/5 dark:bg-grid-neutral-900/5 bg-[size:40px_40px]" />
        <motion.div style={{ y: y1 }} className="absolute inset-0 bg-gradient-to-r from-blue-800/10 via-transparent to-cyan-800/10 blur-3xl" />
        <motion.div style={{ y: y2 }} className="absolute top-1/2 left-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="relative z-10 container mx-auto px-6"
      >
        {/* Section Header */}
        <motion.div variants={itemVariants} className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
            <AlertTriangle className="w-4 h-4" />
            Powerful Features
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              Everything You Need to
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
              Optimize Your Content
            </span>
          </h2>
          
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto leading-relaxed">
            Comprehensive video analysis powered by cutting-edge AI technology.
            Get actionable insights that drive real results for your YouTube channel.
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group relative"
            >
              <div className="relative h-full p-8 rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 transition-all duration-300 group-hover:border-blue-500/50 group-hover:bg-white dark:group-hover:bg-neutral-900">
                {/* Icon */}
                <div className={`inline-flex p-3 rounded-lg bg-gray-100 dark:bg-neutral-800 mb-6 border border-neutral-200 dark:border-neutral-700`}>
                  <feature.icon className="w-6 h-6 text-blue-500" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-4">
                  {feature.title}
                </h3>
                
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          variants={itemVariants}
          className="text-center mt-20"
        >
          <div className="inline-flex items-center gap-4 px-6 py-3 rounded-md bg-gray-100/80 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800">
            <Zap className="w-5 h-5 text-blue-500" />
            <span className="text-neutral-700 dark:text-neutral-300 font-medium">
              Ready to analyze your first video?
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}