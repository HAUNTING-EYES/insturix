"use client";

import { useRef } from "react";
import { AudioWaveform } from "lucide-react";
import { lazy, Suspense } from "react";
import { CreditsCard } from "@/components/shared/CreditsCard";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/animation/gsap-config";
import { DURATIONS, STAGGER } from "@/lib/animation/presets";

// Lazy load heavy components
const ClientWrapper = lazy(() => import("@/components/dashboard/Musitron/ClientWrapper").then(mod => ({ default: mod.ClientWrapper })));

export function MusitronLayout() {
  const pageRef = useRef<HTMLDivElement>(null);

  // GSAP entrance: staggered fadeUp for main sections
  useGSAP(() => {
    gsap.fromTo('[data-animate]',
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: DURATIONS.atmosphere, ease: 'expo.out', stagger: { each: STAGGER.wide.each, from: 'start' } }
    );
  }, { scope: pageRef });

  return (
    <div ref={pageRef} className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      <div className="flex flex-col lg:grid lg:grid-cols-3 lg:items-start gap-6 lg:gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">
          {/* Hero Section */}
          <div data-animate className="pt-4 sm:pt-0" style={{ opacity: 0 }}>
            <div>
              <h1 className="text-2xl sm:text-[32px] lg:text-[44px] font-semibold tracking-tight text-zinc-100 flex items-center gap-2 sm:gap-3">
                <AudioWaveform className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-yellow-500" />
                Music
              </h1>
              <p className="mt-2 sm:mt-3 text-sm sm:text-[14px] lg:text-lg text-zinc-400 font-light">
                Transform your ideas into unique musical compositions
              </p>
            </div>
          </div>

          {/* Mobile Credits View */}
          <div data-animate className="block lg:hidden" style={{ opacity: 0 }}>
            <CreditsCard />
          </div>

          {/* Client Components */}
          <div data-animate style={{ opacity: 0 }}>
            <Suspense fallback={<div className="h-64 bg-zinc-800/20 rounded animate-pulse"></div>}>
              <ClientWrapper />
            </Suspense>
          </div>
        </div>

        {/* Desktop Credits Sidebar */}
        <div data-animate className="hidden lg:block space-y-6 lg:space-y-8 sticky top-6" style={{ opacity: 0 }}>
          <CreditsCard />
        </div>
      </div>
    </div>
  );
}