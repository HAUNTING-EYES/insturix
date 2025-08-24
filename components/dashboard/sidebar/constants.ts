import {
  Shield,
  Music,
  Scissors,
  Brain,
  Share2,
  Video,
  Sparkles,
} from "lucide-react"
import type { Product } from "./types"

// Core Creation Studio tools
export const coreCreationTools: Product[] = [
  {
    name: "ThinkForge",
    path: "/dashboard/thinkforge",
    icon: Brain,
    description: "AI Brainstorming",
    color: "#ef4444",
    hoverColor: "#f87171",
    isPro: false,
  },
  {
    name: "Clickatron",
    path: "/dashboard/clickatron",
    icon: Sparkles,
    description: "YouTube Thumbnail Generator",
    color: "#8B5CF6",
    hoverColor: "#A78BFA",
    isPro: false,
  },
  {
    name: "Editron",
    path: "/dashboard/editron",
    icon: Scissors,
    description: "Advanced Editor",
    color: "#14b8a6",
    hoverColor: "#2dd4bf",
    isPro: false,
  },
  {
    name: "Alyzitron",
    path: "/dashboard/alyzitron",
    icon: Video,
    description: "AI Analysis Tool",
    color: "#3b82f6",
    hoverColor: "#60a5fa",
    isPro: false,
  },
]

// Growth & Legal tools
export const growthLegalTools: Product[] = [
    {
    name: "Musitron",
    path: "/dashboard/musitron",
    icon: Music,
    description: "Music Generation",
    color: "#eab308",
    hoverColor: "#facc15",
    isPro: false,
  },
  {
    name: "Socialize",
    path: "/dashboard/socialize",
    icon: Share2,
    description: "Social Media Manager",
    color: "#0ea5e9",
    hoverColor: "#38bdf8",
    isPro: false,
  },
  {
    name: "Shield",
    path: "/dashboard/shield",
    icon: Shield,
    description: "Security Solution",
    color: "#a855f7",
    hoverColor: "#c084fc",
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