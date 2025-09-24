"use client";

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Gift,
  Play,
  ExternalLink,
  Check
} from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { useEffect, useState, useCallback } from 'react';
import CursorEffect from '@/components/ui/CursorEffect';
import DotGrid from '@/components/DotGrid';

export default function ICS25ClientContent() {
  const { isSignedIn } = useUser();
  const [optedIn, setOptedIn] = useState(false);
  const LS_KEY = 'ics25_updates_optin';

  useEffect(() => {
    if (typeof window !== 'undefined' && isSignedIn) {
      try { setOptedIn(!!localStorage.getItem(LS_KEY)); } catch {}
    }
  }, [isSignedIn]);

  const handleOptIn = useCallback(() => {
    if (!isSignedIn) return; // fallback safety
    try { localStorage.setItem(LS_KEY, '1'); } catch {}
    setOptedIn(true);
  }, [isSignedIn]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Unified soft gradient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900" />
        <div className="absolute top-[10%] right-[-10%] w-[650px] h-[650px] bg-gradient-to-bl from-cyan-300/25 via-transparent to-transparent dark:from-cyan-700/15 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[650px] h-[650px] bg-gradient-to-tr from-purple-300/25 via-transparent to-transparent dark:from-purple-700/15 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-gradient-radial from-white/40 via-transparent to-transparent dark:from-zinc-800/40" />
      </div>
      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.09)" size={900} blur={180} />
      
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 overflow-hidden">
        {/* Animated Dot Grid Background */}
        <div className="absolute inset-0 -z-0 pointer-events-none">
          {/* Respect prefers-reduced-motion: hide intensive animation */}
          <DotGrid
            dotSize={10}
            gap={15}
            baseColor="#5227FF"
            activeColor="#5227FF"
            proximity={170}
            speedTrigger={110}
            shockRadius={260}
            shockStrength={5.5}
            maxSpeed={4200}
            resistance={680}
            returnDuration={1.6}
            className="opacity-[0.55] md:opacity-60 mix-blend-plus-lighter [mask-image:radial-gradient(circle_at_center,#000_55%,transparent_95%)]" 
          />
          {/* Soft vignette overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/40 to-white/70 dark:from-zinc-950/80 dark:via-zinc-950/40 dark:to-zinc-950/80" />
        </div>
        <div className="relative z-10 container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm border border-zinc-200 dark:border-zinc-700 mb-8"
            >
              <Calendar className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              <span className="text-zinc-700 dark:text-zinc-300 font-semibold">Mid November (TBA)</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-6xl md:text-8xl font-bold mb-6 text-zinc-900 dark:text-zinc-100"
            >
              ICS'25
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-2xl md:text-4xl font-semibold text-zinc-700 dark:text-zinc-300 mb-4"
            >
              Insturix Creator's Summit 2025
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}  
              transition={{ delay: 0.8, duration: 0.8 }}
              className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 font-light"
            >
              Where Creators Collide, Collaborate & Create Magic
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
            >
              <Button className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 text-lg">
                <Users className="w-5 h-5 mr-2" />
                Get Creator Pass
              </Button>
              
              <Button variant="outline" className="px-8 py-4 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl font-semibold transition-all duration-300 text-lg">
                <Play className="w-5 h-5 mr-2" />
                Watch Teaser
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Registration CTA */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
              Ready to Join ICS'25?
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8">
              Don't miss out on the biggest creator event of 2025. Registration opens soon!
            </p>
            
            {/* Special Promotion */}
            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800/30 mb-8">
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Gift className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-300">Special Discount Offer</h3>
                </div>
                <p className="text-zinc-800 dark:text-zinc-200 mb-4 text-lg">
                  Create a promotional reel for ICS'25 and get exclusive discounts!
                </p>
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  <Badge className="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm">
                    #ICS25
                  </Badge>
                  <Badge className="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm">
                    #insturix
                  </Badge>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                  Tag us in your reel and get discount codes sent to your DM!
                </p>
              </CardContent>
            </Card>

            {/* TODO: Add back when registration opens and notification system is ready */}
            {/* <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 text-lg">
                <ExternalLink className="w-5 h-5 mr-2" />
                Notify Me When Registration Opens
              </Button>
              
              <Button variant="outline" className="px-8 py-4 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl font-semibold transition-all duration-300 text-lg">
                <MapPin className="w-5 h-5 mr-2" />
                Get Updates
              </Button>
            </div> */}

            <div className="mt-6 text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center justify-center gap-2 text-sm">
                <MapPin className="w-4 h-4" />
                <span>Venue TBD • Pricing TBD • More details coming soon</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stay Updated CTA */}
  <section className="pt-16 pb-20 relative">
        <div className="relative z-10 container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-8">
              Don&apos;t wanna miss updates?
            </h2>
            <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-8 font-light">
              Be first to know when registration opens, speaker lineup drops & exclusive creator promos go live.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center min-h-[64px]">
              {!isSignedIn && (
                <a href="/signup" className="inline-flex">
                  <Button className="px-10 py-5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 text-lg group">
                    <ExternalLink className="w-5 h-5 mr-2 transition-transform group-hover:-translate-y-0.5" />
                    Sign Up for Updates
                  </Button>
                </a>
              )}
              {isSignedIn && !optedIn && (
                <Button onClick={handleOptIn} className="px-10 py-5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 text-lg group">
                  <ExternalLink className="w-5 h-5 mr-2 transition-transform group-hover:-translate-y-0.5" />
                  Notify Me
                </Button>
              )}
              {isSignedIn && optedIn && (
                <Button disabled className="px-10 py-5 bg-green-600 dark:bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl shadow-lg text-lg inline-flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  Signed Up for Updates
                </Button>
              )}
            </div>
            <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">No spam. Just high-signal creator intel.</p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}