"use client"

import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import Image from "next/image"

interface SidebarHeaderProps {
  isExpanded: boolean
}

export function SidebarHeader({ isExpanded }: SidebarHeaderProps) {
  return (
    <div className="h-16 flex items-center justify-center px-4 border-b border-white/10 bg-zinc-900 relative overflow-hidden">
      <motion.div
        className="flex items-center justify-center h-full w-full"
        layout
      >
        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.div
              key="expanded-logo"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="text-white"
              style={{
                fontWeight: 800,
                fontSize: 24,
                letterSpacing: "-0.02em",
              }}
            >
              <Link href="/">Insturix</Link>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed-logo"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center"
            >
              <Image
                src="/icons/icon_alpha.svg"
                alt="Insturix Logo"
                width={32}
                height={32}
                className="filter brightness-0 invert"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}