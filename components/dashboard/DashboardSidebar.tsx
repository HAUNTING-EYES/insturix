"use client"

import type React from "react"

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, createContext, useContext } from "react"
import { Home, Menu, X, PanelRightOpen, Shield, Music, Edit, Brain, Share2, Sparkles, PanelLeftOpen } from "lucide-react"

import { UserProfile } from "@clerk/nextjs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogOverlay } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import UserDropdown from "@/components/ui/CustomToolTip"

// Define NavItemProps interface
interface NavItemProps {
  href: string
  icon: React.ReactNode
  label: string
  isCollapsed: boolean
  description?: string
}

// Define the products with their icons and paths
const products = [
  {
    name: "Alyzitron",
    path: "/dashboard/alyzitron",
    icon: Sparkles,
    description: "AI Analysis Tool",
    color: "#3b82f6",
    hoverColor: "#60a5fa", // Lighter blue for hover
  },
  {
    name: "Editron",
    path: "/dashboard/editron",
    icon: Edit,
    description: "Advanced Editor",
    color: "#14b8a6",
    hoverColor: "#2dd4bf", // Lighter teal for hover
  },
  {
    name: "Shield",
    path: "/dashboard/shield",
    icon: Shield,
    description: "Security Solution",
    color: "#a855f7",
    hoverColor: "#c084fc", // Lighter purple for hover
  },
  {
    name: "Socialize",
    path: "/dashboard/socialize",
    icon: Share2,
    description: "Social Media Manager",
    color: "#0ea5e9",
    hoverColor: "#38bdf8", // Lighter sky blue for hover
  },
  {
    name: "ThinkForge",
    path: "/dashboard/thinkforge",
    icon: Brain,
    description: "AI Brainstorming",
    color: "#ef4444",
    hoverColor: "#f87171", // Lighter red for hover
  },
  {
    name: "Musitron",
    path: "/dashboard/musitron",
    icon: Music,
    description: "Music Generation",
    color: "#eab308",
    hoverColor: "#facc15", // Lighter yellow for hover
  },
]

// Create a context for sidebar state management
type SidebarContextType = {
  activeRoute: string
  setActiveRoute: (route: string) => void
  activeColor: string
  hoveredItem: string | null
  setHoveredItem: (item: string | null) => void
  theme: {
    activeBackground: string
    activeText: string
    hoverBackground: string
    hoverText: string
  }
}

// Define default theme values
const defaultTheme = {
  activeBackground: "rgba(255, 255, 255, 0.1)",
  activeText: "#ffffff",
  hoverBackground: "rgba(255, 255, 255, 0.05)",
  hoverText: "#f0f0f0",
}

// Update the default context with activeColor and hover state
const SidebarContext = createContext<SidebarContextType>({
  activeRoute: "",
  setActiveRoute: () => {},
  activeColor: "",
  hoveredItem: null,
  setHoveredItem: () => {},
  theme: defaultTheme,
})

export const useSidebar = () => useContext(SidebarContext)

