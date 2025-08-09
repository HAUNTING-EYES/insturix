"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useMemo } from "react"
import { useSidebar } from "./context"
import { products } from "./constants"
import { linkVariants, containerVariants, textContainerVariants } from "./animations"
import type { NavItemProps } from "./types"

export function NavItem({ href, icon, label, isExpanded, isPro }: NavItemProps) {
  const { activeRoute, hoveredItem, setHoveredItem, userPlan, openUpgradeDialog } = useSidebar()
  const router = useRouter()
  const isActive = activeRoute === href
  const isHovered = hoveredItem === href
  const hasPro = userPlan === "Pro" || userPlan === "Enterprise"

  const product = useMemo(() => products.find((p) => p.path === href), [href])
  const itemColor = product?.color
  const itemHoverColor = product?.hoverColor

  const shouldApplyColor = isActive && itemColor
  const shouldApplyHoverColor = isHovered && itemHoverColor && !isActive

  const backgroundColor = useMemo(() => {
    if (shouldApplyColor) return `${itemColor}20`
    if (shouldApplyHoverColor) return `${itemHoverColor}15`
    if (isHovered) return "rgba(255, 255, 255, 0.15)"
    if (isActive) return "rgba(255, 255, 255, 0.1)"
    return "transparent"
  }, [shouldApplyColor, shouldApplyHoverColor, isHovered, isActive, itemColor, itemHoverColor])

  const borderColor = useMemo(() => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    return "transparent"
  }, [shouldApplyColor, shouldApplyHoverColor, itemColor, itemHoverColor])

  const iconColor = useMemo(() => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    if (isActive) return "#ffffff"
    return isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.8)"
  }, [shouldApplyColor, shouldApplyHoverColor, isActive, isHovered, itemColor, itemHoverColor])

  const textColor = useMemo(() => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    return isHovered || isActive ? "#ffffff" : "rgba(255, 255, 255, 0.8)"
  }, [shouldApplyColor, shouldApplyHoverColor, isHovered, isActive, itemColor, itemHoverColor])

  const content = (
    <motion.div
      className="relative"
      whileHover={{ x: 4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <motion.div
        className={cn(
          "flex items-center rounded-lg w-full transition-all duration-300 ease-out relative overflow-hidden py-2 cursor-pointer",
          isPro && !hasPro ? "opacity-80" : "",
        )}
        style={{
          backgroundColor: backgroundColor,
          borderLeft: `3px solid ${borderColor}`,
        }}
        variants={linkVariants}
        animate={isExpanded ? "expanded" : "collapsed"}
        initial={false}
        onMouseEnter={() => setHoveredItem(href)}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={(e) => {
          if (isPro && !hasPro) {
            e.preventDefault()
            openUpgradeDialog()
          } else {
            e.preventDefault()
            router.push(href)
          }
        }}
      >
        <motion.div
          className="flex items-center"
          variants={containerVariants}
          animate={isExpanded ? "expanded" : "collapsed"}
          initial={false}
        >
          <motion.div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 32,
              height: 32,
              color: iconColor,
            }}
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            {icon}
          </motion.div>
          
          <motion.div
            className="flex items-center justify-between min-w-0"
            variants={textContainerVariants}
            animate={isExpanded ? "expanded" : "collapsed"}
            initial={false}
            style={{
              overflow: "hidden"
            }}
          >
            <motion.span
              className="text-sm font-medium tracking-wide flex-shrink-0"
              style={{
                color: textColor,
                whiteSpace: "nowrap"
              }}
              whileHover={{ x: 2 }}
              transition={{ duration: 0.2 }}
            >
              {label}
            </motion.span>

            {isPro && !hasPro && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={isExpanded ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
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
  return content;
}


