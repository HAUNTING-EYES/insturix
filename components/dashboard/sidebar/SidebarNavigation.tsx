"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Home } from "lucide-react"
import { NavItem } from "./NavItem"
import { products } from "./constants"

interface SidebarNavigationProps {
  isExpanded: boolean
}

export function SidebarNavigation({ isExpanded }: SidebarNavigationProps) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden py-6 relative">
      <motion.div className="px-2 space-y-3" layout>
        {/* Overview */}
        <motion.div layout>
          <NavItem
            href="/dashboard"
            icon={<Home className="h-5 w-5" />}
            label="Overview"
            isExpanded={isExpanded}
            description=""
            isPro={false}
          />
        </motion.div>
        
        {/* Divider */}
        <motion.div layout>
          <div className="h-px bg-white/10 my-4"></div>
        </motion.div>

        {/* Products Section with fixed positioning */}
        <motion.div layout className="relative">
          <div className="min-h-[20px] flex items-center">
            <AnimatePresence>
              {isExpanded && (
                <motion.h3 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                  className="px-2 text-xs font-medium text-white/70 absolute"
                >
                  Products
                </motion.h3>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Products List */}
        <motion.div layout className="space-y-3 mt-4">
          {products.map((product, index) => {
            // Disable framer-motion animation on mobile for performance
            const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
            if (isMobile) {
              return (
                <div
                  key={product.name}
                  className="transition-transform transform-gpu"
                  style={{ transitionDuration: "150ms" }}
                >
                  <NavItem
                    href={product.path}
                    icon={<product.icon className="h-5 w-5" />}
                    label={product.name}
                    isExpanded={isExpanded}
                    description={product.description}
                    isPro={product.isPro}
                  />
                </div>
              );
            }
            return (
              <motion.div
                key={product.name}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.05,
                  ease: [0.4, 0, 0.2, 1]
                }}
              >
                <NavItem
                  href={product.path}
                  icon={<product.icon className="h-5 w-5" />}
                  label={product.name}
                  isExpanded={isExpanded}
                  description={product.description}
                  isPro={product.isPro}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  )
}