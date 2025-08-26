"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Users } from "lucide-react";
import TypingAnimation from "@/components/ui/TypingAnimation";
import BackgroundEffects from "@/components/ui/BackgroundEffects";

export default function HeroSection() {
  const [isHovering, setIsHovering] = useState(false);

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
        <div className="flex min-h-screen w-full flex-col items-center justify-center text-center py-8 sm:py-12">
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
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
                <TypingAnimation
                  messages={heroMessages}
                  displayDuration={3000}
                  characterDelay={40}
                  transitionDuration={350}
                  shouldLoop={true}
                  textClass="w-full text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-tight"
                />
              </div>
            </div>

            <motion.p
              className="mx-auto max-w-xl text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground/80 px-6 sm:px-4 mb-6 sm:mb-8 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              Securing the Future of Content Creators. Your all-in-one platform
              for creator protection, AI-powered tools, and brand collaborations
            </motion.p>

            {/* Waitlist button - Enhanced for mobile */}
            <motion.div
              className="mb-6 sm:mb-8 px-4 sm:px-0"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 1.2 }}
            >
              <Link href="/signup">
                <motion.button
                  className="group relative overflow-hidden rounded-full bg-gradient-to-r from-red-700 to-orange-600 px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-semibold text-white shadow-xl transition-all duration-300 ease-out hover:shadow-[0_0_50px_5px_rgba(var(--primary),0.6)] active:scale-[0.98] w-full sm:w-auto max-w-xs sm:max-w-none mx-auto"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>Join Now!</span>
                    <motion.div
                      animate={{ x: isHovering ? 5 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </motion.div>
                  </span>

                  <motion.div
                    className="absolute inset-0 z-0 bg-gradient-to-r from-red-700 to-orange-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    animate={{
                      backgroundPosition: isHovering ? "100% 0%" : "0% 0%",
                    }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    style={{ backgroundSize: "200% 100%" }}
                  />

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
            </motion.div>

            {/* Startup Program Logos - Mobile Optimized */}
            <motion.div
              className="flex flex-col items-center gap-3 sm:gap-4 mt-12 sm:mt-16 md:mt-20 px-4 sm:px-0"
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
              <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full max-w-md sm:max-w-none">
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
    </div>
  );
}
