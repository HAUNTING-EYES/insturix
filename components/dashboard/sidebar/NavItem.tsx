"use client";

import { motion } from "framer-motion";
import Link from "next/link";
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

/* Design-system notes (2026-08 audit batch B):
   - Items are real <Link>s (keyboard, middle-click, screen readers) — the one
     exception is a Pro-locked item, which is a <button> that opens the upgrade
     dialog instead of navigating.
   - Active state matches by route PREFIX so sub-routes keep their section lit;
     "/dashboard" (Overview) stays exact-only or it would match everything.
   - Gold is the only accent: active indicator + tint are gold, neutrals are the
     warm ds ramp. Per-product rainbow colors are deliberately NOT used here. */

const GOLD = "#D4A652";
const GOLD_TINT = "rgba(212, 166, 82, 0.10)";
const HOVER_BG = "rgba(236, 233, 225, 0.05)";
const TEXT_ACTIVE = "#ECE9E1";
const TEXT_DEFAULT = "#B5B2A8";

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
  const isActive =
    activeRoute === href ||
    (href !== "/dashboard" && activeRoute.startsWith(`${href}/`));
  const isHovered = hoveredItem === href;
  const hasPro = userPlan === "Pro" || userPlan === "Enterprise";
  const proLocked = Boolean(isPro && !hasPro);

  const product = useMemo(() => products.find((p) => p.path === href), [href]);

  const backgroundColor = isActive ? GOLD_TINT : isHovered ? HOVER_BG : "transparent";
  const inkColor = isActive || isHovered ? TEXT_ACTIVE : TEXT_DEFAULT;

  // Consistent icon sizing; bolder stroke stands in for a filled active state.
  const iconElement = useMemo(() => {
    if (icon) {
      const iconProps: any = {
        className: "h-5 w-5",
        strokeWidth: isActive ? 2.5 : 2,
      };
      return cloneElement(icon as React.ReactElement, iconProps);
    }
    return icon;
  }, [icon, isActive]);

  const content = (
    <motion.div className="relative">
      {/* Active indicator bar with smooth sliding animation — gold, always. */}
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-sm z-10"
          style={{ backgroundColor: GOLD }}
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
          proLocked ? "opacity-80" : ""
        )}
        style={{ backgroundColor }}
        variants={linkVariants}
        animate={isExpanded ? "expanded" : "collapsed"}
        initial={false}
        onMouseEnter={() => setHoveredItem(href)}
        onMouseLeave={() => setHoveredItem(null)}
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
              style={{ color: inkColor }}
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
                color: inkColor,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </motion.span>

            {proLocked && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={
                  isExpanded
                    ? { scale: 1, opacity: 1 }
                    : { scale: 0.8, opacity: 0 }
                }
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center bg-[#D4A652] text-[#241B08] text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 flex-shrink-0"
              >
                PRO
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );

  // Pro-locked items open the upgrade dialog instead of navigating; everything
  // else is a real link so keyboard/middle-click/new-tab all work.
  const interactive = proLocked ? (
    <button
      type="button"
      onClick={openUpgradeDialog}
      className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A652]/60 rounded-lg"
      aria-label={`${label} — Pro feature, opens upgrade`}
    >
      {content}
    </button>
  ) : (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A652]/60 rounded-lg"
    >
      {content}
    </Link>
  );

  // Wrap with tooltip for collapsed state
  if (!isExpanded) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{interactive}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="border-[#282724] bg-[#131312] text-[#ECE9E1]"
        >
          <p className="font-medium">{label}</p>
          {product?.description && (
            <p className="text-[11px] text-[#7A776E] mt-1">{product.description}</p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return interactive;
}
