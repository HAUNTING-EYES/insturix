"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { ArrowRight, Users, Sparkles } from "lucide-react";
import TypingAnimation from "@/components/ui/TypingAnimation";
import BackgroundEffects from "@/components/ui/BackgroundEffects";
import ICS25Popup from "@/components/ICS25Popup";
import ICS25Banner from "@/components/ICS25Banner";
import CountUp from "@/components/CountUp";

// Keep messages stable between renders to avoid resetting timers/animations
const HERO_MESSAGES = [
  "Level Up Your Content",
  "Level Up Your Growth",
  "Level Up Your Popularity",
  "Level Up Your Security",
  "Level Up Your Workflow",
  "Level Up Your Revenue",
  "Level Up Your Creativity",
  "Level Up Your Network",
];

export default function HeroSection() {
  const [isHovering, setIsHovering] = useState(false);
  const [showICS25Popup, setShowICS25Popup] = useState(false);
  const [countEnded, setCountEnded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ICS25 Popup logic
  useEffect(() => {
    // Check if user has seen the popup before
    const hasSeenPopup = localStorage.getItem('ics25-popup-seen');

    if (!hasSeenPopup) {
      // Show popup after a shorter delay
      const timer = setTimeout(() => {
        setShowICS25Popup(true);
      }, 800); // Reduced from 2000ms to 800ms

      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    // Throttle animation start if first load is fast
    const delay = performance.now() < 1000 ? 600 : 0;
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, []);

  const handleCloseICS25Popup = () => {
    setShowICS25Popup(false);
    // Mark as seen for this session
    localStorage.setItem('ics25-popup-seen', 'true');
  };

  // Fetch user count using TanStack React Query
  // const { data: userCountData, isLoading } = useQuery({
  //   queryKey: ["userCount"],
  //   queryFn: async () => {
  //     const response = await axios.get('/api/waitlist');
  //     return response.data;
  //   },
  //   refetchInterval: 600000, // Refetch every 10 minutes
  //   placeholderData: { total_count: 30 }, // Default data while loading
  //   refetchOnWindowFocus: false, // Don't refetch when tab becomes focused
  //   staleTime: 600000, // Consider data fresh for 10 minutes
  // });
  // const displayCount = userCountData?.total_count || 20;

  const heroMessages = HERO_MESSAGES;

  return (
    <div className="relative min-h-screen w-full overflow-hidden select-none" suppressHydrationWarning>
      <BackgroundEffects />

      {/* Floating elements for visual interest */}
      <div className="absolute top-1/4 left-1/6 w-24 h-24 rounded-full bg-gradient-to-r from-[rgb(var(--primary))/10] to-[rgb(var(--secondary))/10] blur-xl animate-float-slow" />
      <div className="absolute bottom-1/3 right-1/5 w-32 h-32 rounded-full bg-gradient-to-r from-[rgb(var(--secondary))/10] to-[rgb(var(--primary))/10] blur-xl animate-float" />

      <div className="relative mx-auto w-full px-4 sm:px-6 lg:px-8" suppressHydrationWarning>
        <div className="flex min-h-screen w-full flex-col items-center justify-center text-center py-8 sm:py-12">
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Eyebrow badge */}
            {/* <motion.div
              className="mb-6 inline-flex"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary))/10 px-4 py-1.5 text-xs font-medium text-[rgb(var(--primary))]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  {isLoading ? "Loading..." : `Join ${displayCount.toLocaleString()}+ creators on our waitlist`}
                </span>
              </span>
            </motion.div> */}

            <div className="relative mb-6 sm:mb-8 md:mb-12 w-full px-2 sm:px-0">
              <div className="absolute -inset-x-10 sm:-inset-x-20 -inset-y-6 sm:-inset-y-10 z-0 opacity-30 blur-xl sm:blur-2xl md:blur-none">
                <div className="absolute inset-0 bg-gradient-to-r from-[rgb(var(--primary))/10] to-[rgb(var(--secondary))/10] [mask-image:radial-gradient(farthest-side_at_top,white,transparent)]" />
              </div>

              <div className="relative z-10 w-full">
                {/* Beautified CountUp on top of rotating text */}
                <motion.div
                  className="mb-6 sm:mb-8 md:mb-1 mt-4 sm:mt-6 md:mt-8 flex w-full items-center justify-center"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={mounted ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  style={{ willChange: 'transform, opacity' }}
                >
                  <div className="relative">
                    <motion.div
                      role="status"
                      aria-live="polite"
                      className="inline-flex max-w-[min(92vw,64rem)] items-baseline gap-2 sm:gap-3 whitespace-nowrap"
                    >
                      <div className="relative inline-block">
                        {/* underline glow shadow beneath the counter */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -bottom-1 left-0 right-0 h-2 rounded-full blur-md opacity-50"
                          style={{
                            background:
                              'linear-gradient(90deg, rgba(139,92,246,0) 0%, rgba(139,92,246,0.4) 25%, rgba(236,72,153,0.35) 50%, rgba(14,165,233,0.4) 75%, rgba(14,165,233,0) 100%)',
                          }}
                        />
                        <motion.span
                          className="relative z-10 inline-flex items-baseline whitespace-nowrap text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-none"
                          animate={countEnded ? { scale: [1, 1.05, 1] } : {}}
                          transition={countEnded ? { duration: 0.6, ease: 'easeOut' } : {}}
                        >
                          {/* Digits only (gradient) */}
                          <CountUp
  from={0}
  to={6100}
  separator=","
  duration={1.6}
  className="inline-flex items-baseline gap-0 leading-none"
  numberClassName="tabular-nums text-transparent bg-clip-text bg-gradient-to-r from-[#9da3a8] via-[#c5c9cc] to-[#7c8185] drop-shadow-[0_1px_3px_rgba(255,255,255,0.1)]"
  onStart={() => setCountEnded(false)}
  onEnd={() => setCountEnded(true)}
/>

<span className="ml-2 text-2xl sm:text-3xl md:text-4xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#b0b5b8] via-[#d4d7d9] to-[#8b8f93] drop-shadow-[0_1px_2px_rgba(255,255,255,0.15)] leading-none">
  +
</span>

<span className="ml-3 text-base sm:text-lg md:text-2xl font-semibold leading-none tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#8f969b] via-[#b9bec1] to-[#6d7376] drop-shadow-[0_1px_3px_rgba(255,255,255,0.2)]">
  creators
</span>

                        </motion.span>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
                <TypingAnimation
                  messages={heroMessages}
                  displayDuration={3000}
                  characterDelay={40}
                  transitionDuration={350}
                  shouldLoop={true}
                  showCaret
                  caretClass="ml-2 inline-block h-[0.9em] w-[2px] bg-white/70 animate-pulse"
                  textClass="relative z-10 w-full text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-tight"
                />

                {/* Subheading under rotating text */}
                <motion.p
                  className="mt-3 sm:mt-5 max-w-3xl mx-auto px-3 sm:px-0 text-sm xs:text-base sm:text-lg text-white/70 leading-relaxed"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <span>Securing the Future of Content Creators.</span>
                  <br className="hidden md:block" />
                  <span> Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations.</span>
                </motion.p>
              </div>
            </div>


            {/* Primary CTA - below rotating text */}
            <motion.div
              className="mt-6 sm:mt-8 flex w-full items-center justify-center px-4 sm:px-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <Link href="/signup" className="group inline-flex">
                <motion.button
                  className="relative overflow-hidden rounded-full bg-gradient-to-r from-red-700 via-red-600 to-orange-500 px-7 sm:px-9 py-3.5 sm:py-4.5 text-base sm:text-lg font-semibold text-white shadow-[0_8px_30px_rgba(255,99,71,0.35)] transition-all duration-300 ease-out hover:shadow-[0_12px_40px_rgba(255,140,0,0.45)] active:scale-[0.98]"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.985 }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2.5">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Join Now</span>
                    <motion.div animate={{ x: isHovering ? 5 : 0 }} transition={{ duration: 0.25 }}>
                      <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6" />
                    </motion.div>
                  </span>

                  {/* animated sheen */}
                  <motion.div
                    className="pointer-events-none absolute inset-0 z-0 opacity-0 group-hover:opacity-100"
                    animate={{ backgroundPosition: isHovering ? "120% 0%" : "-20% 0%" }}
                    transition={{ duration: 0.9, ease: "easeInOut" }}
                    style={{
                      background: "linear-gradient(110deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.22) 35%, rgba(255,255,255,0.0) 70%)",
                      backgroundSize: "200% 100%",
                    }}
                  />
                </motion.button>
              </Link>
            </motion.div>

            {/* Startup Program Logos - Mobile Optimized (raised slightly for above-the-fold visibility) */}
            <motion.div
              className="flex flex-col items-center gap-3 sm:gap-4 mt-6 sm:mt-8 md:mt-10 lg:mt-12 px-4 sm:px-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.4 }}
            >
              {/* "Backed by" label */}
              <motion.p
                className="text-xs text-white/70 font-semibold tracking-widest uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 1.5 }}
              >
                Backed by
              </motion.p>

              {/* Logos - Responsive layout */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full max-w-md sm:max-w-none">
                {/* Google for Startups */}
                <motion.div
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ duration: 0.6, delay: 1.6, ease: "easeOut" }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  className="group cursor-pointer w-full sm:w-auto"
                >
                  <div className="bg-white/30 backdrop-blur-sm rounded-lg p-2.5 sm:p-3 shadow-lg border border-white/15 hover:shadow-xl transition-all duration-300 hover:border-white/30 hover:backdrop-blur-md hover:bg-white/15">
                    <Image
                      src="/icons/Google_for_Startups_logo.svg"
                      alt="Google for Startups"
                      width={160}
                      height={36}
                      className="w-auto h-auto max-h-5 sm:max-h-6 md:max-h-7 transition-all duration-300 group-hover:scale-105 block mx-auto"
                    />
                  </div>
                </motion.div>

                {/* Microsoft for Startups */}
                <motion.div
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ duration: 0.6, delay: 1.8, ease: "easeOut" }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  className="group cursor-pointer w-full sm:w-auto"
                >
                  <div className="bg-white/30 backdrop-blur-sm rounded-lg p-2.5 sm:p-3 shadow-lg border border-white/15 hover:shadow-xl transition-all duration-300 hover:border-white/30 hover:backdrop-blur-md hover:bg-white/15">
                    <Image
                      src="/icons/Microsoft-for-Startups-alpha.png"
                      alt="Microsoft for Startups"
                      width={180}
                      height={50}
                      className="w-auto h-auto max-h-6 sm:max-h-7 md:max-h-8 transition-all duration-300 group-hover:scale-105 block mx-auto"
                    />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ICS25 Banner */}
      <ICS25Banner />

      {/* ICS25 Popup */}
      <ICS25Popup
        isOpen={showICS25Popup}
        onClose={handleCloseICS25Popup}
      />
    </div>
  );
}
