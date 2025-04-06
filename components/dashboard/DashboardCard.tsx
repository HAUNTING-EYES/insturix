"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"

interface DashboardCardProps {
  title: string
  description: string
  href?: string
  icon?: ReactNode
}

// Main card component
export default function DashboardCard({ title, description, href, icon }: DashboardCardProps) {
  const Card = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl
                hover:bg-white/[0.04] hover:scale-[1.01]
                group shadow-[0_0_0_1px_rgba(255,255,255,0.02)]
                hover:shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-all duration-300"
    >
      <div className="flex items-center gap-2 mb-2">
        {icon && <div className="text-white/70 group-hover:text-white/90 transition-all duration-300">{icon}</div>}
        <h3 className="font-medium text-white/90 group-hover:text-white transition-all duration-300">{title}</h3>
      </div>
      <p className="text-sm text-white/60 group-hover:text-white/70 transition-all duration-300">{description}</p>
    </motion.div>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        <Card />
      </Link>
    )
  }

  return <Card />
}

// Grid component as a separate named export
export function DashboardCardGrid({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 p-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

