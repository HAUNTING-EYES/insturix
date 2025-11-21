"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface VideoWithSkeletonProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  skeletonClassName?: string;
}

/**
 * Video component with built-in skeleton loader
 * Shows a subtle skeleton animation while the video is loading
 */
export default function VideoWithSkeleton({
  className,
  skeletonClassName,
  autoPlay,
  ...props
}: VideoWithSkeletonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (hasError) {
    return (
      <div className={cn("aspect-[16/10] rounded-2xl border border-white/60 dark:border-white/10 bg-gradient-to-br from-[#3A9EFF]/15 to-[#FF2EE6]/10 overflow-hidden flex items-center justify-center", className)}>
        <p className="text-white/70 text-sm">ICS'25</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <Skeleton 
          className={cn(
            "absolute inset-0 z-10 rounded-2xl bg-gradient-to-br from-zinc-800/60 to-zinc-900/60",
            skeletonClassName
          )} 
        />
      )}
      <video
        {...props}
        autoPlay={isClient ? autoPlay : false}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        onLoadedData={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        suppressHydrationWarning
      />
    </div>
  );
}