export default function DashboardSidebar() {
  const { user } = useUser()
  const pathname = usePathname()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [activeRoute, setActiveRoute] = useState("")
  const [activeColor, setActiveColor] = useState("")
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [theme] = useState(defaultTheme)

  // Update the useEffect to set activeColor when pathname changes
  useEffect(() => {
    setActiveRoute(pathname)
    // Find the active product and set its color
    const activeProduct = products.find((product) => pathname.startsWith(product.path))
    setActiveColor(activeProduct?.color || "")
    // Close mobile sidebar when route changes
    setIsMobileOpen(false)
  }, [pathname])

  // Check if window is available (client-side)
  useEffect(() => {
    // Check if the sidebar state is stored in localStorage
    const storedState = localStorage.getItem("sidebarCollapsed")
    if (storedState !== null) {
      setIsCollapsed(storedState === "true")
    }
  }, [])

  // Save sidebar state to localStorage
  const toggleSidebar = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem("sidebarCollapsed", String(newState))
  }

  // Update the SidebarContext.Provider to include hoveredItem
  return (
    <SidebarContext.Provider
      value={{
        activeRoute,
        setActiveRoute,
        activeColor,
        hoveredItem,
        setHoveredItem,
        theme,
      }}
    >
      {/* Mobile Menu Button */}
      <div className="fixed top-4 left-4 z-[100] lg:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="bg-background/80 backdrop-blur-sm border-border"
          aria-label="Toggle sidebar"
        >
          {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[90] transition-opacity duration-300 lg:hidden ${
          isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsMobileOpen(false)}
      />

      {/* Main Sidebar */}
      <TooltipProvider delayDuration={300}>
        <aside
          className={cn(
            "fixed top-0 left-0 bottom-0 h-[100dvh] z-[95] overflow-hidden border-r border-white/10 bg-zinc-900 flex flex-col transition-all duration-300 ease-in-out",
            isCollapsed ? "w-[64px]" : "w-[240px]",
            isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          {/* Header */}
          <div className="h-16 flex items-center justify-center px-4 border-b border-white/10 bg-zinc-900 relative">
            {!isCollapsed ? (
              <>
                <Link
                  href="/"
                  className="flex items-center justify-center h-full w-full font-bold text-2xl tracking-wide text-white logotext"
                  style={{
                    fontFamily: "'Blanka', 'Montserrat', 'Arial', sans-serif",
                    letterSpacing: "0.15em",
                  }}
                >
                  INSTURIX
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="hidden lg:flex ml-auto transition-colors duration-300 hover:bg-white/15"
                >
                  <PanelRightOpen  className="h-5 w-5 text-white" />
                </Button>
              </>
            ) : (
              // Collapsed: Only show expand button as top icon, centered
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="mx-auto transition-colors duration-300 hover:bg-white/15"
                style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="h-6 w-6 text-white" />
              </Button>
            )}
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-6">
            <ul className="px-2 space-y-3">
              {/* Overview */}
              <li key="Dashboard">
                <NavItem
                  href="/dashboard"
                  icon={<Home className="h-5 w-5" />}
                  label="Overview"
                  isCollapsed={isCollapsed}
                />
              </li>
              {/* Divider with extra spacing */}
              <li>
                <div className="h-px bg-white/10 my-4"></div>
              </li>
              {/* Products Section */}
              {!isCollapsed && (
                <li>
                  <h3 className="px-2 text-xs font-medium text-muted-foreground mb-4 text-white/70">Products</h3>
                </li>
              )}
              {products.map((product) => (
                <li key={product.name}>
                  <NavItem
                    href={product.path}
                    icon={<product.icon className="h-5 w-5" />}
                    label={product.name}
                    isCollapsed={isCollapsed}
                    description={product.description}
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* Footer with User Profile */}
          {user && (
            <div className="border-t border-white/10 py-4 px-2 mt-2 flex justify-center">
              <div
                onClick={() => {
                  if (isCollapsed) setIsCollapsed(false)
                }}
                style={{ cursor: "pointer", width: "100%", display: "flex", justifyContent: "center" }}
              >
                <UserDropdown
                  onSettingsClick={() => setIsSettingsOpen(true)}
                  onUpgradeClick={() => setIsUpgradeOpen(true)}
                />
              </div>
            </div>
          )}
        </aside>
      </TooltipProvider>

      {/* Dialogs */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogOverlay className="!z-[150]" />
        <DialogContent className="max-w-5xl w-[90vw] h-[90vh] overflow-hidden !duration-200 !transform-none data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 !z-[200]">
          <DialogHeader>
            <DialogTitle>User Settings</DialogTitle>
          </DialogHeader>
          <div className="flex overflow-hidden justify-center items-center">
            <UserProfile
              appearance={{
                elements: {
                  rootBox: "w-full h-full",
                  card: "w-full h-full border-0 shadow-none",
                },
              }}
              routing="hash"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogOverlay className="!z-[150]" />
        <DialogContent className="!duration-200 !transform-none data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 !z-[200]">
          <DialogHeader>
            <DialogTitle>Upgrade Plan</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="rounded-lg border py-4 px-2 bg-muted/50 transition-all duration-300 hover:bg-muted/70">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Pro Plan</h3>
                  <p className="text-sm text-muted-foreground">All features, unlimited usage</p>
                </div>
                <span className="text-xl font-bold">$19/mo</span>
              </div>
            </div>
            <div className="rounded-lg border p-4 bg-primary/5 border-primary/20 transition-all duration-300 hover:bg-primary/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Enterprise Plan</h3>
                  <p className="text-sm text-muted-foreground">Custom solutions for teams</p>
                </div>
                <span className="text-xl font-bold">Contact us</span>
              </div>
            </div>
            <Button className="w-full transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]">
              Upgrade Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarContext.Provider>
  )
}

// Update the NavItem component to use hover effects
function NavItem({ href, icon, label, isCollapsed, description }: NavItemProps) {
  const { activeRoute, hoveredItem, setHoveredItem } = useSidebar()
  const isActive = activeRoute === href
  const isHovered = hoveredItem === href

  // Find if this item is a product
  const product = products.find((p) => p.path === href)
  const itemColor = product?.color
  const itemHoverColor = product?.hoverColor

  // Determine if we should apply color (for product routes)
  const shouldApplyColor = isActive && itemColor
  const shouldApplyHoverColor = isHovered && itemHoverColor && !isActive

  // Calculate background color with opacity
  const getBackgroundColor = () => {
    if (shouldApplyColor) return `${itemColor}20` // 20 is hex for 12% opacity
    if (shouldApplyHoverColor) return `${itemHoverColor}15` // 15 is hex for 8% opacity
    if (isHovered) return "rgba(255, 255, 255, 0.15)" // Default hover for non-product items
    if (isActive) return "rgba(255, 255, 255, 0.1)" // Default active
    return "transparent" // Default state
  }

  // Calculate border color
  const getBorderColor = () => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    return "transparent"
  }

  // Calculate icon color
  const getIconColor = () => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    if (isActive) return "#ffffff"
    return isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.8)"
  }

  // Calculate text color
  const getTextColor = () => {
    if (shouldApplyColor) return itemColor
    if (shouldApplyHoverColor) return itemHoverColor
    return isHovered || isActive ? "#ffffff" : "rgba(255, 255, 255, 0.8)"
  }

  const content = (
    <Link
      href={href}
      prefetch={true}
      className={cn(
        "flex items-center rounded-lg w-full transition-all duration-300 ease-in-out",
        isCollapsed ? "justify-center px-2 gap-0 py-2" : "px-2 gap-3 py-2",
      )}
      style={{
        ...(isCollapsed ? { minWidth: 0 } : {}),
        backgroundColor: getBackgroundColor(),
        borderLeft: `3px solid ${getBorderColor()}`,
        transform: isHovered ? "translateX(4px)" : "translateX(0)",
      }}
      onMouseEnter={() => setHoveredItem(href)}
      onMouseLeave={() => setHoveredItem(null)}
    >
      <span
        className="flex items-center justify-center transition-all duration-300"
        style={{
          width: 32,
          height: 32,
          minWidth: 32,
          minHeight: 32,
          maxWidth: 32,
          maxHeight: 32,
          padding: 2,
          marginRight: !isCollapsed ? 8 : 0,
          marginLeft: 0,
          color: getIconColor(),
          transform: isHovered ? "scale(1.1)" : "scale(1)",
        }}
      >
        {icon}
      </span>
      {!isCollapsed && (
        <span
          className="text-sm font-medium tracking-wide transition-all duration-300"
          style={{
            color: getTextColor(),
            transform: isHovered ? "translateX(2px)" : "translateX(0)",
          }}
        >
          {label}
        </span>
      )}
    </Link>
  )

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col">
          <span className="font-medium">{label}</span>
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}
