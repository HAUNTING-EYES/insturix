"use client";

import React, { useState, useEffect } from 'react';
import { idbManager } from '@/lib/idb';

interface ImageDisplayProps {
  imageId?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function ImageDisplay({ imageId, alt = "Generated image", className = "", fallback }: ImageDisplayProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!imageId) {
      setIsLoading(false);
      return;
    }

    const loadImage = async () => {
      try {
        setIsLoading(true);
        setError(false);
        
        const blob = await idbManager.getImage(imageId);
        if (blob) {
          const url = URL.createObjectURL(blob);
          setImageUrl(url);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Failed to load image:', err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();

    // Cleanup function to revoke object URL
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  if (isLoading) {
    return (
      <div className={`bg-zinc-800/50 animate-pulse ${className}`}>
        <div className="w-full h-full bg-gradient-to-br from-zinc-700/50 to-zinc-600/50" />
      </div>
    );
  }

  if (error || !imageUrl) {
    return fallback || (
      <div className={`bg-gradient-to-br from-purple-500/30 to-blue-500/30 ${className}`} />
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      draggable={false}
    />
  );
}