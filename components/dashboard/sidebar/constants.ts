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

// Phase verbs — NO product names in the sidebar
export const coreCreationTools: Product[] = [
  {
    name: "Script",
    path: "/dashboard/thinkforge",
    icon: Brain,
    description: "Write",
    color: "#D4A652",
    hoverColor: "#E0B86A",
    isPro: false,
  },
  {
    name: "Edit",
    path: "/dashboard/editron",
    icon: Scissors,
    description: "Produce",
    color: "#D46A5C",
    hoverColor: "#E07D70",
    isPro: false,
  },
  {
    name: "Analyze",
    path: "/dashboard/alyzitron",
    icon: Video,
    description: "Score",
    color: "#9088D4",
    hoverColor: "#A49CDE",
    isPro: false,
  },
  {
    name: "Design",
    path: "/dashboard/clickatron",
    icon: Sparkles,
    description: "Thumbnails",
    color: "#5CB8CC",
    hoverColor: "#74C6D6",
    isPro: false,
  },
  {
    name: "Distribute",
    path: "/dashboard/uploaderx",
    icon: Upload,
    description: "Publish",
    color: "#5EC97E",
    hoverColor: "#76D392",
    isPro: false,
  },
]

// Supporting tools
export const growthLegalTools: Product[] = [
  {
    name: "Music",
    path: "/dashboard/musitron",
    icon: Music,
    description: "Sound",
    color: "#D088B4",
    hoverColor: "#DA9CC2",
    isPro: false,
  },
  {
    name: "Share",
    path: "/dashboard/socialize",
    icon: Share2,
    description: "Identity",
    color: "#5CB8CC",
    hoverColor: "#74C6D6",
    isPro: false,
  },
  {
    name: "Team",
    path: "/dashboard/org",
    icon: Users,
    description: "Collaborate",
    color: "#9088D4",
    hoverColor: "#A49CDE",
    isPro: false,
  },
  {
    name: "Billing",
    path: "/dashboard/billing",
    icon: CreditCard,
    description: "Credits",
    color: "#5EC97E",
    hoverColor: "#76D392",
    isPro: false,
  },
]

export const products: Product[] = [...coreCreationTools, ...growthLegalTools]

export const defaultTheme = {
  activeBackground: "rgba(255, 255, 255, 0.1)",
  activeText: "#ffffff",
  hoverBackground: "rgba(255, 255, 255, 0.05)",
  hoverText: "#f0f0f0",
}
