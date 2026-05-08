import {
  Music,
  Scissors,
  Brain,
  Share2,
  Video,
  Sparkles,
  CreditCard,
  Users,
  Upload,
} from "lucide-react"
import type { Product } from "./types"

// Core Creation Studio tools
export const coreCreationTools: Product[] = [
  {
    name: "Script",
    path: "/dashboard/thinkforge",
    icon: Brain,
    description: "AI Scripting & Ideation",
    color: "#ef4444",
    hoverColor: "#f87171",
    isPro: false,
  },
  {
    name: "Thumbnail",
    path: "/dashboard/clickatron",
    icon: Sparkles,
    description: "AI Thumbnail Designer",
    color: "#8B5CF6",
    hoverColor: "#A78BFA",
    isPro: false,
  },
  {
    name: "Editor",
    path: "/dashboard/editron",
    icon: Scissors,
    description: "Cloud Video Editor",
    color: "#14b8a6",
    hoverColor: "#2dd4bf",
    isPro: false,
  },
  {
    name: "Analyze",
    path: "/dashboard/alyzitron",
    icon: Video,
    description: "Performance Insights",
    color: "#3b82f6",
    hoverColor: "#60a5fa",
    isPro: false,
  },
  {
    name: "Upload",
    path: "/dashboard/uploaderx",
    icon: Upload,
    description: "Smart Distribution",
    color: "#22c55e",
    hoverColor: "#4ade80",
    isPro: false,
  },
]

// Growth & Legal tools
export const growthLegalTools: Product[] = [
    {
    name: "Music",
    path: "/dashboard/musitron",
    icon: Music,
    description: "AI Soundtrack Studio",
    color: "#eab308",
    hoverColor: "#facc15",
    isPro: false,
  },
  {
    name: "Social",
    path: "/dashboard/socialize",
    icon: Share2,
    description: "Growth & Engagement",
    color: "#0ea5e9",
    hoverColor: "#38bdf8",
    isPro: false,
  },
  {
    name: "Team",
    path: "/dashboard/org",
    icon: Users,
    description: "Team Collaboration",
    color: "#a855f7",
    hoverColor: "#c084fc",
    isPro: false,
  },
  {
    name: "Credits",
    path: "/dashboard/billing",
    icon: CreditCard,
    description: "Usage & Transactions",
    color: "#10b981",
    hoverColor: "#34d399",
    isPro: false,
  },
]

// Combined products array for backward compatibility
export const products: Product[] = [...coreCreationTools, ...growthLegalTools]

export const defaultTheme = {
  activeBackground: "rgba(255, 255, 255, 0.1)",
  activeText: "#ffffff",
  hoverBackground: "rgba(255, 255, 255, 0.05)",
  hoverText: "#f0f0f0",
}