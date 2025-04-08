"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, Sparkles, Users } from "lucide-react";
import TypingAnimation from "@/components/ui/TypingAnimation";
import BackgroundEffects from "@/components/ui/BackgroundEffects";

export default function HeroSection() {
  const [baseCount] = useState(1842); // Starting with a real base count
  const [displayCount, setDisplayCount] = useState(baseCount);
  const [isHovering, setIsHovering] = useState(false);
  // Use a ref to safely track current display count without triggering re-renders
  const displayCountRef = useRef(baseCount);

  useEffect(() => {
    // Update the ref whenever displayCount changes
    displayCountRef.current = displayCount;
  }, [displayCount]);

  useEffect(() => {
    try {
      // Get the current date and time
      const now = new Date();
      const todayKey = now.toISOString().split("T")[0]; // YYYY-MM-DD
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      // Create a deterministic seed based on date (same for everyone on the same day)
      const dateSeed = parseInt(todayKey.replace(/-/g, "")) || 0; // Fallback to 0 if parse fails
      
      // Use the seed to generate today's total increment (consistent for all users)
      const dailyMax = Math.floor((Math.abs(Math.sin(dateSeed) * 10000) % 21)); // 0-20 range
      
      // Calculate how much of the day has passed (0 to 1 scale)
      const dayProgress = (currentHour * 60 + currentMinute) / (24 * 60);
      
      // Calculate how many increments should have happened by now
      const expectedIncrements = Math.floor(dailyMax * dayProgress);
      
      // Set the initial count
      setDisplayCount(baseCount + expectedIncrements);
      
      // Schedule next increment
      const calculateTimeToNextIncrement = () => {
        // How many increments have already happened - use the ref for current value
        const completedIncrements = displayCountRef.current - baseCount;
        
        // If we've reached today's max, no more increments needed
        if (completedIncrements >= dailyMax) return null;
        
        // Calculate the progress percentage needed for the next increment
        const nextIncrementProgress = (completedIncrements + 1) / dailyMax;
        
        // Calculate what time that would be
        const minutesInDay = 24 * 60;
        const targetMinutes = nextIncrementProgress * minutesInDay;
        const currentMinutes = currentHour * 60 + currentMinute;
        
        // How many minutes until next increment
        return Math.max(1, targetMinutes - currentMinutes);
      };
      
      const minutesToNext = calculateTimeToNextIncrement();
      if (!minutesToNext) return; // No more increments today
      
      const interval = setInterval(() => {
        setDisplayCount(prev => {
          // Don't exceed today's maximum
          if (prev >= baseCount + dailyMax) return prev;
          return prev + 1;
        });
      }, minutesToNext * 60 * 1000); // Convert minutes to milliseconds
      
      // Real-time updates for more frequent visual feedback
      const visualInterval = setInterval(() => {
        try {
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const dayProgress = (currentHour * 60 + currentMinute) / (24 * 60);
          const expectedIncrements = Math.floor(dailyMax * dayProgress);
          
          setDisplayCount(prev => {
            const targetCount = baseCount + expectedIncrements;
            if (prev < targetCount) return targetCount;
            return prev;
          });
        } catch (error) {
          console.error("Error in visual interval:", error);
        }
      }, 60000); // Check every minute for visual updates
      
      return () => {
        clearInterval(interval);
        clearInterval(visualInterval);
      };
    } catch (error) {
      console.error("Error in HeroSection useEffect:", error);
    }
  }, [baseCount]); // Remove displayCount from the dependency array

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
                  Join {displayCount.toLocaleString()}+ creators on our
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
                    key={displayCount}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    {displayCount.toLocaleString()}
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