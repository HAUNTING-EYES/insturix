"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

interface SocializeNotificationCardProps {
  message: string;
  duration: number;
  onEdit: () => void;
}

export function SocializeNotificationCard({ message, duration, onEdit }: SocializeNotificationCardProps) {
  return (
    <Card className="bg-black/40 border-[#0e6b9c]/30 mb-6">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#0e6b9c]/30 rounded-full flex items-center justify-center">
          <Bell className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-white font-medium">{message}</p>
          <p className="text-gray-400 text-sm">Duration: {duration} hours</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
        >
          Edit
        </Button>
      </CardContent>
    </Card>
  );
}