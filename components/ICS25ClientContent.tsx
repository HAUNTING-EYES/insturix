"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Users,
  Play,
  ExternalLink,
  Check,
  
} from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import CursorEffect from '@/components/ui/CursorEffect';
import DotGrid from '@/components/DotGrid';
import Countdown from '@/components/ics25/Countdown';
import { SectionHeader, SectionWrapper } from '@/components/ics25/Section';
import GameOnBlock from '@/components/ics25/GameOnBlock';
import AboutICS25 from '@/components/ics25/About';
import SchedulePreview from '@/components/ics25/Schedule';
import Sponsors from '@/components/ics25/Sponsors';
import Link from 'next/link';
import Marquee from '@/components/ics25/Marquee';
import Beams from '@/components/ics25/Beams';
import Parallax from '@/components/ics25/Parallax';
import RailNav from '@/components/ics25/RailNav';
import IcsFaq from '@/components/ics25/IcsFaq';
// Removed chip-style Decor imports per premium minimal direction

// Removed GlowChip: simplifying visual language per premium vibe

const HighlightsGrid = lazy(() => import('@/components/ics25/HighlightsGrid'));
const PricingGrid = lazy(() => import('@/components/ics25/PricingGrid'));
const Creators = lazy(() => import('@/components/ics25/Creators'));

