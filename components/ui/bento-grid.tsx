"use client";

import { ArrowRightIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface BentoCardProps {
  Icon: React.ElementType;
  name: string;
  description: string;
  product_href: string;
  dashboard_href: string;
  cta: string;
  accentColor?: string;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const BentoCard = ({
  name,
  className,
  Icon,
  description,
  product_href: productHref,
  dashboard_href: dashboardHref,
  accentColor = "#6366f1",
  cta,
}: BentoCardProps) => {
  const router = useRouter();
  
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the CTA button
    if ((e.target as HTMLElement).closest('[data-cta-button]')) {
      return;
    }
    router.push(productHref);
  };

  return (
  <div
    onClick={handleCardClick}
    style={{ cursor: 'pointer' }}
    key={name}
    className={cn(
      // Base container
      "group relative overflow-hidden rounded-2xl md:rounded-3xl",
      "flex flex-col justify-between",
      "p-4 sm:p-6 md:p-8 lg:p-8",
      "h-[300px] sm:h-[340px] md:h-[380px] lg:h-[400px]",

      // Background and effects
      "bg-white/95 dark:bg-neutral-900 backdrop-blur-sm",
      "border border-neutral-200/50 dark:border-neutral-800/50",

      // Shadows 
      "shadow-lg sm:shadow-xl dark:shadow-xl dark:sm:shadow-2xl dark:shadow-black/30",

      // Hover effects 
      "transition-all duration-300 sm:duration-500 ease-out",
      "hover:scale-[1.01] sm:hover:scale-[1.02]",
      "hover:shadow-xl sm:hover:shadow-2xl",

      className
    )}
  >
    {/* background shapes */}
    <div className="absolute inset-0 pointer-events-none opacity-10 dark:opacity-[0.15]">
      <svg
        className="absolute top-0 right-0 w-40 h-40 sm:w-48 sm:h-48 md:w-64 md:h-64 transform translate-x-8 sm:translate-x-12 md:translate-x-16 -translate-y-8 sm:-translate-y-12 md:-translate-y-16"
        viewBox="0 0 200 200"
        style={{ color: accentColor }}
      >
        <path
          d="M100,50 C120,30 160,30 180,50 C200,70 200,110 180,130 C160,150 120,150 100,130 C80,110 80,70 100,50 Z"
          fill="currentColor"
          className="opacity-20"
        />
        <path
          d="M100,70 C115,55 145,55 160,70 C175,85 175,115 160,130 C145,145 115,145 100,130 C85,115 85,85 100,70 Z"
          fill="currentColor"
          className="opacity-40"
        />
      </svg>

      <svg
        className="absolute bottom-0 left-0 w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 transform -translate-x-4 sm:-translate-x-6 md:-translate-x-8 translate-y-4 sm:translate-y-6 md:translate-y-8"
        viewBox="0 0 150 150"
        style={{ color: accentColor }}
      >
        <circle
          cx="75"
          cy="75"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="5,5"
          className="opacity-30"
        />
      </svg>

      {/* Corner accent */}
      <div
        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16"
        style={{
          background: `linear-gradient(135deg, transparent 50%, ${accentColor}20 50%)`,
        }}
      />
    </div>

    {/* Subtle texture overlay */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,transparent_0%,rgba(255,255,255,0.1)_100%)] dark:bg-[radial-gradient(circle_at_20%_80%,transparent_0%,rgba(0,0,0,0.1)_100%)] pointer-events-none" />

    {/* Content Container */}
    <div className="relative z-10 flex flex-col h-full">
      {/* Icon */}
      <div className="relative mb-4 sm:mb-5 md:mb-6">
        <div className="absolute -inset-2 sm:-inset-3 md:-inset-4 rounded-full opacity-0 group-hover:opacity-10 sm:group-hover:opacity-15 md:group-hover:opacity-20 blur-lg sm:blur-xl transition-opacity duration-500" />
        <div
          className="relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-white to-neutral-100 dark:from-neutral-800 dark:to-neutral-900 flex items-center justify-center shadow-md sm:shadow-lg group-hover:shadow-lg sm:group-hover:shadow-xl transition-all duration-500 group-hover:scale-105 sm:group-hover:scale-110"
          style={{
            border: `2px solid ${accentColor}20`,
            boxShadow: `0 4px 12px ${accentColor}08, inset 0 1px 0 rgba(255,255,255,0.1)`,
          }}
        >
          <Icon
            className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 transition-transform duration-500 group-hover:scale-105 sm:group-hover:scale-110"
            style={{ color: accentColor }}
          />
        </div>
      </div>

      {/* Title and Description */}
      <div className="flex-1 space-y-2 sm:space-y-3 md:space-y-4">
        <div className="relative">
          <h3 className="text-lg sm:text-[18px] md:text-2xl lg:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white mb-1 sm:mb-2 transition-colors duration-300">
            {name}
          </h3>
          <div
            className="h-0.5 w-8 sm:w-10 md:w-12 transition-all duration-500 group-hover:w-16 sm:group-hover:w-20 md:group-hover:w-24"
            style={{ backgroundColor: accentColor }}
          />
        </div>

        <p className="text-sm sm:text-sm md:text-[14px] text-neutral-600 dark:text-neutral-400 leading-relaxed sm:leading-relaxed transition-colors duration-300">
          {description}
        </p>
      </div>

      {/* CTA Button */}
      <div className="pt-4 sm:pt-5 md:pt-6 mt-3 sm:mt-4 border-t border-neutral-200/50 dark:border-neutral-800/50">
        <Link 
          href={dashboardHref} 
          data-cta-button
          className="group/button relative overflow-hidden rounded-md sm:rounded-lg text-[11px] sm:text-sm transition-all duration-300 hover:pl-4 sm:hover:pl-6 flex items-center gap-1 sm:gap-2 inline-flex"
          style={{
            color: accentColor,
            border: `1px solid ${accentColor}20`,
            background: `linear-gradient(90deg, ${accentColor}08, transparent)`,
            padding: "0.375rem 0.75rem",
          }}
        >
          <span className="relative z-10 font-medium">{cta}</span>
          <ArrowRightIcon className="h-3 w-3 sm:h-4 sm:w-4 transition-all duration-300 group-hover/button:translate-x-1" />
          <div
            className="absolute inset-0 opacity-0 group-hover/button:opacity-100 transition-opacity duration-300"
            style={{
              background: `linear-gradient(90deg, ${accentColor}15, transparent)`,
            }}
          />
        </Link>
      </div>
    </div>

    {/* Top border accent  */}
    <div
      className="absolute top-0 left-0 right-0 h-0.5 sm:h-1 opacity-0 group-hover:opacity-70 sm:group-hover:opacity-90 transition-opacity duration-500"
      style={{
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80, transparent)`,
      }}
    />

    {/* Bottom corner highlight */}
    <div
      className="absolute bottom-0 right-0 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 opacity-0 group-hover:opacity-80 sm:group-hover:opacity-100 transition-opacity duration-500"
      style={{
        background: `radial-gradient(circle at bottom right, ${accentColor}15, transparent 70%)`,
      }}
    />
  </div>
  );
};

export { BentoCard };