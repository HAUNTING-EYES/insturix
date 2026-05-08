"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogOverlay } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useUserInitialization } from "./UserInitializationProvider"

// Import sidebar components
import { SidebarContext, useSidebar } from "./sidebar/context"
import { SidebarHeader } from "./sidebar/SidebarHeader"
import { SidebarNavigation } from "./sidebar/SidebarNavigation"
import { SidebarFooter } from "./sidebar/SidebarFooter"
import { sidebarVariants } from "./sidebar/animations"
import { products, defaultTheme } from "./sidebar/constants"
import CustomUserProfile from "@/components/CustomUserProfile"

export { useSidebar }

export default function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [activeRoute, setActiveRoute] = useState("")
  const [activeColor, setActiveColor] = useState("")
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [theme] = useState(defaultTheme)
  const { user } = useUserInitialization()
  const userPlan = user?.currentPlan?.name || null
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false)

  // Calculate if sidebar should be expanded
  // Don't expand on hover if dialogs are open
  const isExpanded = (isHovering && !isSettingsOpen && !isProfileDialogOpen) || isMobileOpen

  useEffect(() => {
    setActiveRoute(pathname)
    const activeProduct = products.find((product) => pathname.startsWith(product.path))
    setActiveColor(activeProduct?.color || "")
    setIsMobileOpen(false)
  }, [pathname])


  // Clear hover state when any dialog opens
  useEffect(() => {
    if (isSettingsOpen || isProfileDialogOpen) {
      setIsHovering(false)
    }
  }, [isSettingsOpen, isProfileDialogOpen])

  const handleDialogStateChange = (isOpen: boolean) => {
    setIsProfileDialogOpen(isOpen);
    if (isOpen) {
      setIsMobileOpen(false);
    }
  };

  const handleUpgradeClick = () => {
    router.push('/upgrade')
  }

  const openUpgradeDialog = () => {
    router.push('/upgrade')
  }

  return (
    <SidebarContext.Provider
      value={{
        activeRoute,
        setActiveRoute,
        activeColor,
        hoveredItem,
        setHoveredItem,
        theme,
        userPlan,
        openUpgradeDialog,
      }}
    >
      {/* Mobile Menu Button */}
      <motion.div
        className="fixed top-3 left-3 z-[100] lg:hidden"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="bg-background/80 backdrop-blur-sm border-border"
          aria-label="Toggle sidebar"
        >
          <motion.div
            animate={{ rotate: isMobileOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </motion.div>
        </Button>
      </motion.div>

      {/* Mobile Overlay */}
      <motion.div
        className="fixed inset-0 bg-black/50 z-[90] lg:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: isMobileOpen ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        style={{ pointerEvents: isMobileOpen ? "auto" : "none" }}
        onClick={() => setIsMobileOpen(false)}
      />

      {/* Main Sidebar */}
      <TooltipProvider delayDuration={300}>
        <motion.aside
          className={cn(
            "fixed top-0 left-0 bottom-0 h-[100dvh] z-[95] overflow-hidden border-r border-white/10 bg-[#0B0B0A] flex flex-col",
            isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
          variants={sidebarVariants}
          animate={isExpanded ? "expanded" : "collapsed"}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          style={{ willChange: "width" }}
        >
          <SidebarHeader isExpanded={isExpanded} />
          <SidebarNavigation isExpanded={isExpanded} />
          <SidebarFooter
            isExpanded={isExpanded}
            onSettingsClick={() => setIsSettingsOpen(true)}
            onUpgradeClick={handleUpgradeClick}
            onDialogStateChange={handleDialogStateChange}
          />
        </motion.aside>
      </TooltipProvider>

      {/* Dialogs */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogOverlay className="!z-[150]" />
        <DialogContent className="max-w-5xl w-[90vw] h-[90vh] overflow-hidden !duration-200 !transform-none data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 !z-[200]">
          <div className="flex overflow-hidden justify-center items-center">
            <CustomUserProfile/>
          </div>
        </DialogContent>
      </Dialog>

    </SidebarContext.Provider>
  )
}
