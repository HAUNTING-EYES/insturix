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
  Check,
  Sparkles
} from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CursorEffect from '@/components/ui/CursorEffect';
import DotGrid from '@/components/DotGrid';

// Small glowing chip used for date/venue and feature tags
function GlowChip({
  children,
  icon: Icon,
  gradient = 'from-sky-500/30 to-fuchsia-500/30',
  className = ''
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  gradient?: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex items-center gap-2 px-6 py-3 rounded-full ${className}`}>
      <span
        aria-hidden
        className={`pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-r ${gradient} blur-xl opacity-70`}
      />
      <span className="relative inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/80 dark:bg-zinc-900/60 backdrop-blur-md border border-white/60 dark:border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]">
        {Icon ? <Icon className="w-5 h-5 text-zinc-700 dark:text-zinc-300" /> : null}
        <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{children}</span>
      </span>
    </span>
  );
}

export default function ICS25ClientContent() {
  const { isSignedIn } = useUser();
  const [optedIn, setOptedIn] = useState(false);
  const LS_KEY = 'ics25_updates_optin';
  const router = useRouter();

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

  const handleRegisterClick = useCallback(async () => {
    try {
      if (!isSignedIn) {
        // Send unauthenticated users to signup first, then back to ICS25 register
        const returnTo = encodeURIComponent('/ics25/register');
        router.push(`/signup?redirect_url=${returnTo}`);
        return;
      }
      const res = await fetch('/api/ics25/players/me', { cache: 'no-store', headers: { 'accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data?.player) {
          router.push('/ics25/my');
          return;
        }
      }
    } catch {
      // fall through on error
    }
    router.push('/ics25/register');
  }, [isSignedIn, router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Unified soft gradient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        {/* Product-style glow blobs */}
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-radial from-white/50 via-transparent to-transparent dark:from-zinc-800/40" />
      </div>
      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.09)" size={900} blur={180} />
      
      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
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
            className="opacity-[0.5] md:opacity-60 mix-blend-plus-lighter [mask-image:radial-gradient(circle_at_center,#000_55%,transparent_95%)]" 
          />
          {/* Soft vignette overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/40 to-white/70 dark:from-zinc-950/85 dark:via-zinc-950/40 dark:to-zinc-950/85" />
        </div>
        <div className="relative z-10 container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-5xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-4 mb-10"
            >
              <GlowChip icon={Calendar}>22 Nov 2025</GlowChip>
              <GlowChip icon={MapPin}>IIIT Delhi</GlowChip>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-6xl md:text-8xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-blue-400 to-fuchsia-400 drop-shadow-[0_6px_40px_rgba(56,189,248,0.25)]"
            >
              ICS&apos;25
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-2xl md:text-4xl font-semibold text-zinc-700 dark:text-zinc-300 mb-4"
            >
              Insturix Creator&apos;s Summit 2025
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}  
              transition={{ delay: 0.8, duration: 0.8 }}
              className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-10 font-light"
            >
              Where Creators Collide, Collaborate & Create Magic
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="relative mx-auto max-w-3xl mb-14"
            >
              {/* Gradient border wrapper like product hero */}
              <div className="relative p-1 rounded-2xl border border-sky-500/20 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/10 via-transparent to-fuchsia-400/10 blur-2xl" aria-hidden />
                <div className="relative rounded-[14px] bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl px-6 py-6">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] transition-all duration-300 transform hover:scale-[1.03] text-lg">
                      <Users className="w-5 h-5 mr-2" />
                      Get Creator Pass
                    </Button>
                    <Button onClick={handleRegisterClick} className="px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(139,92,246,0.45)] transition-all duration-300 transform hover:scale-[1.03] text-lg">
                        <Play className="w-5 h-5 mr-2" />
                        Register for Gaming
                      </Button>
                    <Button variant="outline" className="px-8 py-4 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl font-semibold transition-all duration-300 text-lg">
                      <Play className="w-5 h-5 mr-2" />
                      Watch Teaser
                    </Button>
                  </div>
                </div>
              </div>
              {/* Feature chips */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <GlowChip icon={Sparkles} className="px-4 py-2"><span className="text-sm">Keynotes</span></GlowChip>
                <GlowChip className="px-4 py-2" gradient="from-fuchsia-500/30 to-purple-500/30"><span className="text-sm">Workshops</span></GlowChip>
                <GlowChip className="px-4 py-2" gradient="from-cyan-500/30 to-sky-500/30"><span className="text-sm">Networking</span></GlowChip>
                <GlowChip className="px-4 py-2" gradient="from-emerald-500/30 to-teal-500/30"><span className="text-sm">Creator Demos</span></GlowChip>
              </div>
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
              Ready to Join ICS&apos;25?
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8">
              Don't miss out on the biggest creator event of 2025. Registration opens soon!
            </p>
            
            {/* Special Promotion */}
            <Card className="relative bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800/30 mb-8 overflow-hidden">
              <span aria-hidden className="absolute -inset-1 bg-gradient-to-r from-sky-500/10 via-fuchsia-500/10 to-purple-500/10 blur-2xl" />
              <CardContent className="relative p-8">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Gift className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-300">Special Discount Offer</h3>
                </div>
                <p className="text-zinc-800 dark:text-zinc-200 mb-4 text-lg">
                  Create a promotional reel for ICS&apos;25 and get exclusive discounts!
                </p>
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  <Badge className="relative bg-zinc-200 dark:bg-zinc-800/70 text-zinc-800 dark:text-zinc-200 border-zinc-300/70 dark:border-zinc-700 px-4 py-2 text-sm rounded-full">
                    <span aria-hidden className="absolute -inset-1 rounded-full bg-gradient-to-r from-sky-500/20 to-fuchsia-500/20 blur-lg" />
                    <span className="relative">#ICS25</span>
                  </Badge>
                  <Badge className="relative bg-zinc-200 dark:bg-zinc-800/70 text-zinc-800 dark:text-zinc-200 border-zinc-300/70 dark:border-zinc-700 px-4 py-2 text-sm rounded-full">
                    <span aria-hidden className="absolute -inset-1 rounded-full bg-gradient-to-r from-fuchsia-500/20 to-purple-500/20 blur-lg" />
                    <span className="relative">#insturix</span>
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
                <span>IIIT Delhi • Pricing TBD • More details coming soon</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Participate in Gaming CTA */}
      <section className="pt-12 pb-4 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <Card className="relative overflow-hidden bg-gradient-to-tr from-violet-600/10 via-fuchsia-500/10 to-sky-500/10 border-violet-500/20">
              <span aria-hidden className="absolute -inset-1 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-sky-500/10 blur-2xl" />
              <CardContent className="relative p-8 md:p-10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div>
                    <h3 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Participate in Gaming at ICS’25</h3>
                    <p className="text-zinc-700 dark:text-zinc-300">Compete with your squad in Valorant or BGMI. Team leader registers for everyone. Entry fee is ₹500 per player.</p>
                  </div>
                  <Button onClick={handleRegisterClick} className="inline-flex self-start md:self-auto px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(139,92,246,0.45)] transition-all duration-300">
                      Register Now
                    </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Stay Updated CTA */}
  <section className="pt-16 pb-24 relative">
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
                  <Button className="px-10 py-5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] transition-all duration-300 text-lg group">
                    <ExternalLink className="w-5 h-5 mr-2 transition-transform group-hover:-translate-y-0.5" />
                    Sign Up for Updates
                  </Button>
                </a>
              )}
              {isSignedIn && !optedIn && (
                <Button onClick={handleOptIn} className="px-10 py-5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] transition-all duration-300 text-lg group">
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