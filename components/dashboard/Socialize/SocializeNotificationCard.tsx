"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

interface SocializeNotificationCardProps {
  message: string;
  duration: number;
  timestamp?: string;
  expiresAt?: string;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}

export function SocializeNotificationCard({ message, duration, timestamp, expiresAt, onEdit, onDelete, isDeleting }: SocializeNotificationCardProps) {
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="bg-black/40 border-[#0e6b9c]/30 mb-6 relative">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#0e6b9c]/30 rounded-full flex items-center justify-center">
          <Bell className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{message}</p>
          <div className="text-gray-500 text-xs flex flex-wrap gap-x-3 gap-y-1 mt-1">
            <span>Duration: {duration} hours</span>
            {timestamp && <span>Created: {formatTime(timestamp)}</span>}
            {expiresAt && <span>Expires: {formatTime(expiresAt)}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={isDeleting}
            className="text-gray-400 hover:text-gray-200 p-1 h-auto"
          >
            <svg xmlns="http://www.w3.org/200/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/>
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-gray-400 hover:text-red-400 p-1 h-auto"
          >
            {isDeleting ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-loader-circle animate-spin">
                <path d="M21 12a9 9 0 1 1-6.55-8.45 3.54 3.54 0 0 0-5.9 2.89 4 4 0 0 0 0 5.12A9 9 0 0 1 21 12Z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                <line x1="10" x2="10" y1="11" y2="17"/>
                <line x1="14" x2="14" y1="11" y2="17"/>
              </svg>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}