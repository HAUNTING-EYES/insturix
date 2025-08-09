export const sidebarVariants = {
  collapsed: {
    width: 64,
    transition: {
      duration: typeof window !== "undefined" && window.innerWidth < 1024 ? 0.15 : 0.3,
      ease: [0.4, 0, 0.2, 1],
      when: "afterChildren",
      staggerChildren: typeof window !== "undefined" && window.innerWidth < 1024 ? 0 : 0.02,
      staggerDirection: -1,
    },
  },
  expanded: {
    width: 240,
    transition: {
      duration: typeof window !== "undefined" && window.innerWidth < 1024 ? 0.15 : 0.3,
      ease: [0.4, 0, 0.2, 1],
      when: "beforeChildren",
      staggerChildren: typeof window !== "undefined" && window.innerWidth < 1024 ? 0 : 0.02,
    },
  },
} as const

export const linkVariants = {
  expanded: {
    paddingLeft: "4px",
    paddingRight: "8px",
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    }
  },
  collapsed: {
    paddingLeft: "0px",
    paddingRight: "8px", 
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    }
  }
} as const

export const containerVariants = {
  expanded: {
    marginLeft: "0px",
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
      delay: 0.1
    }
  },
  collapsed: {
    marginLeft: "5px",
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
      delay: 0
    }
  }
} as const

export const textContainerVariants = {
  expanded: {
    opacity: 1,
    width: "auto",
    marginLeft: "12px",
    transition: {
      opacity: {
        duration: 0.25,
        ease: "easeOut",
        delay: 0.15
      },
      width: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
        delay: 0.1
      },
      marginLeft: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
        delay: 0.1
      }
    }
  },
  collapsed: {
    opacity: 0,
    width: "0px",
    marginLeft: "0px",
    transition: {
      opacity: {
        duration: 0.2,
        ease: "easeIn",
        delay: 0
      },
      width: {
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1],
        delay: 0.05
      },
      marginLeft: {
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1],
        delay: 0.05
      }
    }
  }
} as const