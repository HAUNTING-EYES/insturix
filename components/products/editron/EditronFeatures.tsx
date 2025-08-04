"use client";

import React, { useRef } from "react";
import { easeInOut, motion, useScroll, useTransform } from "framer-motion";
import { Edit, Check, Music, Layout, Sparkles } from "lucide-react";

const features = [
  {
    icon: Edit,
    title: "AI-Powered Automation",
    description: "Converts raw footage into polished, upload-ready videos in minutes.",
    gradient: "from-teal-400 to-emerald-500",
    delay: 0.1,
  },
  {
    icon: Sparkles,
    title: "Topic Detection",
    description: "Extracts topics from audio and timestamps them for easy editing.",
    gradient: "from-emerald-400 to-teal-400",
    delay: 0.2,
  },
  {
    icon: Check,
    title: "Seamless Editing",
    description: "Trim, stitch, and add captions, transitions, and effects effortlessly.",
    gradient: "from-teal-500 to-emerald-400",
    delay: 0.3,
  },
  {
    icon: Music,
    title: "Augmented Creativity",
    description: "Real-life physics replication, facial emotion mapping, and movement simulation.",
    gradient: "from-emerald-400 to-teal-300",
    delay: 0.4,
  },
  {
    icon: Layout,
    title: "Scalability",
    description: "Handles content for multiple platforms, from short reels to long-format videos.",
    gradient: "from-teal-400 to-emerald-400",
    delay: 0.5,
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

export default function EditronFeatures() {
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
        <motion.div style={{ y: y1 }} className="absolute inset-0 bg-gradient-to-r from-teal-800/10 via-transparent to-emerald-800/10 blur-3xl" />
        <motion.div style={{ y: y2 }} className="absolute top-1/2 left-1/2 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl" />
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300 text-sm font-medium mb-6">
            <Edit className="w-4 h-4" />
            Powerful Features
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              Everything You Need to
            </span>
            <br />
            <span className="bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-200 bg-clip-text text-transparent">
              Edit Like a Pro
            </span>
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto leading-relaxed">
            Editron is your AI-powered video studio. Automate, enhance, and scale your content creation for any platform.
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
              <div className="relative h-full p-8 rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 transition-all duration-300 group-hover:border-teal-500/50 group-hover:bg-white dark:group-hover:bg-neutral-900">
                {/* Icon */}
                <div className={`inline-flex p-3 rounded-lg bg-gray-100 dark:bg-neutral-800 mb-6 border border-neutral-200 dark:border-neutral-700`}>
                  <feature.icon className="w-6 h-6 text-teal-500" />
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
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="inline-flex"
            >
              <Edit className="w-5 h-5 text-teal-500" />
            </motion.span>
            <span className="text-neutral-700 dark:text-neutral-300 font-medium">
              Ready to create your next viral video?
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
} 