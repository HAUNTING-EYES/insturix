"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Home, Shield } from "lucide-react"
import { useUser } from "@clerk/nextjs"
import { NavItem } from "./NavItem"
import { coreCreationTools, growthLegalTools } from "./constants"

interface SidebarNavigationProps {
  isExpanded: boolean
}

export function SidebarNavigation({ isExpanded }: SidebarNavigationProps) {
  const { user } = useUser()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) { setIsAdmin(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/whoami", { credentials: "include" })
        if (!res.ok) { if (!cancelled) setIsAdmin(false); return }
        const data = (await res.json()) as { isAdmin?: boolean }
        if (!cancelled) setIsAdmin(Boolean(data.isAdmin))
      } catch {
        if (!cancelled) setIsAdmin(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 relative">
      <motion.div className="px-2 space-y-1" layout>
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

        {/* Admin — only visible to admins */}
        {isAdmin && (
          <motion.div layout>
            <NavItem
              href="/admin/dashboard"
              icon={<Shield className="h-5 w-5" />}
              label="Admin"
              isExpanded={isExpanded}
              description=""
              isPro={false}
            />
          </motion.div>
        )}
        
        {/* First Divider */}
        <motion.div layout className="py-2">
          <div className="h-px bg-white/10"></div>
        </motion.div>

        {/* Core Creation Studio */}
        <motion.div layout className="space-y-1">
          {coreCreationTools.map((product, index) => {
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.2,
                  delay: index * 0.03,
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

        {/* Second Divider */}
        <motion.div layout className="py-2">
          <div className="h-px bg-white/10"></div>
        </motion.div>

        {/* Growth & Legal */}
        <motion.div layout className="space-y-1">
          {growthLegalTools.map((product, index) => {
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.2,
                  delay: (coreCreationTools.length + index) * 0.03,
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