export default function ICS25ClientContent() {
  const { isSignedIn } = useUser();
  const [optedIn, setOptedIn] = useState(false);
  const LS_KEY = 'ics25_updates_optin';
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleAttendeePassClick = useCallback(() => {
    if (!isSignedIn) {
      // Send unauthenticated users to signin first, then back to ICS25
      const returnTo = encodeURIComponent('/ics25');
      router.push(`/signin?redirect_url=${returnTo}`);
      return;
    }
    // If signed in, scroll to pricing section
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  }, [isSignedIn, router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0C] text-white">
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
      
  {/* Hero Section — Cinematic Entry */}
  <section className="relative pt-24 pb-20 overflow-hidden">
    <Beams />
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
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0C]/85 via-transparent to-[#0A0A0C]/85" />
          {/* Floating orbs for depth */}
          <div className="orb -top-24 -left-24" />
          <div className="orb -bottom-28 -right-16" />
        </div>
        <Parallax strength={30}>
        <div className="relative z-10 container mx-auto px-4 text-center">
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={mounted && !shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8 }}
            className="max-w-5xl mx-auto"
          >
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={mounted && !shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }} transition={{ delay: shouldReduceMotion ? 0 : 0.2, duration: shouldReduceMotion ? 0 : 0.5 }} className="mb-6 text-white/80">
              Nov 22–23, 2025 • IIIT Delhi
            </motion.div>

            {/* Staggered per-letter title for cinematic entry */}
            <motion.h1
              initial="hidden"
              animate={mounted ? "show" : "hidden"}
              variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
              className="text-6xl md:text-8xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-r from-[#3A9EFF] via-[#7AB8FF] to-[#FF2EE6] drop-shadow-[0_6px_40px_rgba(58,158,255,0.25)] glow-pulse"
            >
              {Array.from("ICS'25").map((ch, i) => (
                <motion.span key={i} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }} className="inline-block">
                  {ch}
                </motion.span>
              ))}
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={mounted && !shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.6, duration: shouldReduceMotion ? 0 : 0.8 }}
              className="text-2xl md:text-4xl font-semibold text-white/90 mb-4"
            >
              Insturix Creator&apos;s Summit 2025
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={mounted && !shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}  
              transition={{ delay: shouldReduceMotion ? 0 : 0.8, duration: shouldReduceMotion ? 0 : 0.8 }}
              className="text-xl md:text-2xl text-white/70 mb-10 font-light"
            >
              Where Creators Collide, Collaborate & Create Magic
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={mounted && !shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 1, duration: shouldReduceMotion ? 0 : 0.8 }}
              className="relative mx-auto max-w-3xl mb-14"
            >
              {/* Gradient border wrapper like product hero */}
              <div className="relative p-1 rounded-2xl border border-sky-500/20 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/10 via-transparent to-fuchsia-400/10 blur-2xl" aria-hidden />
                <div className="relative rounded-[14px] bg-white/5 backdrop-blur-xl px-6 py-6 border border-white/10">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button onClick={handleAttendeePassClick} className="w-full sm:w-auto px-8 py-4 bg-white text-black hover:bg-zinc-200 font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(58,158,255,0.35)] transition-all duration-300 transform hover:scale-[1.03] text-lg tilt-hover">
                      <Users className="w-5 h-5 mr-2" />
                      Get Attendee Pass
                    </Button>
                    <Button onClick={handleRegisterClick} className="w-full sm:w-auto px-8 py-4 bg-[#3A9EFF] hover:bg-[#2a8be6] text-white font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(58,158,255,0.45)] transition-all duration-300 transform hover:scale-[1.03] text-lg tilt-hover glow-pulse">
                        <Play className="w-5 h-5 mr-2" />
                        Register for Gaming
                      </Button>
                    <a href="#schedule" className="inline-flex w-full sm:w-auto">
                      <Button variant="outline" className="w-full px-8 py-4 border-white/20 text-white hover:bg-white/10 rounded-xl font-semibold transition-all duration-300 text-lg tilt-hover">
                        <Calendar className="w-5 h-5 mr-2" />
                        View Schedule
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
              {/* (Removed feature chips for a cleaner premium hero) */}
            </motion.div>
            
          </motion.div>
        </div>
        </Parallax>
        {/* Scroll indicator */}
        <div className="scroll-indicator" />
      </section>
      {/* DTV label */}
      <div className="pointer-events-none absolute bottom-4 right-4 text-xs text-white/70">Nov 22–23, 2025 • IIIT Delhi</div>
      {/* Rail Navigation */}
      <RailNav
        sections={[
          { id: "about", label: "About" },
          { id: "creators", label: "Creators" },
          { id: "highlights", label: "Highlights" },
          { id: "gameon", label: "Esports" },
          { id: "pricing", label: "Passes" },
          { id: "schedule", label: "Schedule" },
          { id: "faq", label: "FAQs" },
          { id: "sponsors", label: "Sponsors" },
        ]}
      />

      {/* About */}
      <SectionWrapper id="about" className="section-angled-top">
        <SectionHeader eyebrow="About" title="Insturix Creators Summit 2025" subtitle="Empowering India's Creator Economy with AI Innovation" />
        <AboutICS25 />
      </SectionWrapper>

      {/* Creators */}
      <SectionWrapper id="creators" className="section-angled-bottom">
        <SectionHeader eyebrow="Featured" title="Creators Attending" subtitle="" />
        <Suspense fallback={<div className="text-center py-8">Loading creators...</div>}>
          <Creators />
        </Suspense>
      </SectionWrapper>

      {/* Highlights */}
      <SectionWrapper id="highlights" className="section-angled-top section-angled-bottom">
        <SectionHeader eyebrow="Highlights" title="What's On" subtitle="From reel battles to AI showcases and awards." />
        <Suspense fallback={<div className="text-center py-8">Loading highlights...</div>}>
          <HighlightsGrid />
        </Suspense>
      </SectionWrapper>

      {/* Ambient marquee to break rhythm */}
      <Marquee
        className="py-6 text-white/80"
        items={[
          "Creators",
          "Esports",
          "AI",
          "Workshops",
          "Awards",
          "Meetups",
          "Networking",
        ]}
        speed={70}
      />

      {/* GameOn Esports */}
      <SectionWrapper id="gameon" className="theme-gameon section-angled-top section-angled-bottom">
        <SectionHeader eyebrow="Esports" title="GameOn Tournament" subtitle="" />
        <GameOnBlock />
      </SectionWrapper>

      {/* Pricing */}
      <SectionWrapper id="pricing" className="section-angled-top">
  <SectionHeader eyebrow="Tickets" title="Attendee Passes" subtitle="Choose your pass" />
        <Suspense fallback={<div className="text-center py-8">Loading pricing...</div>}>
          <PricingGrid />
        </Suspense>
      </SectionWrapper>

      {/* Schedule & Updates + Countdown */}
      <SectionWrapper id="schedule" className="section-angled-bottom">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <SectionHeader title="Schedule & Updates" subtitle="Event starts soon—check this page for live updates during the event." align="left" />
          <Countdown to="2025-11-22T10:00:00+05:30" />
        </div>
        <SchedulePreview />
      </SectionWrapper>

      {/* FAQ */}
      <SectionWrapper id="faq">
        <SectionHeader eyebrow="Need to Know" title="FAQs" />
        {/* General ICS FAQs */}
        <div className="mb-6">
          <IcsFaq />
        </div>
        {/* Esports redirection line remains */}
        <div className="text-white/70">For esports questions, see the GameOn FAQs on the <Link className="underline decoration-[#3A9EFF]/50" href="/ics25/gameon">GameOn page</Link>.</div>
      </SectionWrapper>

      {/* Ambient marquee before sponsors */}
      <Marquee
        className="py-6 text-white/80"
        items={[
          "Innovation • Community • Competition • Collaboration • Creativity",
        ]}
        speed={60}
      />

      {/* Sponsors */}
      <SectionWrapper id="sponsors" className="section-angled-top">
        <SectionHeader title="Sponsors & Partners" />
        <Sponsors />
      </SectionWrapper>

      {/* Stay Updated CTA */}
  <section className="pt-16 pb-24 relative">
        <div className="relative z-10 container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={mounted && !shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-8">
              Don&apos;t wanna miss updates?
            </h2>
            <p className="text-lg md:text-xl text-white/70 mb-8 font-light">
              Be first to know when registration opens, speaker lineup drops & exclusive creator promos go live.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center min-h-[64px]">
              {!isSignedIn && (
                <Link href="/signup" className="inline-flex w-full sm:w-auto">
                  <Button className="w-full px-10 py-5 bg-white text-black hover:bg-zinc-200 font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(58,158,255,0.35)] transition-all duration-300 text-lg group">
                    <ExternalLink className="w-5 h-5 mr-2 transition-transform group-hover:-translate-y-0.5" />
                    Sign Up for Updates
                  </Button>
                </Link>
              )}
              {isSignedIn && !optedIn && (
                <Button onClick={handleOptIn} className="w-full sm:w-auto px-10 py-5 bg-white text-black hover:bg-zinc-200 font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(58,158,255,0.35)] transition-all duration-300 text-lg group">
                  <ExternalLink className="w-5 h-5 mr-2 transition-transform group-hover:-translate-y-0.5" />
                  Notify Me
                </Button>
              )}
              {isSignedIn && optedIn && (
                <Button disabled className="w-full sm:w-auto px-10 py-5 bg-green-600 dark:bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl shadow-lg text-lg inline-flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  Signed Up for Updates
                </Button>
              )}
            </div>
            <p className="mt-6 text-xs text-white/50">No spam. Just high-signal creator intel.</p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}