"use client";

import { useEffect, useRef, useState, useMemo } from "react";

interface Blob {
  id: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  color: string;
  velocity: { x: number; y: number };
  opacity: number;
}

export default function BackgroundEffects() {
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [circleOpacity, setCircleOpacity] = useState(0);
  const [blobs, setBlobs] = useState<Blob[]>([]);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const repulsionStrength = 0.1;
  const boundaryStrength = 0.05;
  const maxSpeed = 0.3;
  const minBlobSize = 700;
  const maxBlobSize = 1000;
  const blobCount = 4;

  const colors = useMemo(
    () => [
      "rgba(200, 160, 255, 0.7)",
      "rgba(160, 200, 255, 0.7)",
      "rgba(160, 255, 200, 0.7)",
      "rgba(255, 200, 160, 0.7)",
    ],
    []
  );

  // SSR-safe mobile check
  const isMobile = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  };

  // Set mounted state
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const initialBlobs = Array.from({ length: blobCount }, (_, i) => ({
      id: i,
      x: isMobile()
        ? (window.innerWidth * (i + 0.5)) / (blobCount + 1) // Better mobile spacing
        : Math.random() * window.innerWidth,
      y: isMobile()
        ? window.innerHeight * (0.3 + (i % 2) * 0.4) // Alternate between upper and lower positions
        : Math.random() * window.innerHeight,
      scale: isMobile()
        ? minBlobSize * 0.6 + i * 50 // Varied sizes on mobile
        : minBlobSize + Math.random() * (maxBlobSize - minBlobSize),
      rotate: Math.random() * 360,
      color: colors[i % colors.length],
      velocity: {
        x: isMobile() ? 0 : (Math.random() - 0.5) * maxSpeed,
        y: isMobile()
          ? Math.sin(i) * maxSpeed * 0.1
          : (Math.random() - 0.5) * maxSpeed, // Gentler vertical movement
      },
      opacity: 0,
    }));

    setBlobs(initialBlobs);

    // Animate blobs in with delay
    initialBlobs.forEach((blob, index) => {
      setTimeout(() => {
        setBlobs((prevBlobs) =>
          prevBlobs.map((b) => (b.id === index ? { ...b, opacity: 0.7 } : b))
        );
      }, index * (300 + Math.random() * 800)); // Random delay between 300ms and 1100ms
    });
  }, [colors, mounted]);

  useEffect(() => {
    if (!mounted || isMobile()) return;

    const animateBlobs = () => {
      setBlobs((prevBlobs) =>
        prevBlobs.map((blob) => {
          // eslint-disable-next-line
          let { x, y, velocity, scale } = blob;
          // Repulsion logic
          prevBlobs.forEach((otherBlob) => {
            if (blob.id === otherBlob.id) return;

            const dx = otherBlob.x - x;
            const dy = otherBlob.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 300) {
              const force = (repulsionStrength * (300 - distance)) / distance;
              velocity.x -= force * dx;
              velocity.y -= force * dy;
            }
          });

          // Boundary logic
          const halfSize = scale / 2;
          if (x < -halfSize) velocity.x += boundaryStrength * (-halfSize - x);
          if (x > window.innerWidth - halfSize)
            velocity.x -=
              boundaryStrength * (x - (window.innerWidth - halfSize));
          if (y < -halfSize) velocity.y += boundaryStrength * (-halfSize - y);
          if (y > window.innerHeight - halfSize)
            velocity.y -=
              boundaryStrength * (y - (window.innerHeight - halfSize));

          // Limit speed
          velocity.x = Math.min(Math.max(velocity.x, -maxSpeed), maxSpeed);
          velocity.y = Math.min(Math.max(velocity.y, -maxSpeed), maxSpeed);

          // Update position
          x += velocity.x;
          y += velocity.y;

          return { ...blob, x, y, velocity };
        })
      );

      requestAnimationFrame(animateBlobs);
    };

    animateBlobs();
  }, [mounted]);

  useEffect(() => {
    if (!mounted || isMobile()) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        const x = e.pageX - (containerRect.left + scrollX);
        const y = e.pageY - (containerRect.top + scrollY);

        setMousePosition({ x, y });

        const isCursorInContainer =
          x >= 0 &&
          x <= containerRect.width &&
          y >= 0 &&
          y <= containerRect.height;

        setCircleOpacity(isCursorInContainer ? 1 : 0);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [mounted]);

  // Don't render anything on server
  if (!mounted) {
    return (
      <div className="absolute inset-0 overflow-hidden -z-10">
        <div className="absolute inset-0 bg-linear-to-b from-background/30 via-transparent to-background/30 z-0" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden -z-10">
      <div
        className={`${isMobile() ? "mobile-dots" : ""} absolute inset-0 -z-10`}
        style={{
          backgroundImage: `radial-gradient(circle at center, currentColor ${
            isMobile() ? "1.2px" : "1.5px"
          }, transparent ${isMobile() ? "1.5px" : "2.5px"})`,
          backgroundSize: isMobile() ? "32px 32px" : "40px 40px",
          backgroundPosition: "center center",
          maskImage: isMobile()
            ? "none"
            : `radial-gradient(circle 250px at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.3) 10%, transparent 70%)`,
          WebkitMaskImage: isMobile()
            ? "none"
            : `radial-gradient(circle 250px at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.3) 10%, transparent 70%)`,
          opacity: isMobile() ? 0.3 : circleOpacity,
        }}
      />

      <div className="absolute inset-0 bg-linear-to-b from-background/30 via-transparent to-background/30 z-0" />

      <div className="absolute inset-0 z-10">
        {blobs.map((blob) => (
          <div
            key={blob.id}
            className="absolute rounded-full md:blur-3xl" /* Disable blur on md screens and below */
            style={{
              background: `radial-gradient(circle, ${blob.color}, transparent)`,
              width: `${blob.scale}px`,
              height: `${blob.scale}px`,
              transform: `translate(${blob.x}px, ${blob.y}px) rotate(${blob.rotate}deg)`,
              willChange: "transform",
              opacity: blob.opacity,
              transition: "opacity 2.5s ease",
            }}
          />
        ))}

        <div className="absolute inset-0 bg-linear-to-b from-background/80 via-background/50 to-background/80 z-20" />
      </div>
    </div>
  );
}
