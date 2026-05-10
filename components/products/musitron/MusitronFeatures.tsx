"use client";

import React, { useRef } from "react";
import { easeInOut, motion, useScroll, useTransform } from "framer-motion";
import { Music, PenTool, List, Radio, Download, Sparkles } from "lucide-react";

const features = [
  {
    icon: Music,
    title: "AI Music Generation",
    description: "Generate unique music tracks using advanced AI algorithms across multiple genres.",
    gradient: "from-amber-400 to-yellow-500",
    delay: 0.1,
  },
  {
    icon: PenTool,
    title: "Lyrics Integration",
    description: "Add your own lyrics to generate personalized songs with matching melodies.",
    gradient: "from-yellow-400 to-amber-400",
    delay: 0.2,
  },
  {
    icon: List,
    title: "Genre Selection",
    description: "Choose from various music genres including pop, rock, classical, jazz, and more.",
    gradient: "from-yellow-500 to-amber-300",
    delay: 0.3,
  },
  {
    icon: Radio,
    title: "Custom Instruments",
    description: "Select and mix different instruments to create your perfect sound.",
    gradient: "from-amber-400 to-yellow-400",
    delay: 0.4,
  },
  {
    icon: Download,
    title: "Export Options",
    description: "Download your creations in multiple formats with professional quality.",
    gradient: "from-yellow-400 to-amber-400",
    delay: 0.5,
  },
  {
    icon: Sparkles,
    title: "Royalty-Free & Copyright-Free",
    description: "Use your generated music anywhere, no copyright worries, ever.",
    gradient: "from-yellow-400 to-amber-300",
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

export default function MusitronFeatures() {
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
        <motion.div style={{ y: y1 }} className="absolute inset-0 bg-gradient-to-r from-amber-800/10 via-transparent to-yellow-800/10 blur-3xl" />
        <motion.div style={{ y: y2 }} className="absolute top-1/2 left-1/2 w-96 h-96 bg-yellow-400/10 rounded-full blur-3xl" />
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-medium mb-6">
            <Music className="w-4 h-4" />
            Powerful Features
          </div>
          <h2 className="text-[44px] md:text-[110px] font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              Everything You Need to
            </span>
            <br />
            <span className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-200 bg-clip-text text-transparent">
              Make Music Instantly
            </span>
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto leading-relaxed">
            Musitron is your AI-powered music studio. Generate, customize, and use royalty-free music for any project, anywhere.
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
              <div className="relative h-full p-8 rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 transition-all duration-300 group-hover:border-amber-500/50 group-hover:bg-white dark:group-hover:bg-neutral-900">
                {/* Icon */}
                <div className={`inline-flex p-3 rounded-lg bg-gray-100 dark:bg-neutral-800 mb-6 border border-neutral-200 dark:border-neutral-700`}>
                  <feature.icon className="w-6 h-6 text-amber-500" />
                </div>
                {/* Content */}
                <h3 className="text-[18px] font-bold text-neutral-900 dark:text-white mb-4">
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
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="inline-flex"
            >
              <Music className="w-5 h-5 text-amber-500" />
            </motion.span>
            <span className="text-neutral-700 dark:text-neutral-300 font-medium">
              Ready to create your next soundtrack?
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
} 