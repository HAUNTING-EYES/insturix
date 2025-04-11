"use client";

import type React from "react";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import {
  Home,
  ChevronRight,
  Menu,
  X,
  ChevronLeft,
  Shield,
  Music,
  Edit,
  Brain,
  Share2,
  Star,
  Sparkles,
} from "lucide-react";

import { UserProfile } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import UserDropdown from "@/components/ui/CustomToolTip";

// Define the products with their icons and paths
const products = [
  {
    name: "Alyzitron",
    path: "/dashboard/alyzitron",
    icon: Sparkles,
    description: "AI Analysis Tool",
  },
  {
    name: "Editron",
    path: "/dashboard/editron",
    icon: Edit,
    description: "Advanced Editor",
  },
  {
    name: "Shield",
    path: "/dashboard/shield",
    icon: Shield,
    description: "Security Solution",
  },
  {
    name: "Socialize",
    path: "/dashboard/socialize",
    icon: Share2,
    description: "Social Media Manager",
  },
  {
    name: "ThinkForge",
    path: "/dashboard/thinkforge",
    icon: Brain,
    description: "AI Brainstorming",
  },
  {
    name: "Musitron",
    path: "/dashboard/musitron",
    icon: Music,
    description: "Music Generation",
  },
];

// Create a context for sidebar state management
type SidebarContextType = {
  activeRoute: string;
  setActiveRoute: (route: string) => void;
  theme: {
    activeBackground: string;
    activeText: string;
    hoverBackground: string;
    hoverText: string;
  };
};

const defaultTheme = {
  activeBackground: "bg-primary/10",
  activeText: "text-primary",
  hoverBackground: "hover:bg-muted",
  hoverText: "hover:text-foreground",
};

const SidebarContext = createContext<SidebarContextType>({
  activeRoute: "",
  setActiveRoute: () => {},
  theme: defaultTheme,
});

export const useSidebar = () => useContext(SidebarContext);

export default function DashboardSidebar() {
  const { user } = useUser();
  const pathname = usePathname();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeRoute, setActiveRoute] = useState("");
  const [theme] = useState(defaultTheme);

  // Update active route when pathname changes
  useEffect(() => {
    setActiveRoute(pathname);
    // Close mobile sidebar when route changes
    setIsMobileOpen(false);
  }, [pathname]);

  // Check if window is available (client-side)
  useEffect(() => {
    // Check if the sidebar state is stored in localStorage
    const storedState = localStorage.getItem("sidebarCollapsed");
    if (storedState !== null) {
      setIsCollapsed(storedState === "true");
    }
  }, []);

  // Save sidebar state to localStorage
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", String(newState));
  };

  return (
    <SidebarContext.Provider value={{ activeRoute, setActiveRoute, theme }}>
      {/* Mobile Menu Button */}
      <div className="fixed top-4 left-4 z-[100] lg:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="bg-background/80 backdrop-blur-sm border-border"
          aria-label="Toggle sidebar"
        >
          {isMobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Mobile Overlay */}
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
            isMobileOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          )}
        >
          {/* Header */}
          {/* Logo/header section */}
          <div className="h-16 flex items-center justify-center px-4 border-b border-white/10 bg-zinc-900 relative">
            {!isCollapsed ? (
              <>
                <Link
                  href="/"
                  className="flex items-center justify-center h-full w-full font-bold text-2xl tracking-wide text-white logotext"
                  style={{
                    fontFamily: "'Blanka', 'Montserrat', 'Arial', sans-serif",
                    letterSpacing: "0.15em"
                  }}
                >
                  INSTURIX
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="hidden lg:flex ml-auto"
                >
                  <ChevronLeft className="h-5 w-5 text-white" />
                </Button>
              </>
            ) : (
              // Collapsed: Only show expand button as top icon, centered
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="mx-auto"
                style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-6 w-6 text-white" />
              </Button>
            )}
          </div>

          {/* Navigation */}
          {/* Navigation section */}
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
                  <h3 className="px-2 text-xs font-medium text-muted-foreground mb-4 text-white/70">
                    Products
                  </h3>
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
          {/* Profile section */}
          {user && (
            <div className="border-t border-white/10 py-4 px-2 mt-2 flex justify-center">
              <div
                onClick={() => {
                  if (isCollapsed) setIsCollapsed(false);
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
            <div className="rounded-lg border py-4 px-2 bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Pro Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    All features, unlimited usage
                  </p>
                </div>
                <span className="text-xl font-bold">$19/mo</span>
              </div>
            </div>
            <div className="rounded-lg border p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Enterprise Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    Custom solutions for teams
                  </p>
                </div>
                <span className="text-xl font-bold">Contact us</span>
              </div>
            </div>
            <Button className="w-full">Upgrade Now</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarContext.Provider>
  );
}

// Navigation Item Component
interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isCollapsed: boolean;
  description?: string;
}

function NavItem({
  href,
  icon,
  label,
  isCollapsed,
  description,
}: NavItemProps) {
  const { activeRoute, theme } = useSidebar();
  const isActive = activeRoute === href;

  const content = (
    <Link
      href={href}
      prefetch={true}
      className={cn(
        "flex items-center rounded-lg w-full transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white hover:translate-x-1",
        isActive && "bg-white/10 text-white",
        isCollapsed
          ? "justify-center px-2 gap-0 py-2"
          : "px-2 gap-3 py-2"
      )}
      style={isCollapsed ? { minWidth: 0 } : {}}
    >
      <span
        className={cn(
          "flex items-center justify-center",
          isActive && "text-white"
        )}
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
        }}
      >
        {icon}
      </span>
      {!isCollapsed && <span className="text-sm font-medium tracking-wide">{label}</span>}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col">
          <span className="font-medium">{label}</span>
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
