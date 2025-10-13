"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  player?: any;
  onAccept?: () => void;
  onDeny?: () => void;
};

export default function ProfileCardModal({ open, onOpenChange, player, onAccept, onDeny }: Props) {
  if (!player) return null;
  const v = player?.gameDetails?.valorant;
  const b = player?.gameDetails?.bgmi;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>Player Profile</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-4">
          <img src={player.avatarUrl || '/avatar.png'} alt={player.name} className="h-14 w-14 rounded-full object-cover" />
          <div>
            <div className="text-lg font-semibold">{player.name}</div>
            <div className="text-xs text-white/60">{player.email}</div>
          </div>
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
          {v && (
            <div className="rounded border border-white/10 p-3">
              <div className="text-white/60">Valorant</div>
              <div>Riot ID: {v.riotId}</div>
              {v.rank && <div>Rank: {v.rank}</div>}
              {v.preferredAgents && <div>Preferred: {v.preferredAgents}</div>}
            </div>
          )}
          {b && (
            <div className="rounded border border-white/10 p-3">
              <div className="text-white/60">BGMI</div>
              <div>IGN: {b.ign}</div>
              <div>UID: {b.uid}</div>
              {b.rank && <div>Rank: {b.rank}</div>}
            </div>
          )}
        </div>
        {(onAccept || onDeny) && (
          <div className="mt-4 flex gap-2 justify-end">
            {onDeny && <Button variant="secondary" onClick={onDeny}>Deny</Button>}
            {onAccept && <Button onClick={onAccept}>Accept</Button>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
