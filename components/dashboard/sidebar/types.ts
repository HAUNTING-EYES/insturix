export interface NavItemProps {
  href: string
  icon: React.ReactNode
  label: string
  isExpanded: boolean
  description?: string
  isPro?: boolean
}

export type SidebarContextType = {
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
  userPlan: string | null
  openUpgradeDialog: () => void
}

export interface Product {
  name: string
  path: string
  icon: any
  description: string
  color: string
  hoverColor: string
  isPro: boolean
}