'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence
} from 'framer-motion';
import React, { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react';

export type DockItemData = {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
};

export type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
};

type DockItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
};

function DockItem({
  children,
  className = '',
  onClick,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, val => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize
    };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={onClick}
      className={`relative inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-neutral-800/80 via-neutral-700/60 to-neutral-900/80 border border-neutral-600/50 shadow-2xl backdrop-blur-xl hover:from-neutral-700/90 hover:via-neutral-600/70 hover:to-neutral-800/90 hover:border-neutral-500/70 hover:shadow-neutral-900/50 transition-colors cursor-pointer before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:from-white/10 before:via-transparent before:to-black/20 before:pointer-events-none ${className}`}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, child =>
        React.isValidElement(child)
          ? cloneElement(child as React.ReactElement<{ isHovered?: MotionValue<number> }>, { isHovered })
          : child
      )}
    </motion.div>
  );
}

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
};

function DockLabel({ children, className = '', isHovered }: DockLabelProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', latest => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`${className} absolute -top-8 left-1/2 w-fit whitespace-pre rounded-lg border border-neutral-600/50 bg-gradient-to-br from-neutral-800/95 via-neutral-900/95 to-neutral-950/95 backdrop-blur-xl px-3 py-1.5 text-xs font-medium text-white/90 shadow-xl shadow-neutral-900/60`}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
};

function DockIcon({ children, className = '' }: DockIconProps) {
  return <div className={`flex items-center justify-center text-neutral-300 hover:text-white ${className}`}>{children}</div>;
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 70,
  distance = 200,
  panelHeight = 64,
  dockHeight = 256,
  baseItemSize = 50
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const [isDockHovered, setIsDockHovered] = useState(false);

  const maxHeight = useMemo(() => Math.max(dockHeight, magnification + magnification / 2 + 4), [magnification, dockHeight]);
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, panelHeight]); // Keep constant height
  const height = useSpring(heightRow, spring);

  // Animation states: 0 = hidden (down), 0.5 = half-visible, 1 = fully visible
  const dockVisibility = useMotionValue(0.5); // Start at half-visible
  const dockY = useTransform(dockVisibility, [0, 0.5, 1], [100, 50, 0]); // translateY percentage
  const dockOpacity = useTransform(dockVisibility, [0, 0.5, 1], [0.3, 0.5, 1]);
  
  const animatedY = useSpring(dockY, spring);
  const animatedOpacity = useSpring(dockOpacity, spring);

  // Handle mouse enter/leave on dock area
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dockElement = document.querySelector('[data-dock-container]') as HTMLElement;
      if (!dockElement) return;
      
      const rect = dockElement.getBoundingClientRect();
      const padding = 50; // Extra padding around dock
      const isNearDock = (
        e.clientX >= rect.left - padding &&
        e.clientX <= rect.right + padding &&
        e.clientY >= rect.top - padding &&
        e.clientY <= rect.bottom + padding
      );
      
      if (isNearDock && !isDockHovered) {
        setIsDockHovered(true);
        dockVisibility.set(1);
      } else if (!isNearDock && isDockHovered) {
        setIsDockHovered(false);
        dockVisibility.set(0.5);
      }
    };

    // Initialize dock visibility
    dockVisibility.set(0.5);
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isDockHovered, dockVisibility]);

  return (
    <motion.div 
      style={{ height, scrollbarWidth: 'none' }} 
      className="mx-2 flex max-w-full items-center pointer-events-none"
    >
      <motion.div
        data-dock-container
        onMouseMove={({ pageX }) => {
          isHovered.set(1);
          mouseX.set(pageX);
          setIsDockHovered(true);
          dockVisibility.set(1);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
          setIsDockHovered(false);
          dockVisibility.set(0.5);
        }}
        style={{ 
          height: panelHeight, 
          y: animatedY, 
          opacity: animatedOpacity 
        }}
        className={`${className} fixed bottom-6 left-1/2 transform -translate-x-1/2 flex items-end w-fit gap-3 rounded-2xl border border-neutral-600/40 bg-gradient-to-br from-neutral-800/60 via-neutral-900/80 to-neutral-950/90 backdrop-blur-2xl pb-2 px-4 shadow-2xl shadow-neutral-900/60 before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/5 before:via-transparent before:to-black/30 before:pointer-events-none pointer-events-auto z-40`}
        role="toolbar"
        aria-label="ThinkForge dock"
      >
        {items.map((item, index) => (
          <DockItem
            key={index}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseItemSize={baseItemSize}
          >
            <DockIcon>{item.icon}</DockIcon>
            <DockLabel>{item.label}</DockLabel>
          </DockItem>
        ))}
      </motion.div>
    </motion.div>
  );
}
