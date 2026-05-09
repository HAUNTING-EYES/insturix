"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface SocializeHeaderProps {
  user: { username?: string; imageUrl?: string } | null;
  bio: string;
  onEditBio: () => void;
}

export function SocializeHeader({ user, bio, onEditBio }: SocializeHeaderProps) {
  return (
    <Card className="border-none shadow-none" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border flex items-center justify-center" style={{ backgroundColor: '#1B1A18', borderColor: '#D4A652' }}>
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                width={64}
                height={64}
                alt={`${user?.username}'s profile picture`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-gray-400">No Pic</span>
            )}
          </div>
          <div>
            <CardTitle className="text-xl font-medium" style={{ color: '#EAE9E5' }}>
              {user?.username}
            </CardTitle>
            <CardDescription style={{ color: '#B5B2A8' }}>
              {bio || "No bio yet. Click edit to add one."}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto border-transparent hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#1B1A18', color: '#EAE9E5' }}
            onClick={onEditBio}
          >
            Edit Bio
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}