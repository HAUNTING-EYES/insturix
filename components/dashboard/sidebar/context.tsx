"use client"

import { createContext, useContext } from "react"
import type { SidebarContextType } from "./types"
import { defaultTheme } from "./constants"

export const SidebarContext = createContext<SidebarContextType>({
  activeRoute: "",
  setActiveRoute: () => {},
  activeColor: "",
  hoveredItem: null,
  setHoveredItem: () => {},
  theme: defaultTheme,
  userPlan: null,
  openUpgradeDialog: () => {},
})

export const useSidebar = () => useContext(SidebarContext)