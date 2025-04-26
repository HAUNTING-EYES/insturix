"use client"

import { useState } from "react"
import { Bell, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"

interface Notification {
  message: string
  duration: number
  timestamp?: Date
}

interface NotificationPanelProps {
  notifications: Notification[]
  onClose: () => void
}

export function NotificationPanel({ notifications, onClose }: NotificationPanelProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const pageSize = 3
  const totalPages = Math.ceil(notifications.length / pageSize)

  const currentNotifications = notifications.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

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
      <Card className="w-full bg-[#1a1a1f] border-[#2a2a35]">
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
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
                  className="flex items-start gap-3 p-3 rounded-lg bg-[#23232a] border border-[#2a2a35]"
                >
                  <div className="w-8 h-8 bg-[#0e6b9c] rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                    <Bell className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{notification.message}</p>
                    <p className="text-gray-400 text-xs mt-1">{formatTime(notification)}</p>
                  </div>
                </motion.div>
              ))}
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
