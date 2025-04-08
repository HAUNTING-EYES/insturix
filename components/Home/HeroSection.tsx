"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowRight, Sparkles, Users } from "lucide-react";
import TypingAnimation from "@/components/ui/TypingAnimation";
import BackgroundEffects from "@/components/ui/BackgroundEffects";

export default function HeroSection() {
  const [baseCount] = useState(0); // Starting with a default base count
  const [dailyIncrement, setDailyIncrement] = useState(0); // Today's increment
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const todayKey = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // Calculate a daily target (random between 0-20)
    const getDailyTarget = () => {
      // Generate a deterministic random number for today
      const seed = parseInt(todayKey.replace(/-/g, ""));
      const pseudoRandom = Math.sin(seed) * 10000;
      return Math.floor(Math.abs(pseudoRandom) % 21); // 0-20 range
    };

    // Get daily progress from storage or initialize
    const getStoredProgress = () => {
      if (typeof window === "undefined") return 0;

      const stored = localStorage.getItem(`waitlist_progress_${todayKey}`);
      return stored ? parseInt(stored) : 0;
    };

    const dailyTarget = getDailyTarget();
    const currentProgress = getStoredProgress();
    setDailyIncrement(currentProgress);

    // Only continue incrementing if we haven't reached today's target
    if (currentProgress < dailyTarget) {
      const interval = setInterval(() => {
        setDailyIncrement((prev) => {
          const newValue = Math.min(prev + 1, dailyTarget);

          // Store progress in localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem(
              `waitlist_progress_${todayKey}`,
              newValue.toString()
            );
          }

          return newValue;
        });
      }, 30000); // Increment every 30 seconds until reaching today's target

      return () => clearInterval(interval);
    }
  }, []);

  // Display base count plus today's increment
  const waitlistCount = baseCount + dailyIncrement;

  const heroMessages = [
    "Level Up Your Content",
    "Level Up Your Growth",
    "Level Up Your Popularity",
    "Level Up Your Security",
    "Level Up Your Workflow",
    "Level Up Your Revenue",
    "Level Up Your Creativity",
    "Level Up Your Network",
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden select-none">
      <BackgroundEffects />

      {/* Floating elements for visual interest */}
      <div className="absolute top-1/4 left-1/6 w-24 h-24 rounded-full bg-gradient-to-r from-[rgb(var(--primary))/10] to-[rgb(var(--secondary))/10] blur-xl animate-float-slow" />
      <div className="absolute bottom-1/3 right-1/5 w-32 h-32 rounded-full bg-gradient-to-r from-[rgb(var(--secondary))/10] to-[rgb(var(--primary))/10] blur-xl animate-float" />

      <div className="relative mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-screen w-full flex-col items-center justify-center text-center">
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {/* Eyebrow badge */}
            <motion.div
              className="mb-6 inline-flex"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary))/10 px-4 py-1.5 text-xs font-medium text-[rgb(var(--primary))]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  Join {waitlistCount.toLocaleString()}+ creators on our
                  waitlist
                </span>
              </span>
            </motion.div>

            <div className="relative mb-8 sm:mb-12 w-full">
              <div className="absolute -inset-x-20 -inset-y-10 z-0 opacity-30 blur-2xl md:blur-none">
                <div className="absolute inset-0 bg-gradient-to-r from-[rgb(var(--primary))/10] to-[rgb(var(--secondary))/10] [mask-image:radial-gradient(farthest-side_at_top,white,transparent)]" />
              </div>

              <div className="relative z-10 w-full">
                <TypingAnimation
                  messages={heroMessages}
                  displayDuration={3000}
                  characterDelay={40}
                  transitionDuration={350}
                  shouldLoop={true}
                  textClass="w-full text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground"
                />
              </div>
            </div>

            <motion.p
              className="mx-auto max-w-xl text-base sm:text-lg md:text-xl text-muted-foreground/80 px-4 mb-10 sm:mb-14"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              Securing the Future of Content Creators. Your all-in-one platform
              for creator protection, AI-powered tools, and brand collaborations
            </motion.p>

            {/* Waitlist button - the highlight of our changes */}
            <motion.div
              className="mb-12"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 1.2 }}
            >
              <Link href="/waitlist">
                <motion.button
                  className="group relative overflow-hidden rounded-full bg-gradient-to-r from-[rgb(var(--primary))] to-[rgb(var(--secondary))] px-8 py-4 text-base font-semibold text-white shadow-xl transition-all duration-300 ease-out hover:shadow-[0_0_40px_rgba(var(--primary),0.5)] active:scale-[0.98]"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    <span>Join Our Waitlist</span>
                    <motion.div
                      animate={{ x: isHovering ? 5 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ArrowRight className="h-5 w-5" />
                    </motion.div>
                  </span>

                  {/* Animated background effect */}
                  <motion.div
                    className="absolute inset-0 z-0 bg-gradient-to-r from-[rgb(var(--secondary))] to-[rgb(var(--primary))] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    animate={{
                      backgroundPosition: isHovering ? "100% 0%" : "0% 0%",
                    }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    style={{ backgroundSize: "200% 100%" }}
                  />

                  {/* Shine effect */}
                  <motion.div
                    className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-30"
                    animate={{
                      x: isHovering ? "100%" : "-100%",
                    }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)",
                      width: "50%",
                      height: "100%",
                    }}
                  />
                </motion.button>
              </Link>

              {/* Waitlist counter with subtle animation */}
              <motion.div
                className="mt-4 text-sm text-muted-foreground/70 flex items-center justify-center gap-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.5 }}
              >
                <Users className="h-3.5 w-3.5" />
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={waitlistCount}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    {waitlistCount.toLocaleString()}
                  </motion.span>
                </AnimatePresence>
                <span>creators already joined</span>
              </motion.div>
            </motion.div>

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
                className="w-full sm:w-auto group relative rounded-full border border-[rgb(var(--foreground))]/10 bg-[rgb(var(--background))]/50 px-8 py-3 text-sm font-semibold md:backdrop-blur-none backdrop-blur-sm transition-all duration-300 ease-out hover:scale-105 hover:bg-[rgb(var(--foreground))]/5 active:scale-[0.98]"
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
