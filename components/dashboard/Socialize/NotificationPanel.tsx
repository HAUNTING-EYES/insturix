
"use client"

import { useState, useEffect } from "react"
import { Bell, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
// Import the utility function
import { isNotificationExpired } from "@/lib/utils/notification"

interface Notification {
  message: string
  duration: number
  timestamp?: string
  expiresAt?: string // Added field for explicit expiry time
}

interface NotificationPanelProps {
  notifications: Notification[]
  onClose: () => void
}

export function NotificationPanel({ notifications, onClose }: NotificationPanelProps) {
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const pageSize = 3

  /**
   * Effect to filter expired notifications and set up a periodic re-check.
   */
  // useEffect(() => {
  //   const filterValidNotifications = () => {
  //     // Filter out notifications where the isNotificationExpired utility returns true
  //     const valid = notifications.filter((n) => !isNotificationExpired(n))
  //     setFilteredNotifications(valid)
  //     // Reset page if current page index is now invalid
  //     if (currentPage >= Math.ceil(valid.length / pageSize)) {
  //       setCurrentPage(0);
  //     }
  //   }

  useEffect(() => {
  const filterValidNotifications = () => {
    const valid = notifications.filter((n) => !isNotificationExpired(n))
    setFilteredNotifications(valid)
    if (currentPage >= Math.ceil(valid.length / pageSize)) {
      setCurrentPage(0)
    }
  }

  filterValidNotifications()
  const interval = setInterval(filterValidNotifications, 30 * 1000)
  return () => clearInterval(interval)
}, [notifications]) // ✅ only depends on notifications


    // filterValidNotifications()

    // Periodically re-check expiration (e.g., every 30 seconds)
  //   const interval = setInterval(filterValidNotifications, 30 * 1000) 
  //   return () => clearInterval(interval) // Cleanup function
  // }, [notifications, currentPage]) // Dependency on notifications and currentPage

  const totalPages = Math.ceil(filteredNotifications.length / pageSize)
  const currentNotifications = filteredNotifications.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )

  const formatTime = (notification: Notification) => {
    if (notification.timestamp) {
      return new Date(notification.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    }
    return "Just now"
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="w-full"
    >
      <Card className="w-full border-social-line shadow-none" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2" style={{ fontWeight: 500 }}>
            <Bell className="w-4 h-4" />
            Notifications
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </CardHeader>

        <CardContent className="px-4 pb-4 pt-0">
          <AnimatePresence mode="wait">
            <div className="space-y-3">
              {currentNotifications.map((notification, index) => (
                <motion.div
                  key={`${index}-${notification.message}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-3 p-3 rounded-lg border border-[#2a2a35]"
                  style={{ backgroundColor: '#1B1A18' }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm flex-shrink-0" style={{ backgroundColor: '#D4A652' }}>
                    <Bell className="w-4 h-4" style={{ color: '#0B0B0A' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: '#EAE9E5' }}>{notification.message}</p>
                    <p className="text-xs mt-1" style={{ color: '#B5B2A8' }}>{formatTime(notification)}</p>
                  </div>
                </motion.div>
              ))}

              {filteredNotifications.length === 0 && (
                <p className="text-gray-400 text-center text-sm mt-4">
                  No active notifications
                </p>
              )}
            </div>
          </AnimatePresence>

          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                disabled={currentPage === 0}
                className="text-xs h-8"
              >
                Previous
              </Button>
              <span className="text-xs text-gray-400">
                {currentPage + 1} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                disabled={currentPage === totalPages - 1}
                className="text-xs h-8"
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}