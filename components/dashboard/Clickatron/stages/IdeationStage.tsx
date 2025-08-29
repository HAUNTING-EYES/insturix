"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, ArrowRight } from 'lucide-react';

interface CreativeDirection {
  id: string;
  title: string;
  description: string;
  angle: string;
  icon: string;
}

interface IdeationStageProps {
  videoIdea: string;
  selectedPreset?: {
    id: string;
    name: string;
    aspectRatio: string;
    dimensions: string;
  };
  onComplete: (data: { selectedDirection: string }) => void;
}

// Dedupe map for concurrent generate-directions requests keyed by idea string
const generateDirectionsInFlight = new Map<string, Promise<CreativeDirection[]>>();

async function fetchDirections(videoIdea: string, signal?: AbortSignal): Promise<CreativeDirection[]> {
  if (generateDirectionsInFlight.has(videoIdea)) {
    console.log(`[IDEATION] Reusing in-flight generateDirections promise for idea=${videoIdea}`);
    return generateDirectionsInFlight.get(videoIdea)!;
  }

  const promise = (async () => {
    const start = Date.now();
    console.log(`[IDEATION] POST /api/services/clickatron/generate-directions start=${new Date().toISOString()} idea=${videoIdea}`);

    const res = await fetch(`/api/services/clickatron/generate-directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Origin': 'ideation-stage' },
      body: JSON.stringify({ videoIdea, count: 4 }),
      signal,
    });

    console.log(`[IDEATION] POST completed status=${res.status} duration=${Date.now() - start}ms`);

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to generate directions');
    }

    const data = await res.json();
    return (data.directions || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      angle: d.prompt,
      icon: d.icon || '🎯',
    }));
  })();

  generateDirectionsInFlight.set(videoIdea, promise);
  // ensure cleanup after completion (success or failure)
  promise.finally(() => generateDirectionsInFlight.delete(videoIdea));
  return promise;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as any
};

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export function IdeationStage({ videoIdea, selectedPreset, onComplete }: IdeationStageProps) {
  const [directions, setDirections] = useState<CreativeDirection[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const loadDirections = async () => {
      // Prevent concurrent starts
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      setIsLoading(true);
      setLoadError(null);
      try {
        const dirs = await fetchDirections(videoIdea);
        if (!controller.signal.aborted) {
          setDirections(dirs);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load directions');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
        inFlightRef.current = false;
      }
    };

    loadDirections();

    return () => {
      controller.abort();
      inFlightRef.current = false;
    };
  }, [videoIdea]);

  const handleDirectionSelect = (directionId: string) => {
    setSelectedDirection(directionId);
    const direction = directions.find(d => d.id === directionId);
    if (direction) {
      onComplete({ selectedDirection: direction.title });
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-8 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Sparkles className="h-8 w-8 text-purple-400" />
          </motion.div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">
            Analyzing your idea...
          </h2>
          <p className="text-zinc-400">
            AI is crafting creative directions for "{videoIdea || 'your idea'}"
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-8 text-center space-y-2">
          <h2 className="text-xl font-semibold text-zinc-100">Could not generate directions</h2>
          <p className="text-zinc-400 text-sm">{loadError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-6 sm:p-8">
          <div className="text-center mb-8">
            {selectedPreset && (
              <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm mb-4">
                <Sparkles className="h-4 w-4" />
                {selectedPreset.name} • {selectedPreset.aspectRatio}
              </div>
            )}
            <h2 className="text-2xl sm:text-3xl font-semibold text-zinc-100 mb-3">
              Great start! Let's refine the angle.
            </h2>
            <p className="text-zinc-400 text-lg">
              Which of these creative directions feels best for your {selectedPreset?.name.toLowerCase() || 'thumbnail'}?
            </p>
          </div>

          <motion.div 
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="grid gap-4 sm:grid-cols-2"
          >
            {directions.map((direction) => (
              <motion.div key={direction.id} variants={fadeIn}>
                <Card 
                  className={`group cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
                    selectedDirection === direction.id
                      ? 'bg-purple-500/20 border-purple-500/50 shadow-lg shadow-purple-500/20'
                      : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/80 hover:bg-zinc-900/60'
                  }`}
                  onClick={() => handleDirectionSelect(direction.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{direction.icon}</div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-zinc-100 mb-2 group-hover:text-purple-200 transition-colors">
                          {direction.title}
                        </h3>
                        <p className="text-zinc-300 text-sm mb-3">
                          {direction.description}
                        </p>
                        <p className="text-zinc-400 text-xs">
                          <strong>Angle:</strong> {direction.angle}
                        </p>
                      </div>
                      <ArrowRight className={`h-5 w-5 transition-all duration-300 ${
                        selectedDirection === direction.id
                          ? 'text-purple-400 translate-x-1'
                          : 'text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-1'
                      }`} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <div className="text-center mt-8">
            <p className="text-zinc-500 text-sm">
              Click on a direction to generate focused thumbnail variations
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}