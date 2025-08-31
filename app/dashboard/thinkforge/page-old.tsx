"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import ThinkForgeInterface from "@/components/dashboard/ThinkForge/ThinkForgeInterface";
import ThinkForgeSidePanel from "@/components/dashboard/ThinkForge/ThinkForgeSidePanel";

import { MessageSquare, BrainCircuit, BookOpen } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { cleanupUnusedSessions } from "@/lib/utils/thinkforgeSession";
import { useRaceConditionManager } from "@/lib/utils/raceConditionManager";

export default function ThinkForgeDashboard() {
  const [mobileTab, setMobileTab] = useState<'forge' | 'panel'>('forge');
  const [currentPhase, setCurrentPhase] = useState<'PROMPT' | 'IDEAS' | 'SELECTED' | 'CHAT' | 'SCRIPT'>('PROMPT');
  const [loadSessionFn, setLoadSessionFn] = useState<((sessionId: string) => Promise<boolean>) | null>(null);
  const [isPageInitialized, setIsPageInitialized] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(false);

  const searchParams = useSearchParams();
  const raceManager = useRaceConditionManager('thinkforge-page');

  // Initialize page and handle session cleanup
  useEffect(() => {
    if (isPageInitialized) return;

    const urlSession = searchParams.get('session');
    const urlPhase = searchParams.get('phase');

    // If this is a fresh landing (no URL params), clean up unused sessions
    if (!urlSession && !urlPhase) {
      console.log('Landing on ThinkForge home - cleaning unused sessions');
      cleanupUnusedSessions();
    }

    setIsPageInitialized(true);
  }, [searchParams, isPageInitialized]);

  // Modified side panel visibility logic to prevent disappearing during session loading
  const showSidePanel = (currentPhase !== 'CHAT' && currentPhase !== 'SCRIPT') || isSessionLoading;
  const showHero = currentPhase !== 'SCRIPT';

  // Handle the loadSession function from ThinkForgeInterface
  const handleLoadSessionCallback = useCallback((loadSessionFunction: (sessionId: string) => Promise<boolean>) => {
    // Wrap the load session function to track loading state
    const wrappedLoadSession = async (sessionId: string): Promise<boolean> => {
      try {
        setIsSessionLoading(true);
        console.log('Starting session load, keeping side panel visible');
        const result = await loadSessionFunction(sessionId);
        console.log('Session load completed:', result);
        return result;
      } catch (error) {
        console.error('Session load failed:', error);
        return false;
      } finally {
        // Delay hiding to prevent flicker during phase transitions
        raceManager.createSafeTimeout(
          'clear-loading-state',
          'session-load',
          () => {
            setIsSessionLoading(false);
            console.log('Session loading state cleared');
          },
          500
        );
      }
    };
    
    setLoadSessionFn(() => wrappedLoadSession);
  }, []);

  const Hero = () => (
    <div className="pt-4 pb-2 px-6">
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2 sm:gap-3">
        <BrainCircuit className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" color="#ef4444" />
        ThinkForge
      </h1>
      <p className="mt-1 sm:mt-2 text-sm sm:text-base lg:text-lg text-zinc-400 font-light">
        Your creative sandbox for generating viral content ideas & scripts
      </p>
    </div>
  );

  return (
    <DashboardShell>
        {/* Desktop & Tablet (>= md) */}
        <div className="hidden md:block">
          <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
            <div className={`flex flex-col md:grid ${showSidePanel ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-6 lg:gap-8`}>
              {/* Main column */}
              <div className={`${showSidePanel ? 'md:col-span-2' : 'md:col-span-1'} flex flex-col space-y-6 lg:space-y-8`}>
                {showHero && <Hero />}
                <ThinkForgeInterface 
                  onPhaseChange={setCurrentPhase} 
                  onLoadSession={handleLoadSessionCallback}
                />
              </div>

              {/* Side Panel */}
              {showSidePanel && (
                <div className="md:col-span-1">
                  <ThinkForgeSidePanel loadSession={loadSessionFn} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden container mx-auto px-4 pb-16 pt-4 flex flex-col gap-4">
          {showHero && <Hero />}

          {/* Content switcher */}
          {mobileTab === 'forge' ? (
            <ThinkForgeInterface 
              onPhaseChange={setCurrentPhase}
              onLoadSession={handleLoadSessionCallback}
            />
          ) : (
            <ThinkForgeSidePanel loadSession={loadSessionFn} />
          )}

          {/* Bottom navigation */}
          <nav className="fixed bottom-0 inset-x-0 flex justify-around border-t border-zinc-800 bg-black/70 backdrop-blur-md text-zinc-400 py-2">
            <button
              onClick={() => setMobileTab('forge')}
              className={`flex flex-col items-center text-xs transition-colors ${mobileTab==='forge'?'text-red-500':'hover:text-zinc-200'}`}
            >
              <MessageSquare className="h-5 w-5 mb-0.5" />
              Chat
            </button>
            <button
              onClick={() => setMobileTab('panel')}
              className={`flex flex-col items-center text-xs transition-colors ${mobileTab==='panel'?'text-red-500':'hover:text-zinc-200'}`}
            >
              <BookOpen className="h-5 w-5 mb-0.5" />
              Library
            </button>
          </nav>
        </div>
      </DashboardShell>
  );
}
