'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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
    const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [circleOpacity, setCircleOpacity] = useState(0);
    const [blobs, setBlobs] = useState<Blob[]>([]);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number | null>(null);
    const lastUpdateRef = useRef<number>(0);
    const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const repulsionStrength = 0.1;
    const boundaryStrength = 0.05;
    const colors = [
        'rgba(200, 160, 255, 0.7)',
        'rgba(160, 200, 255, 0.7)',
        'rgba(160, 255, 200, 0.7)',
        'rgba(255, 200, 160, 0.7)',
    ];

    const getMobileSettings = () => ({
        blobCount: 3,
        minBlobSize: 400,
        maxBlobSize: 600,
        updateInterval: 100, // ms between updates
        maxSpeed: 0.1,
        centerRadius: 0.3, // Reduced for tighter grouping
        centerGravity: 0.015
    });

    const getDesktopSettings = () => ({
        blobCount: 4,
        minBlobSize: 700,
        maxBlobSize: 1000,
        updateInterval: 16, // ~60fps
        maxSpeed: 0.3,
        centerRadius: 0.8, // 80% of screen width/height for desktop
        centerGravity: 0.01
    });

    const handleResize = useCallback(() => {
        if (resizeTimeoutRef.current) {
            clearTimeout(resizeTimeoutRef.current);
        }

        resizeTimeoutRef.current = setTimeout(() => {
            const settings = isTouchDevice ? getMobileSettings() : getDesktopSettings();
            setBlobs(prevBlobs => prevBlobs.map(blob => ({
                ...blob,
                x: Math.min(blob.x, window.innerWidth),
                y: Math.min(blob.y, window.innerHeight)
            })));
        }, 250);
    }, [isTouchDevice]);

    useEffect(() => {
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (resizeTimeoutRef.current) {
                clearTimeout(resizeTimeoutRef.current);
            }
        };
    }, [handleResize]);

    useEffect(() => {
        setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
        const settings = isTouchDevice ? getMobileSettings() : getDesktopSettings();

        // Center-biased random position for mobile
        const getInitialPosition = (dimension: number) => {
            const center = dimension / 2;
            const range = dimension * (isTouchDevice ? 0.3 : 0.8);
            return center + (Math.random() - 0.5) * range;
        };

        const initialBlobs = Array.from({ length: settings.blobCount }, (_, i) => ({
            id: i,
            x: getInitialPosition(window.innerWidth),
            y: getInitialPosition(window.innerHeight),
            scale: settings.minBlobSize + Math.random() * (settings.maxBlobSize - settings.minBlobSize),
            rotate: Math.random() * 360,
            color: colors[i % colors.length],
            velocity: {
                x: (Math.random() - 0.5) * settings.maxSpeed,
                y: (Math.random() - 0.5) * settings.maxSpeed,
            },
            opacity: 0,
        }));

        setBlobs(initialBlobs);

        initialBlobs.forEach((blob, index) => {
            setTimeout(() => {
                setBlobs(prevBlobs =>
                    prevBlobs.map(b =>
                        b.id === index ? { ...b, opacity: isTouchDevice ? 0.5 : 0.7 } : b
                    )
                );
            }, index * 300);
        });
    }, [isTouchDevice]);

    useEffect(() => {
        const settings = isTouchDevice ? getMobileSettings() : getDesktopSettings();

        const animateBlobs = () => {
            setBlobs((prevBlobs) =>
                prevBlobs.map((blob) => {
                    if (isTouchDevice) {
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const dx = centerX - blob.x;
                        const dy = centerY - blob.y;
                        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                        // Simplified mobile physics
                        blob.velocity.x += (dx / distance) * settings.centerGravity;
                        blob.velocity.y += (dy / distance) * settings.centerGravity;

                        blob.x += blob.velocity.x;
                        blob.y += blob.velocity.y;

                        // Basic boundary check
                        if (distance > window.innerWidth * 0.3) {
                            blob.x = centerX + (blob.x - centerX) * 0.95;
                            blob.y = centerY + (blob.y - centerY) * 0.95;
                        }

                        return blob;
                    }

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
                    if (x > window.innerWidth - halfSize) velocity.x -= boundaryStrength * (x - (window.innerWidth - halfSize));
                    if (y < -halfSize) velocity.y += boundaryStrength * (-halfSize - y);
                    if (y > window.innerHeight - halfSize) velocity.y -= boundaryStrength * (y - (window.innerHeight - halfSize));

                    // Limit speed
                    velocity.x = Math.min(Math.max(velocity.x, -settings.maxSpeed), settings.maxSpeed);
                    velocity.y = Math.min(Math.max(velocity.y, -settings.maxSpeed), settings.maxSpeed);

                    return { ...blob, x, y, velocity };
                })
            );

            animationFrameRef.current = requestAnimationFrame(animateBlobs);
        };

        animationFrameRef.current = requestAnimationFrame(animateBlobs);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [isTouchDevice]);

    useEffect(() => {
        if (isTouchDevice) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const scrollX = window.scrollX || window.pageXOffset;
                const scrollY = window.scrollY || window.pageYOffset;

                const x = e.pageX - (containerRect.left + scrollX);
                const y = e.pageY - (containerRect.top + scrollY);

                setMousePosition({ x, y });
                setCircleOpacity(1);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [isTouchDevice]);

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden -z-10">
            <div
                className={`absolute inset-0 -z-10 ${isTouchDevice ? 'animate-pulse-strong' : ''
                    }`}
                style={{
                    backgroundImage: `radial-gradient(circle at center, currentColor 2px, transparent 2px)`,
                    backgroundSize: '40px 40px',
                    backgroundPosition: '20px 20px',
                    opacity: isTouchDevice ? 0.24 : 0.48,
                    ...(!isTouchDevice && {
                        maskImage: `radial-gradient(circle 250px at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.3) 10%, transparent 70%)`,
                        WebkitMaskImage: `radial-gradient(circle 250px at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.3) 10%, transparent 70%)`,
                    }),
                }}
            />

            <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/30 z-0" />

            <div className="absolute inset-0 z-10">
                {blobs.map((blob) => (
                    <div
                        key={blob.id}
                        className="absolute rounded-full blur-3xl transition-all duration-700"
                        style={{
                            background: `radial-gradient(circle, ${blob.color}, transparent)`,
                            width: `${blob.scale}px`,
                            height: `${blob.scale}px`,
                            transform: `translate(${blob.x}px, ${blob.y}px) rotate(${blob.rotate}deg)`,
                            opacity: blob.opacity,
                        }}
                    />
                ))}

                <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background/80 z-20" />
            </div>
        </div>
    );
}