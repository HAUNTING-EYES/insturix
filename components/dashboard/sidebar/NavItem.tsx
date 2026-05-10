"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMemo, cloneElement } from "react";
import { useSidebar } from "./context";
import { products } from "./constants";
import {
  linkVariants,
  containerVariants,
  textContainerVariants,
} from "./animations";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NavItemProps } from "./types";

export function NavItem({
  href,
  icon,
  label,
  isExpanded,
  isPro,
}: NavItemProps) {
  const {
    activeRoute,
    hoveredItem,
    setHoveredItem,
    userPlan,
    openUpgradeDialog,
  } = useSidebar();
  const router = useRouter();
  const isActive = activeRoute === href;
  const isHovered = hoveredItem === href;
  const hasPro = userPlan === "Pro" || userPlan === "Enterprise";

  const product = useMemo(() => products.find((p) => p.path === href), [href]);
  const itemColor = product?.color;
  const itemHoverColor = product?.hoverColor;

  const shouldApplyColor = isActive && itemColor;
  const shouldApplyHoverColor = isHovered && itemHoverColor && !isActive;

  const backgroundColor = useMemo(() => {
    if (isActive) return "rgba(28, 29, 36, 0.6)"; // Subtle depth for active state
    if (isHovered) return "rgba(255, 255, 255, 0.05)"; // Very subtle hover
    return "transparent";
  }, [isActive, isHovered]);

  const iconColor = useMemo(() => {
    if (isActive) return "#ffffff"; // Pure white for active
    if (isHovered) return "#ffffff"; // Pure white for hover
    return "#a0a0a0"; // Light grey for default state
  }, [isActive, isHovered]);

  const textColor = useMemo(() => {
    if (isActive) return "#ffffff"; // Pure white for active
    if (isHovered) return "#ffffff"; // Pure white for hover
    return "#a0a0a0"; // Light grey for default state
  }, [isActive, isHovered]);

  // Create consistent icon with proper styling for active state
  const iconElement = useMemo(() => {
    if (icon) {
      const iconProps: any = {
        className: "h-5 w-5", // Ensure consistent size
      };

      // Adjust stroke for active state to make it bolder (simulating filled)
      if (isActive) {
        iconProps.strokeWidth = 2.5;
      } else {
        iconProps.strokeWidth = 2;
      }

      return cloneElement(icon as React.ReactElement, iconProps);
    }
    return icon;
  }, [icon, isActive]);

  const content = (
    <motion.div className="relative">
      {/* Active indicator bar with smooth sliding animation */}
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-sm z-10"
          style={{ backgroundColor: itemColor || "#ffffff" }}
          initial={false}
          animate={{ height: "60%" }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            duration: 0.3,
          }}
        />
      )}

      <motion.div
        className={cn(
          "flex items-center rounded-lg w-full transition-all duration-200 ease-out relative overflow-hidden py-1.5 cursor-pointer ml-1",
          isPro && !hasPro ? "opacity-80" : ""
        )}
        style={{
          backgroundColor: backgroundColor,
        }}
        variants={linkVariants}
        animate={isExpanded ? "expanded" : "collapsed"}
        initial={false}
        onMouseEnter={() => setHoveredItem(href)}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={(e) => {
          if (isPro && !hasPro) {
            e.preventDefault();
            openUpgradeDialog();
          } else {
            e.preventDefault();
            router.push(href);
          }
        }}
      >
        <motion.div
          className="flex items-center"
          variants={containerVariants}
          animate={isExpanded ? "expanded" : "collapsed"}
          initial={false}
        >
          <div
            className="flex items-center justify-center flex-shrink-0 relative"
            style={{
              width: 32,
              height: 32,
              minWidth: 32,
              minHeight: 32,
            }}
          >
            <motion.div
              className="flex items-center justify-center transition-all duration-200"
              style={{
                color: iconColor,
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
            >
              {iconElement}
            </motion.div>
          </div>

          <motion.div
            className="flex items-center justify-between min-w-0"
            variants={textContainerVariants}
            animate={isExpanded ? "expanded" : "collapsed"}
            initial={false}
            style={{
              overflow: "hidden",
            }}
          >
            <motion.span
              className={cn(
                "text-sm tracking-wide flex-shrink-0 transition-all duration-200",
                isActive ? "font-semibold" : "font-medium"
              )}
              style={{
                color: textColor,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </motion.span>

            {isPro && !hasPro && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={
                  isExpanded
                    ? { scale: 1, opacity: 1 }
                    : { scale: 0.8, opacity: 0 }
                }
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 flex-shrink-0"
              >
                PRO
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );

  // Wrap with tooltip for collapsed state
  if (!isExpanded) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="bg-zinc-800 border-zinc-700 text-white"
        >
          <p className="font-medium">{label}</p>
          {product?.description && (
            <p className="text-[11px] text-zinc-400 mt-1">{product.description}</p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
