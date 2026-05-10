"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
import { BarChart3, Star } from "lucide-react";
import { useScroll, useTransform } from "framer-motion";

const scoreCategories = [
  {
    title: "Content Quality",
    scores: [
      { label: "Relevance", value: 90 },
      { label: "Clarity", value: 85 },
    ],
    gradient: "from-blue-500 to-blue-600",
  },
  {
    title: "Engagement Metrics",
    scores: [
      { label: "Hook Effectiveness", value: 75 },
      { label: "Viewer Retention", value: 80 },
    ],
    gradient: "from-blue-400 to-blue-500",
  },
  {
    title: "Technical Quality",
    scores: [
      { label: "Video Quality", value: 85 },
      { label: "Audio Quality", value: 90 },
    ],
    gradient: "from-blue-600 to-cyan-500",
  },
];

export default function AlyzitronAnalytics() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });
  const y1 = useTransform(scrollYProgress, [0, 1], [-150, 150]);
  const y2 = useTransform(scrollYProgress, [0, 1], [100, -100]);

  const ProgressBar = ({ value, gradient }: { value: number; gradient: string }) => (
    <div className="w-full bg-neutral-200/50 dark:bg-neutral-700/50 rounded-full h-2">
      <motion.div
        className={`h-2 rounded-full bg-gradient-to-r ${gradient}`}
        style={{ width: `${value}%` }}
        initial={{ width: 0 }}
        whileInView={{ width: `${value}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </div>
  );

  return (
    <section ref={targetRef} className="relative py-32 bg-white dark:bg-black">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-neutral-100/5 dark:bg-grid-neutral-900/5 bg-[size:60px_60px]" />
        <motion.div style={{ y: y1 }} className="absolute inset-0 bg-gradient-to-r from-blue-800/10 via-transparent to-cyan-800/10 blur-3xl" />
        <motion.div style={{ y: y2 }} className="absolute top-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
            <BarChart3 className="w-4 h-4" />
            Detailed Scoring
          </div>
          
          <h2 className="text-[44px] md:text-[110px] font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              Quantify Your
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
              Video&apos;s Potential
            </span>
          </h2>
          
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto leading-relaxed">
            Our AI provides detailed scores across multiple categories, giving you a clear understanding of your video&apos;s strengths and weaknesses.
          </p>
        </motion.div>

        {/* Scoring Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {scoreCategories.map((category, index) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className="group relative"
            >
              <div className="relative h-full p-8 rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 transition-all duration-300 group-hover:border-blue-500/50 group-hover:bg-white dark:group-hover:bg-neutral-900">
                
                {/* Header */}
                <div className="mb-6 flex items-center gap-4">
                  <div className={`inline-flex p-3 rounded-lg bg-gray-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700`}>
                    <Star className="w-6 h-6 text-blue-500" />
                  </div>
                  <h3 className="text-[18px] font-bold text-neutral-900 dark:text-white">
                    {category.title}
                  </h3>
                </div>

                {/* Scores */}
                <div className="space-y-5">
                  {category.scores.map((score) => (
                    <div key={score.label}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          {score.label}
                        </div>
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">
                          {score.value}/100
                        </div>
                      </div>
                      <ProgressBar value={score.value} gradient={category.gradient} />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}