"use client";
import { useEffect, useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// Render our own card container via Popover/Tooltip content to avoid layered radius mismatches
// and boundary leaks on mobile.
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

function PlayerCardContent({ player }: { player: PlayerLike }) {
  const avatarSrc = player?.imageUrl || player?.avatarUrl || undefined;
  const isPaid = player?.payment?.status === "paid";
  const isValorant = player?.game === "valorant" || !!player?.gameDetails?.valorant;
  const isBgmi = player?.game === "bgmi" || !!player?.gameDetails?.bgmi;
  const val = player?.gameDetails?.valorant;
  const bgmi = player?.gameDetails?.bgmi;
  const valAgents = val?.preferredAgents;
  const bgmiUid = bgmi?.uid;
  const insta = player?.instagram;
  const instaDisplay = insta ? (insta.startsWith('@') ? insta : `@${insta.replace(/^https?:\/\/instagram\.com\//i, '')}`) : undefined;
  const instaUrl = insta ? ( /^https?:\/\//i.test(insta) ? insta : `https://instagram.com/${insta.replace(/^@/, '')}`) : undefined;

  return (
    <div className="w-64 max-w-[min(80vw,22rem)] text-white">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-white/80" />
          <div className="text-sm text-white/90 font-medium">player profile</div>
          <div className="ml-auto">
            <Badge className={`h-5 px-1.5 text-[10px] ${isPaid ? 'bg-emerald-600 border-emerald-700' : 'bg-white/10 border-white/10 text-white/80'}`}>{isPaid ? 'Paid' : 'Pending'}</Badge>
          </div>
        </div>
      </div>
      <div className="p-3 pt-1">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-white/10">
            <AvatarImage src={avatarSrc} alt={player?.name || 'Player'} />
            <AvatarFallback className="text-xs text-white/70">
              {(player?.name || 'P')
                .split(' ')
                .map((s) => s[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
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
      </div>
    </div>
  );
}

export default function PlayerHoverCard({ player, children }: { player: PlayerLike; children: React.ReactNode }) {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    // Detect touch by checking primary pointer capability
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouch(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);
  const avatarSrc = player?.imageUrl || player?.avatarUrl || undefined;
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

  // On pointer devices, show tooltip on hover; on touch devices, show popover on tap.
  if (isTouch) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <div>{children}</div>
        </PopoverTrigger>
        <PopoverContent align="center" sideOffset={8} collisionPadding={8} className="p-0 rounded-lg overflow-hidden !bg-zinc-950/95 !text-white backdrop-blur-md shadow-xl ring-1 ring-white/10 border border-white/10 outline-none">
          <PlayerCardContent player={player} />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <div>{children}</div>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="p-0 rounded-lg overflow-hidden !bg-zinc-950/95 !text-white backdrop-blur-md shadow-xl ring-1 ring-white/10 border border-white/10 outline-none">
          <PlayerCardContent player={player} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
