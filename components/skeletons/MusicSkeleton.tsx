"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from "@/components/ui/button"

export default function MusicCardSkeleton() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card
      className={cn(
        "group overflow-hidden transition-all duration-500 animate-pulse",
        isExpanded ? "max-w-4xl" : "max-w-sm",
        "bg-gradient-to-br from-zinc-900 to-black border-zinc-800 h-full",
      )}
    >
      <CardContent className="p-0">
        <div className="relative">
          {/* Expanded view toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={isExpanded ? "Collapse view" : "Expand view"}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-zinc-300" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-300" />
            )}
          </Button>

          <div className={cn("flex transition-all duration-500", isExpanded ? "flex-row" : "flex-col")}>
            {/* Album art section skeleton */}
            <div className={cn("relative overflow-hidden", isExpanded ? "w-1/2" : "w-full aspect-square")}>
              {/* Background skeleton with blur effect */}
              <div className="absolute inset-0 scale-110 opacity-30 blur-xl bg-zinc-800"></div>

              {/* Main album art skeleton */}
              <div
                className={cn(
                  "relative z-10 mx-auto aspect-square transition-all duration-700",
                  isExpanded ? "w-3/4 mt-8" : "w-full",
                )}
              >
                <div className="absolute inset-0 bg-zinc-800 rounded-md"></div>
              </div>

              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70"></div>

              {/* Play button overlay skeleton */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-zinc-800/90 border border-zinc-700"></div>
              </div>

              {/* Tags skeleton */}
              <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                <div className="h-5 w-16 bg-zinc-800 rounded-full"></div>
                <div className="h-5 w-12 bg-zinc-800 rounded-full"></div>
                <div className="h-5 w-14 bg-zinc-800 rounded-full"></div>
              </div>
            </div>

            {/* Player controls and info section skeleton */}
            <div
              className={cn(
                "flex flex-col justify-between transition-all duration-500",
                isExpanded ? "w-1/2 p-6" : "w-full p-5",
              )}
            >
              {/* Track info skeleton */}
              <div className="space-y-1 mb-4">
                <div className="flex items-center justify-between">
                  <div className="h-6 bg-zinc-800 rounded w-3/4"></div>
                  <div className="h-8 w-8 bg-zinc-800 rounded-full"></div>
                </div>
              </div>

              {/* Custom audio player skeleton */}
              <div className="space-y-3">
                {/* Timeline skeleton */}
                <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="absolute inset-0 w-1/3 h-full bg-zinc-700"></div>
                </div>

                {/* Time and controls skeleton */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-10 bg-zinc-800 rounded"></div>
                    <div className="h-3 w-1 bg-zinc-800 rounded"></div>
                    <div className="h-3 w-10 bg-zinc-800 rounded"></div>
                  </div>

                  <div className="flex items-center gap-1">
                    <div className="h-5 w-8 bg-zinc-800 rounded"></div>
                    <div className="h-8 w-8 bg-zinc-800 rounded-full"></div>
                  </div>
                </div>

                {/* Playback controls skeleton */}
                <div className="flex items-center justify-between">
                  <div className="flex-1 flex items-center justify-center gap-2">
                    <div className="h-14 w-14 bg-zinc-800 rounded-full"></div>
                  </div>
                </div>

                {/* Volume and additional controls skeleton */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 bg-zinc-800 rounded"></div>
                    <div className="w-24 h-1 bg-zinc-800 rounded-full"></div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-zinc-800 rounded-full"></div>
                    <div className="h-8 w-8 bg-zinc-800 rounded-full"></div>
                  </div>
                </div>

                {/* Waveform skeleton */}
                <div className="h-16 w-full bg-zinc-800/50 rounded-md mt-2">
                  <div className="flex h-full items-end justify-around px-1">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-zinc-700"
                        style={{
                          height: `${Math.max(15, Math.random() * 100)}%`,
                          opacity: 0.5 + Math.random() * 0.5,
                        }}
                      ></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
