"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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

  const product = products.find((p) => p.path === href)
  const itemColor = product?.color
  const itemHoverColor = product?.hoverColor

  const shouldApplyColor = isActive && itemColor
  const shouldApplyHoverColor = isHovered && itemHoverColor && !isActive

  const getBackgroundColor = () => {
    if (shouldApplyColor) return `${itemColor}20`
    if (shouldApplyHoverColor) return `${itemHoverColor}15`
    if (isHovered) return "rgba(255, 255, 255, 0.15)"
    if (isActive) return "rgba(255, 255, 255, 0.1)"
    return "transparent"
  }

  const getBorderColor = () => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    return "transparent"
  }

  const getIconColor = () => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    if (isActive) return "#ffffff"
    return isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.8)"
  }

  const getTextColor = () => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    return isHovered || isActive ? "#ffffff" : "rgba(255, 255, 255, 0.8)"
  }

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
          backgroundColor: getBackgroundColor(),
          borderLeft: `3px solid ${getBorderColor()}`,
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
              color: getIconColor(),
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
                color: getTextColor(),
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
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent
        side="right"
        className="bg-zinc-800 border-white/10 text-white shadow-lg"
        style={{ display: isExpanded ? 'none' : 'block' }}
      >
        {/* <motion.div
          className="flex flex-col"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{label}</span>
            {isPro && !hasPro && (
              <span className="ml-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                PRO
              </span>
            )}
          </div>
          {description && <span className="text-xs text-zinc-400 mt-1">{description}</span>}
          {isPro && !hasPro && <span className="text-xs text-amber-300 mt-1">Click to upgrade</span>}
        </motion.div> */}
      </TooltipContent>
    </Tooltip>
  )
}