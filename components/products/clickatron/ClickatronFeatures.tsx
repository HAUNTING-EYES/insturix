"use client";

import React, { useRef } from "react";
import { easeInOut, motion, useScroll, useTransform } from "framer-motion";
import { Sparkles, Image, Edit, Palette, Layers, Cloud } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "Intelligent Prompt Engine",
    description:
      "Briefly describe the idea and watch AI expand it into multiple creative directions optimized for engagement.",
    gradient: "from-purple-400 to-fuchsia-500",
    delay: 0.1,
  },
  {
    icon: Image,
    title: "High-Fidelity Renders",
    description:
      "A reliable render pipeline produces crisp, high-contrast thumbnails tailored for attention and clarity.",
    gradient: "from-fuchsia-400 to-purple-400",
    delay: 0.2,
  },
  {
    icon: Edit,
    title: "Inline AI Editor",
    description:
      "Tweak faces, swap text, or recolor scenes without leaving the canvas using AI-assisted brushes.",
    gradient: "from-purple-500 to-fuchsia-400",
    delay: 0.3,
  },
  {
    icon: Palette,
    title: "Brand Palettes & Presets",
    description:
      "Lock in brand-safe typography, LUTs, and gradient systems so every export feels consistent.",
    gradient: "from-fuchsia-500 to-purple-300",
    delay: 0.4,
  },
  {
    icon: Layers,
    title: "Realtime Task Tracking",
    description:
      "Follow generation progress through Firebase streams and never wonder if a render stalled again.",
    gradient: "from-purple-400 to-fuchsia-400",
    delay: 0.5,
  },
  {
    icon: Cloud,
    title: "Cloud-Native Delivery",
    description:
      "Final assets are versioned in Google Cloud Storage and ready to sync with the Insturix dashboard.",
    gradient: "from-fuchsia-400 to-purple-500",
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

export default function ClickatronFeatures() {
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
        <motion.div
          style={{ y: y1 }}
          className="absolute inset-0 bg-gradient-to-r from-purple-800/10 via-transparent to-fuchsia-800/10 blur-3xl"
        />
        <motion.div
          style={{ y: y2 }}
          className="absolute top-1/2 left-1/2 w-96 h-96 bg-fuchsia-400/10 rounded-full blur-3xl"
        />
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-purple-500/50 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Powerful Features
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              Everything You Need to
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-200 bg-clip-text text-transparent">
              Stand Out Visually
            </span>
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto leading-relaxed">
            Clickatron is your AI-powered image and thumbnail studio. Generate,
            edit, and enhance visuals for your content in seconds.
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
              <div className="relative h-full p-8 rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 transition-all duration-300 group-hover:border-purple-500/50 group-hover:bg-white dark:group-hover:bg-neutral-900">
                {/* Icon */}
                <div
                  className={`inline-flex p-3 rounded-lg bg-gray-100 dark:bg-neutral-800 mb-6 border border-neutral-200 dark:border-neutral-700`}
                >
                  <feature.icon className="w-6 h-6 text-purple-500" />
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
        <motion.div variants={itemVariants} className="text-center mt-20">
          <div className="inline-flex items-center gap-4 px-6 py-3 rounded-md bg-gray-100/80 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="inline-flex"
            >
              <Image className="w-5 h-5 text-purple-500" />
            </motion.span>
            <span className="text-neutral-700 dark:text-neutral-300 font-medium">
              Ready to create your next viral thumbnail?
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
