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
    <Card className="bg-black/30 border-[#0e6b9c]/20 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#0e6b9c] bg-gray-800 flex items-center justify-center">
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
            <CardTitle className="text-xl text-white">
              {user?.username}
            </CardTitle>
            <CardDescription className="text-gray-300">
              {bio || "No bio yet. Click edit to add one."}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={onEditBio}
          >
            Edit Bio
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}