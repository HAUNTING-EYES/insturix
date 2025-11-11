"use client";

import Image, { ImageProps } from "next/image";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ImageWithSkeletonProps extends Omit<ImageProps, 'onLoad' | 'onError'> {
  skeletonClassName?: string;
}

/**
 * Image component with built-in skeleton loader
 * Shows a subtle skeleton animation while the image is loading
 */
export default function ImageWithSkeleton({
  className,
  skeletonClassName,
  alt,
  ...props
}: ImageWithSkeletonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className={cn("flex items-center justify-center bg-gradient-to-br from-[#3A9EFF]/40 via-[#7C4DFF]/25 to-[#FF2EE6]/35", className)}>
        <span className="text-white/50 text-sm">{alt}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <Skeleton 
          className={cn(
            "absolute inset-0 z-10 bg-gradient-to-br from-zinc-800/60 to-zinc-900/60",
            skeletonClassName
          )} 
        />
      )}
      <Image
        {...props}
        alt={alt}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}
