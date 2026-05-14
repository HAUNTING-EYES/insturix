"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useScroll, useTransform } from "framer-motion";
import { ArrowRight, Rocket, Shield, Zap, TrendingUp } from "lucide-react";
import Link from "next/link";

const stats = [
  { label: "Videos Analyzed", value: "50K+", icon: TrendingUp },
  { label: "Risk Issues Prevented", value: "2.3K+", icon: Shield },
  { label: "Creators Protected", value: "1.2K+", icon: Rocket },
  { label: "Average Growth", value: "+127%", icon: Zap },
];

const floatingElements = [
  { size: "w-20 h-20", position: "top-10 left-10", delay: 0 },
  { size: "w-16 h-16", position: "top-20 right-20", delay: 2 },
  { size: "w-24 h-24", position: "bottom-20 left-1/4", delay: 4 },
  { size: "w-12 h-12", position: "bottom-32 right-16", delay: 1 },
];

export default function AlyzitronCTA() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });
  const y1 = useTransform(scrollYProgress, [0, 1], [-150, 150]);
  const y2 = useTransform(scrollYProgress, [0, 1], [100, -100]);

  return (
    <section ref={targetRef} className="relative py-32 overflow-hidden bg-white dark:bg-black">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-neutral-100/5 dark:bg-grid-neutral-900/5 bg-[size:40px_40px]" />
        <motion.div style={{ y: y1 }} className="absolute inset-0 bg-gradient-to-br from-blue-800/10 via-transparent to-cyan-800/10 blur-3xl" />
        
        {/* Floating Elements */}
        {floatingElements.map((element, index) => (
          <motion.div
            key={index}
            style={{ y: index % 2 === 0 ? y1 : y2 }}
            className={`absolute ${element.size} ${element.position} bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full blur-3xl`}
          />
        ))}
      </div>

      <div className="relative z-10 container mx-auto px-6">
        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="text-center group"
            >
              <div className="inline-flex p-3 rounded-lg bg-gray-100 dark:bg-neutral-800 mb-4 border border-neutral-200 dark:border-neutral-700 transition-colors group-hover:border-blue-500/50">
                <stat.icon className="w-6 h-6 text-blue-500" />
              </div>
              <div className="text-[32px] font-bold text-neutral-900 dark:text-white mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Main CTA */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-4xl mx-auto"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm font-medium">
              <Rocket className="w-4 h-4" />
              Ready to Launch Your Success?
            </div>
          </motion.div>

          {/* Main Heading */}
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-[44px] md:text-7xl font-bold tracking-tight mb-8"
          >
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              Start Analyzing
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
              Today
            </span>
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-[18px] text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto mb-12 leading-relaxed"
          >
            Join thousands of creators who are already using Alyzitron to optimize their content,
            reduce risks, and accelerate their YouTube growth. Start your free trial today.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-12"
          >
            <Link href="/dashboard">
              <Button
                size="lg"
                className="bg-blue-600 text-white hover:bg-blue-700 border-transparent px-12 py-4 text-[18px] font-bold transition-colors duration-200 min-w-[200px]"
              >
                Start Free Trial
                <ArrowRight className="ml-3 w-6 h-6" />
              </Button>
            </Link>
            
            <Link href="/contact">
              <Button
                variant="outline"
                size="lg"
                className="border-2 border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 px-12 py-4 text-[18px] font-bold transition-colors duration-200 min-w-[200px]"
              >
                Book a Demo
              </Button>
            </Link>
          </motion.div>

          {/* Trust Indicators */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-wrap justify-center items-center gap-8 text-sm text-neutral-600 dark:text-neutral-400"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span>100% Secure</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              <span>Instant Setup</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              <span>7-day Free Trial</span>
            </div>
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-blue-400" />
              <span>No Credit Card Required</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Bottom Decorative Element */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.8 }}
          className="mt-20 relative"
        >
          <div className="w-32 h-0.5 bg-neutral-300 dark:bg-neutral-700 mx-auto"></div>
        </motion.div>
      </div>
    </section>
  );
}