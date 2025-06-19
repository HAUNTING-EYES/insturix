// Centralized theme configuration for upgrade plans - Enhanced colorful theme
export const PLAN_THEME = {
  // Enhanced gradients with vibrant but sophisticated colors
  gradients: {
    primary: "from-blue-500 to-blue-400",
    primaryDark: "from-blue-600 to-blue-500",
    primaryHover: "from-blue-400 to-blue-300",
    popular: "from-purple-500 to-purple-400",
    text: "from-white to-gray-100",
    save: "from-green-500 to-green-400",
    accent: "from-amber-400 to-amber-300",
    success: "from-emerald-500 to-emerald-400",
    info: "from-cyan-500 to-cyan-400",
    warning: "from-yellow-500 to-yellow-400",
    secondary: "from-slate-400 to-slate-300"
  },
  
  // Plan colors with enhanced vibrant theme
  planColors: {
    free: "#10b981", // Emerald green for free
    plus: "#3b82f6",  // Blue for plus
    pro: "#8b5cf6",   // Purple for pro
    premium: "#f59e0b" // Amber for premium
  },
  
  // Color palette for consistent theming
  colors: {
    primary: "#3b82f6", // Blue
    accent: "#f59e0b", // Amber
    success: "#10b981", // Emerald
    info: "#06b6d4", // Cyan
    warning: "#f59e0b", // Amber
    danger: "#ef4444", // Red
    secondary: "#64748b", // Slate
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      muted: "rgba(255, 255, 255, 0.5)"
    }
  },
  
  // Animation settings
  animation: {
    duration: 0.4,
    ease: "easeInOut",
    heightDuration: 0.3
  },
  
  // Enhanced glow effects with color variety
  glow: {
    color: "rgba(59, 130, 246, 0.3)", // Blue glow
    hoverColor: "rgba(147, 51, 234, 0.4)", // Purple hover glow
    size: 500,
    blur: 80
  }
} as const;

// Helper function to get plan color
export const getPlanColor = (planId: string): string => {
  return PLAN_THEME.planColors[planId as keyof typeof PLAN_THEME.planColors] || PLAN_THEME.planColors.free;
};

// Helper function to get gradient classes
export const getGradientClass = (type: keyof typeof PLAN_THEME.gradients): string => {
  return `bg-gradient-to-r ${PLAN_THEME.gradients[type]}`;
};