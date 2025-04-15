"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import { Sun, Moon, Monitor, Check } from "lucide-react"

interface ThemeOption {
  value: string
  label: string
  icon: React.ReactNode
  color: string
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const themeOptions: ThemeOption[] = [
    {
      value: "light",
      label: "Light",
      icon: <Sun className="h-4 w-4" />,
      color: "bg-gradient-to-br from-blue-50 to-gray-100 border border-gray-200",
    },
    {
      value: "dark",
      label: "Dark",
      icon: <Moon className="h-4 w-4" />,
      color: "bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700",
    },
    {
      value: "system",
      label: "System",
      icon: <Monitor className="h-4 w-4" />,
      color: "bg-gradient-to-br from-purple-500/20 to-purple-700/20 border border-purple-500/30",
    },
  ]

  const currentTheme = themeOptions.find((t) => t.value === theme) || themeOptions[0]

  return (
    <div className="relative">
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-full p-1.5 text-sm font-medium transition-all ${
          isOpen ? "ring-2 ring-purple-500/50" : ""
        } ${currentTheme.color}`}
        aria-label={`Current theme: ${currentTheme.label}`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            theme === "dark" ? "text-yellow-300" : theme === "light" ? "text-blue-500" : "text-purple-500"
          }`}
        >
          {currentTheme.icon}
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-48 origin-top-right rounded-lg bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-zinc-900 dark:ring-white/10"
          >
            <div className="py-1">
              {themeOptions.map((option) => (
                <motion.button
                  key={option.value}
                  whileHover={{ backgroundColor: "rgba(0,0,0,0.05)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setTheme(option.value)
                    setIsOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${
                    theme === option.value ? "text-purple-600 dark:text-purple-400" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        option.value === "dark"
                          ? "bg-gray-900 text-yellow-300"
                          : option.value === "light"
                            ? "bg-blue-50 text-blue-500"
                            : "bg-purple-100 text-purple-500 dark:bg-purple-900/30"
                      }`}
                    >
                      {option.icon}
                    </span>
                    <span>{option.label}</span>
                  </div>
                  {theme === option.value && <Check className="h-4 w-4" />}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
