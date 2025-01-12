'use client';

import { motion } from "framer-motion";
import Link from "next/link";
import TypingAnimation from "@/components/ui/TypingAnimation";
import BackgroundEffects from "@/components/ui/BackgroundEffects";

export default function HeroSection() {
    return (
        <div className="relative min-h-[100vh] w-full overflow-hidden select-none">
            <BackgroundEffects />

            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex min-h-[95vh] w-full flex-col items-center justify-center text-center">
                    <motion.div
                        className="space-y-8 w-full" // Reduced space below the typewriter text
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <div className="relative">
                            <div className="absolute -inset-x-20 -inset-y-10 z-0 opacity-50 blur-2xl">
                                <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-secondary/30 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)]" />
                            </div>

                            <div className="relative z-10">
                                <TypingAnimation text="Level Up Your Content Creation Game" />
                            </div>
                        </div>

                        <motion.p
                            className="mx-auto max-w-2xl text-lg text-muted-foreground/80 sm:text-xl"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.8, delay: 1 }}
                        >
                            Securing the Future of Content Creators.
                            Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations
                        </motion.p>

                        <motion.div
                            className="flex gap-6 w-full justify-center"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 1.5 }}
                        >
                            <Link
                                href="/signup"
                                className="group relative rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-xl transition-all duration-300 ease-out hover:scale-105 hover:shadow-2xl active:scale-[0.98]"
                            >
                                <span className="relative">Get Started</span>
                            </Link>
                            <Link
                                href="/about"
                                className="group relative rounded-full border border-primary/20 bg-background/50 px-8 py-3 text-sm font-semibold backdrop-blur-sm transition-all duration-300 ease-out hover:scale-105 hover:bg-primary/10 active:scale-[0.98]"
                            >
                                <span className="relative">Learn More</span>
                            </Link>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </div >
    );
}