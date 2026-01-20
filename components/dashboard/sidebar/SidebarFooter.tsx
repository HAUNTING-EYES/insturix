"use client"

import { motion } from "framer-motion"
import { useUser } from "@clerk/nextjs"
import UserDropdown from "@/components/ui/CustomToolTip"
import { OrgSwitcher } from "@/components/org/OrgSwitcher"

interface SidebarFooterProps {
  isExpanded: boolean
  onSettingsClick: () => void
  onUpgradeClick: () => void
  onDialogStateChange?: (isOpen: boolean) => void
}

export function SidebarFooter({ isExpanded, onSettingsClick, onUpgradeClick, onDialogStateChange }: SidebarFooterProps) {
  const { user } = useUser()

  if (!user) return null

  return (
    <motion.div 
      className="border-t border-white/10 py-4 px-2 mt-2 space-y-3"
      layout
    >
      {/* Organization Switcher */}
      <OrgSwitcher isExpanded={isExpanded} />
      
      {/* User Profile Dropdown */}
      <motion.div className="w-full" layout>
        <UserDropdown
          onSettingsClick={onSettingsClick}
          onUpgradeClick={onUpgradeClick}
          isCollapsed={!isExpanded}
          onDialogStateChange={onDialogStateChange}
        />
      </motion.div>
    </motion.div>
  )
}