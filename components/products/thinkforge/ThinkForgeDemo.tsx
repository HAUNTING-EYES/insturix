"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { Sparkles, Play, MessageSquare, BookOpen, Users, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

const demoSteps = [
  {
    id: 1,
    title: "Describe Your Idea",
    description: "Share your content goal or topic.",
    status: "completed",
  },
  {
    id: 2,
    title: "AI Generates Ideas",
    description: "Get a list of viral-ready content ideas.",
    status: "processing",
  },
  {
    id: 3,
    title: "Refine & Script",
    description: "Chat with ForgeAI to develop scripts and refine ideas.",
    status: "pending",
  },
];

export default function ThinkForgeDemo() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [demoComplete, setDemoComplete] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });
  const y1 = useTransform(scrollYProgress, [0, 1], [-150, 150]);
  const y2 = useTransform(scrollYProgress, [0, 1], [100, -100]);

  const handlePlayDemo = () => {
    setDemoComplete(false);
    setIsPlaying(true);
    setCurrentStep(1);
    setTimeout(() => setCurrentStep(2), 1000);
    setTimeout(() => setCurrentStep(3), 2500);
    setTimeout(() => {
      setIsPlaying(false);
      setDemoComplete(true);
    }, 4000);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setDemoComplete(false);
    setCurrentStep(1);
  };

  return (
    <section ref={targetRef} className="relative py-32 bg-white dark:bg-black">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-neutral-100/5 dark:bg-grid-neutral-900/5 bg-[size:50px_50px]" />
        <motion.div style={{ y: y1 }} className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-red-800/10 via-transparent to-pink-800/10 blur-3xl" />
        <motion.div style={{ y: y2 }} className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 text-sm font-medium mb-6">
            <Play className="w-4 h-4" />
            See the Workflow
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              How ThinkForge
            </span>
            <br />
            <span className="bg-gradient-to-r from-red-500 via-pink-400 to-rose-500 bg-clip-text text-transparent">
              Sparks Your Ideas
            </span>
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto leading-relaxed">
            Experience the creative journey from idea to script with our interactive demo.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Demo Interface */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            {/* Main Demo Screen */}
            <div className="relative rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 p-2 aspect-video">
              <div className="relative rounded-xl overflow-hidden h-full bg-black">
                {/* Demo Placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="w-16 h-16 border-2 border-neutral-700 bg-neutral-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-8 h-8 text-pink-400" />
                    </div>
                    <p className="text-lg font-semibold">
                      {isPlaying ? "Generating..." : "ThinkForge Workflow"}
                    </p>
                    <p className="text-sm opacity-70">AI Content Ideation & Scripting</p>
                  </div>
                </div>
                {/* Step Overlay */}
                <AnimatePresence>
                  {isPlaying && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.1 }}
                      className="absolute top-4 right-4 bg-black/50 backdrop-blur-md rounded-lg p-2 px-3 text-white border border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">
                          Step {currentStep}/3
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {/* Demo Controls */}
            <div className="flex justify-center items-center gap-4 mt-6">
              {demoComplete ? (
                <>
                  <Button size="lg" className="bg-red-600 text-white hover:bg-red-700 border-transparent px-8 py-3 text-lg font-semibold transition-colors duration-200" onClick={handleReset}>
                    Reset
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handlePlayDemo}
                  disabled={isPlaying}
                  size="lg"
                  className="bg-red-600 text-white hover:bg-red-700 border border-transparent px-8 py-3 text-lg font-semibold transition-colors duration-200"
                >
                  {isPlaying ? (
                    <>
                      <Play className="mr-2 w-5 h-5" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 w-5 h-5" />
                      Start Demo
                    </>
                  )}
                </Button>
              )}
            </div>
          </motion.div>

          {/* Analysis Steps & Results */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-8"
          >
            {/* Process Steps */}
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">
                Workflow Steps
              </h3>
              {demoSteps.map((step, index) => (
                <motion.div
                  key={step.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                    currentStep >= step.id
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-neutral-100/50 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800"
                  }`}
                  animate={{
                    scale: currentStep === step.id ? 1.02 : 1,
                  }}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    currentStep > step.id
                      ? "bg-pink-500"
                      : currentStep === step.id
                      ? "bg-red-500"
                      : "bg-neutral-300 dark:bg-neutral-700"
                  }`}>
                    {currentStep > step.id ? (
                      <BookOpen className="w-5 h-5 text-white" />
                    ) : currentStep === step.id ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Sparkles className="w-4 h-4 text-white" />
                      </motion.div>
                    ) : (
                      <Lightbulb className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-neutral-900 dark:text-white">
                      {step.title}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-300">
                      {step.description}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            {/* Chat Preview */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 p-6">
              <div className="flex items-center gap-3 mb-2">
                <MessageSquare className="w-5 h-5 text-red-500" />
                <span className="font-semibold text-neutral-900 dark:text-white">ForgeAI Chat Preview</span>
              </div>
              <div className="text-neutral-700 dark:text-neutral-300 text-sm">
                <span className="font-bold">User:</span> I want to know more about depression<br />
                <span className="font-bold">ForgeAI:</span> Sure! Here are some key points and a script outline for your content...
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
} 