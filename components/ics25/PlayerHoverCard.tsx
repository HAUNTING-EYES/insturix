"use client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

type PlayerLike = {
  name?: string;
  avatarUrl?: string;
  imageUrl?: string; // optional alternative key
  game?: "valorant" | "bgmi" | string;
  payment?: { status?: "paid" | "pending" | string } | null;
  instagram?: string;
  gameDetails?: {
    valorant?: { riotId?: string; rank?: string; preferredAgents?: string };
    bgmi?: { ign?: string; uid?: string; rank?: string };
  };
};

export default function PlayerHoverCard({ player, children }: { player: PlayerLike; children: React.ReactNode }) {
  const avatar = player?.avatarUrl || player?.imageUrl || "/avatar.png";
  const isPaid = player?.payment?.status === "paid";
  const isValorant = player?.game === "valorant" || !!player?.gameDetails?.valorant;
  const isBgmi = player?.game === "bgmi" || !!player?.gameDetails?.bgmi;
  const val = player?.gameDetails?.valorant;
  const bgmi = player?.gameDetails?.bgmi;
  const handle = isValorant ? val?.riotId : isBgmi ? bgmi?.ign : undefined;
  const rank = isValorant ? val?.rank : isBgmi ? bgmi?.rank : undefined;
  const valAgents = val?.preferredAgents;
  const bgmiUid = bgmi?.uid;
  const insta = player?.instagram;
  const instaDisplay = insta ? (insta.startsWith('@') ? insta : `@${insta.replace(/^https?:\/\/instagram\.com\//i, '')}`) : undefined;
  const instaUrl = insta ? ( /^https?:\/\//i.test(insta) ? insta : `https://instagram.com/${insta.replace(/^@/, '')}`) : undefined;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div>
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="p-0 bg-transparent dark:bg-transparent border-0 shadow-none rounded-none overflow-visible">
          <Card className="w-64 rounded-lg border-white/10 bg-zinc-950/90 backdrop-blur">
            <CardHeader className="px-3 py-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-white/80" />
                <CardTitle className="text-sm text-white/90">player profile</CardTitle>
                <div className="ml-auto">
                  <Badge className={`h-5 px-1.5 text-[10px] ${isPaid ? 'bg-emerald-600 border-emerald-700' : 'bg-white/10 border-white/10 text-white/80'}`}>{isPaid ? 'Paid' : 'Pending'}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="flex items-center gap-3">
                <img src={avatar} alt={player?.name || 'Player'} className="h-10 w-10 rounded-full object-cover border border-white/10" />
                <div className="min-w-0">
                  <div className="text-xs text-white/60 truncate">{isValorant ? 'VALORANT' : isBgmi ? 'BGMI' : '—'}</div>
                </div>
              </div>
              <div className="mt-2 border-t border-white/10" />
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Name</span>
                  <span className="text-white/80 truncate max-w-[10rem] text-right">{player?.name || 'Player'}</span>
                </div>
                {isValorant && (
                  <>
                    {val?.riotId && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Riot ID</span>
                        <span className="text-white/80 truncate max-w-[10rem] text-right">{val.riotId}</span>
                      </div>
                    )}
                    {val?.rank && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Rank</span>
                        <span className="text-white/80 truncate max-w-[10rem] text-right">{val.rank}</span>
                      </div>
                    )}
                    {valAgents && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Agents</span>
                        <span className="text-white/80 truncate max-w-[10rem] text-right">{valAgents}</span>
                      </div>
                    )}
                  </>
                )}
                {isBgmi && (
                  <>
                    {bgmi?.ign && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">IGN</span>
                        <span className="text-white/80 truncate max-w-[10rem] text-right">{bgmi.ign}</span>
                      </div>
                    )}
                    {bgmiUid && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">UID</span>
                        <span className="text-white/80 truncate max-w-[10rem] text-right">{bgmiUid}</span>
                      </div>
                    )}
                    {bgmi?.rank && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Rank</span>
                        <span className="text-white/80 truncate max-w-[10rem] text-right">{bgmi.rank}</span>
                      </div>
                    )}
                  </>
                )}
                {instaDisplay && (
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Instagram</span>
                    {instaUrl ? (
                      <a href={instaUrl} target="_blank" rel="noreferrer" className="text-white/80 hover:underline truncate max-w-[10rem] text-right">{instaDisplay}</a>
                    ) : (
                      <span className="text-white/80 truncate max-w-[10rem] text-right">{instaDisplay}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[10px] text-white/40"></div>
            </CardContent>
          </Card>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
