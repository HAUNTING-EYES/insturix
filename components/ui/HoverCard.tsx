"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface HoverCardProps {
    children: React.ReactNode;
    className?: string;
}

export function HoverCard({ children, className = "" }: HoverCardProps) {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    return (
        <motion.div
            className={`section-card card-hover relative overflow-hidden group ${className}`}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
        >
            {isHovered && (
                <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                        background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, 
                            rgb(var(--shimmer-color)/var(--shimmer-opacity)), 
                            transparent 40%)`,
                    }}
                />
            )}
            {children}
        </motion.div>
    );
}
