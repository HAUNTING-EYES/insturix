"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface SocializeHeaderProps {
  user: { username?: string; imageUrl?: string } | null;
  bio: string;
  onEditBio: () => void;
  status?: string;
  accentColor?: string;
}

export function SocializeHeader({ user, bio, onEditBio, status, accentColor }: SocializeHeaderProps) {
  const accentHex: Record<string, string> = { gold: "#D4A652", cyan: "#5CB8CC", rose: "#D088B4", green: "#5EC97E", purple: "#9088D4", coral: "#D46A5C" };
  const resolvedAccent = accentHex[accentColor || "gold"] || accentHex.gold;

  return (
    <Card className="border-none shadow-none" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border flex items-center justify-center" style={{ backgroundColor: '#1B1A18', borderColor: resolvedAccent }}>
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                width={64}
                height={64}
                alt={`${user?.username}'s profile picture`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[11px] text-gray-400">No Pic</span>
            )}
          </div>
          <div>
            <CardTitle className="text-[18px] font-medium" style={{ color: '#EAE9E5' }}>
              {user?.username}
            </CardTitle>
            <CardDescription style={{ color: '#B5B2A8' }}>
              {bio || "No bio yet. Click edit to add one."}
            </CardDescription>
            {status && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "rgba(212,166,82,.08)", border: "1px solid rgba(212,166,82,.16)", fontSize: "0.7rem", color: "#D4A652", fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.03em", marginTop: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#D4A652" }} />
                {status}
              </div>
            )}
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