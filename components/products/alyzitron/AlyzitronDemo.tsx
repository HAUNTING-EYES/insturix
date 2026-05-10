"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, CheckCircle, AlertCircle, BarChart3 } from "lucide-react";
import { useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";

const demoSteps = [
  {
    id: 1,
    title: "Upload Video",
    description: "Drag and drop your video or paste YouTube URL",
    status: "completed",
    duration: "0.5s",
  },
  {
    id: 2,
    title: "AI Analysis",
    description: "Advanced algorithms analyze content, audio, and metadata",
    status: "processing",
    duration: "15s",
  },
  {
    id: 3,
    title: "Generate Report",
    description: "Comprehensive insights and recommendations",
    status: "pending",
    duration: "2s",
  },
];

export default function AlyzitronDemo() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });
  const y1 = useTransform(scrollYProgress, [0, 1], [-150, 150]);
  const y2 = useTransform(scrollYProgress, [0, 1], [100, -100]);

  const handlePlayDemo = () => {
    setAnalysisComplete(false);
    setIsPlaying(true);
    setCurrentStep(1);
    
    const timer1 = setTimeout(() => setCurrentStep(2), 1000);
    const timer2 = setTimeout(() => setCurrentStep(3), 3000);
    const timer3 = setTimeout(() => {
      setIsPlaying(false);
      setAnalysisComplete(true);
    }, 5000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  };

  const handleReset = () => {
    setIsPlaying(false);
    setAnalysisComplete(false);
    setCurrentStep(1);
  }

  return (
    <section ref={targetRef} className="relative py-32 bg-white dark:bg-black">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-neutral-100/5 dark:bg-grid-neutral-900/5 bg-[size:50px_50px]" />
        <motion.div style={{ y: y1 }} className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-800/10 via-transparent to-cyan-800/10 blur-3xl" />
        <motion.div style={{ y: y2 }} className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
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
            <Play className="w-4 h-4" />
            Interactive Demo
          </div>
          
          <h2 className="text-[44px] md:text-[110px] font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              See Alyzitron
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
              In Action
            </span>
          </h2>
          
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto leading-relaxed">
            Watch how our AI analyzes your video content in real-time and provides actionable insights.
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
                {/* Video Placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="w-16 h-16 border-2 border-neutral-700 bg-neutral-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                      {isPlaying ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        >
                          <RotateCcw className="w-8 h-8" />
                        </motion.div>
                      ) : (
                        <Play className="w-8 h-8" />
                      )}
                    </div>
                    <p className="text-lg font-semibold">
                      {isPlaying ? "Analyzing..." : "Sample Video"}
                    </p>
                    <p className="text-sm opacity-70">YouTube Content Analysis</p>
                  </div>
                </div>

                {/* Analysis Overlay */}
                <AnimatePresence>
                  {isPlaying && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.1 }}
                      className="absolute top-4 right-4 bg-black/50 backdrop-blur-md rounded-lg p-2 px-3 text-white border border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
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
              {analysisComplete ? (
                <>
                  <Link href="/dashboard/alyzitron/report/68684552970efc9b80ef7b4e" passHref>
                    <Button size="lg" className="bg-green-600 text-white hover:bg-green-700 border-transparent px-8 py-3 text-lg font-semibold transition-colors duration-200">
                      <BarChart3 className="mr-2 w-5 h-5" />
                      View Report
                    </Button>
                  </Link>
                  <Button onClick={handleReset} variant="outline" size="lg" className="border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 px-8 py-3 text-lg font-semibold transition-colors duration-200">
                    <RotateCcw className="mr-2 w-5 h-5" />
                    Reset
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handlePlayDemo}
                  disabled={isPlaying}
                  size="lg"
                  className="bg-blue-600 text-white hover:bg-blue-700 border border-transparent px-8 py-3 text-lg font-semibold transition-colors duration-200"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="mr-2 w-5 h-5" />
                      Analyzing...
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
                Analysis Process
              </h3>
              
              {demoSteps.map((step) => (
                <motion.div
                  key={step.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                    currentStep >= step.id
                      ? "bg-blue-500/10 border-blue-500/30"
                      : "bg-neutral-100/50 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800"
                  }`}
                  animate={{
                    scale: currentStep === step.id ? 1.02 : 1,
                  }}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    currentStep > step.id
                      ? "bg-green-500"
                      : currentStep === step.id
                      ? "bg-blue-500"
                      : "bg-neutral-300 dark:bg-neutral-700"
                  }`}>
                    {currentStep > step.id ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : currentStep === step.id ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <RotateCcw className="w-4 h-4 text-white" />
                      </motion.div>
                    ) : (
                      <span className="text-sm font-bold text-neutral-800 dark:text-white">{step.id}</span>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <h4 className="font-semibold text-neutral-900 dark:text-white">
                      {step.title}
                    </h4>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {step.description}
                    </p>
                  </div>
                  
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {step.duration}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Mock Results */}
            <div className="bg-white/80 dark:bg-neutral-900/80 rounded-xl p-6 border border-neutral-200 dark:border-neutral-800">
              <h4 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
                Creator Feedback
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Clear and concise information.</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Good video and audio quality.</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>The hook could be stronger.</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Lacks a strong call to action.</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}