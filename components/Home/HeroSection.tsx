"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import TypingAnimation from "@/components/ui/TypingAnimation";
import BackgroundEffects from "@/components/ui/BackgroundEffects";

export default function HeroSection() {
  const heroMessages = [
    "Level Up Your Content",
    "Level Up Your Growth",
    "Level Up Your Popularity",
    "Level Up Your Security",
    "Level Up Your Workflow",
    "Level Up Your Revenue",
    "Level Up Your Creativity",
    "Level Up Your Network",
    // - Content 
    // - Growth 
    // - Popularity
    // - Security
    // - workflow
    // - revenue
    // - creativity
    // - network

  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden select-none">
      <BackgroundEffects />

      <div className="relative mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-screen w-full flex-col items-center justify-center text-center">
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="relative mb-8 sm:mb-12 w-full">
              <div className="absolute -inset-x-20 -inset-y-10 z-0 opacity-30 blur-2xl md:blur-none"> {/* Disable blur on md screens and below */}
                <div className="absolute inset-0 bg-gradient-to-r from-[rgb(var(--primary))/10] to-[rgb(var(--secondary))/10] [mask-image:radial-gradient(farthest-side_at_top,white,transparent)]" />
              </div>

              <div className="relative z-10 w-full">
                <TypingAnimation
                  messages={heroMessages}
                  displayDuration={3000}
                  characterDelay={40}
                  transitionDuration={350}
                  shouldLoop={true}
                  textClass="w-full text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-extrabold tracking-tight text-foreground"
                />
              </div>
            </div>

            <motion.p
              className="mx-auto max-w-xl text-base sm:text-lg md:text-xl text-muted-foreground/80 px-4 mb-8 sm:mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              Securing the Future of Content Creators.
              Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full justify-center items-center mt-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.5 }}
            >
              <Link
                href="/signup"
                className="w-full sm:w-auto group relative rounded-full bg-[rgb(var(--foreground))] px-8 py-3 text-sm font-semibold text-[rgb(var(--background))] shadow-xl transition-all duration-300 ease-out hover:scale-105 hover:shadow-2xl active:scale-[0.98]"
              >
                <span className="relative">Get Started</span>
              </Link>
              <Link
                href="/about"
                className="w-full sm:w-auto group relative rounded-full border border-[rgb(var(--foreground))/10 bg-[rgb(var(--background))/50] px-8 py-3 text-sm font-semibold md:backdrop-blur-none backdrop-blur-sm transition-all duration-300 ease-out hover:scale-105 hover:bg-[rgb(var(--foreground))/5] active:scale-[0.98]" /* Disable blur on md screens and below */
              >
                <span className="relative">Learn More</span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}