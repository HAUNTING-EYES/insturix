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
    name: "Kundli",
    path: "/dashboard/kundli",
    icon: Star,
    description: "Astrological Charts",
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
      <div
        className={`fixed inset-0 bg-background/80 backdrop-blur-sm z-[90] transition-opacity duration-300 lg:hidden ${
          isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsMobileOpen(false)}
      />

      {/* Main Sidebar */}
      <TooltipProvider delayDuration={300}>
        <aside
          className={cn(
            "fixed top-0 left-0 bottom-0 h-[100dvh] z-[95] border-r bg-background transition-all duration-300 ease-in-out flex flex-col",
            isCollapsed ? "w-[70px]" : "w-[240px]",
            isMobileOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b">
            <Link href="/" className="flex items-center gap-2">
              {!isCollapsed && (
                <span className="font-bold text-xl tracking-tight">
                  INSTURIX
                </span>
              )}
              {isCollapsed && <Sparkles className="h-5 w-5" />}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="hidden lg:flex"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-4 px-3">
            {/* Overview */}
            <div className="mb-4">
              <NavItem
                href="/dashboard"
                icon={<Home className="h-5 w-5" />}
                label="Overview"
                isCollapsed={isCollapsed}
              />
            </div>

            {/* Products Section */}
            <div className="space-y-1">
              {!isCollapsed && (
                <h3 className="px-4 text-xs font-medium text-muted-foreground mb-2">
                  Products
                </h3>
              )}

              {products.map((product) => (
                <NavItem
                  key={product.name}
                  href={product.path}
                  icon={<product.icon className="h-5 w-5" />}
                  label={product.name}
                  isCollapsed={isCollapsed}
                  description={product.description}
                />
              ))}
            </div>
          </div>

          {/* Footer with User Profile */}
          <div className="border-t p-4">
            {user && (
              <UserDropdown
                onSettingsClick={() => setIsSettingsOpen(true)}
                onUpgradeClick={() => setIsUpgradeOpen(true)}
              />
            )}
          </div>
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
            <div className="rounded-lg border p-4 bg-muted/50">
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
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
        isActive
          ? `${theme.activeBackground} ${theme.activeText}`
          : `text-muted-foreground ${theme.hoverBackground} ${theme.hoverText} hover:translate-x-1`
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          isActive && theme.activeText
        )}
      >
        {icon}
      </span>
      {!isCollapsed && <span>{label}</span>}
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
