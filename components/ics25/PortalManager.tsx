"use client";
import { useEffect, useState } from "react";
import { inviteUrl } from "@/lib/ics25/teams";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Users, CreditCard, CheckCircle2, Clock, ShieldAlert, Link as LinkIcon, CircleDollarSign, LogOut, Trash2, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams, useRouter } from "next/navigation";

export default function PortalManager() {
  const { user } = useUser();
  const { toast } = useToast();
  const userId = user?.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const [me, setMe] = useState<any | null>(null);
  const [team, setTeam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [paying, setPaying] = useState(false);

  const [activeTab, setActiveTab] = useState<string>("registration");

  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseTeams, setBrowseTeams] = useState<any[]>([]);
  const [browseQuery, setBrowseQuery] = useState("");

  const [profile, setProfile] = useState<{ name: string; phone?: string; instagram?: string; discord?: string; riotId?: string; ign?: string; uid?: string }>({ name: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [pendingProfiles, setPendingProfiles] = useState<any[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<any[]>([]);
  const [invitedTeam, setInvitedTeam] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch('/api/ics25/players/me');
        if (r.status === 401) { setMe(null); setTeam(null); return; }
        if (!r.ok) throw new Error('Failed to load your profile');
        const meData = await r.json();
        setMe(meData.player || null);
        const p = meData.player;
        if (p) {
          setProfile({
            name: p.name || "",
            phone: p.phone || "",
            instagram: p.instagram || "",
            discord: p.discord || "",
            riotId: p.gameDetails?.valorant?.riotId || "",
            ign: p.gameDetails?.bgmi?.ign || "",
            uid: p.gameDetails?.bgmi?.uid || "",
          });
        }
        if (meData?.player?.teamCode && meData.player.teamCode !== 'awaiting') {
          const tr = await fetch(`/api/ics25/teams?code=${encodeURIComponent(meData.player.teamCode)}`);
          const td = await tr.json();
          setTeam(td.team || null);
          if (td?.team) {
            const idsArr = Array.from(new Set([...(td.team.members||[]), ...(td.team.pendingRequests||[])]));
            if (idsArr.length) {
              const ids = idsArr.join(',');
              const pr = await fetch(`/api/ics25/players?ids=${encodeURIComponent(ids)}`);
              const pd = await pr.json();
              const players = Array.isArray(pd.players) ? pd.players : [];
              setMemberProfiles(players.filter((p: any)=> (td.team.members||[]).includes(p.clerkUserId)));
              setPendingProfiles(players.filter((p: any)=> (td.team.pendingRequests||[]).includes(p.clerkUserId)));
            } else {
              setMemberProfiles([]);
              setPendingProfiles([]);
            }
          }
        } else {
          setTeam(null); setPendingProfiles([]); setMemberProfiles([]);
          // If no team, check for invite code in URL and prefill
          const codeParam = searchParams?.get('code');
          if (codeParam) {
            setActiveTab('team');
            setJoinCode(codeParam);
            try {
              const tr = await fetch(`/api/ics25/teams?code=${encodeURIComponent(codeParam)}`);
              const td = await tr.json();
              setInvitedTeam(td?.team || null);
            } catch {}
            // Clean URL to /ics25/my (keep portal state only in memory)
            try { router.replace('/ics25/my'); } catch {}
          }
        }
      } catch (e: any) {
        setError(e.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isLeader = !!(me && team && team.leaderId === me.clerkUserId);
  const game = me?.game;
  const teamGame = team?.game || game;
  const maxMembers = teamGame === 'valorant' ? 5 : teamGame === 'bgmi' ? 4 : 0;

  const copy = async (text: string) => {
    try {
      if (typeof window !== 'undefined') await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Invite link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Couldn't copy to clipboard.", variant: "destructive" as any });
    }
  };

  const refreshMe = async () => {
    const r = await fetch('/api/ics25/players/me');
    if (r.ok) {
      const meData = await r.json();
      setMe(meData.player || null);
      if (meData?.player?.teamCode && meData.player.teamCode !== 'awaiting') {
        const tr = await fetch(`/api/ics25/teams?code=${encodeURIComponent(meData.player.teamCode)}`);
        const td = await tr.json();
        setTeam(td.team || null);
        if (td?.team) {
          const idsArr = Array.from(new Set([...(td.team.members||[]), ...(td.team.pendingRequests||[])]));
          if (idsArr.length) {
            const ids = idsArr.join(',');
            const pr = await fetch(`/api/ics25/players?ids=${encodeURIComponent(ids)}`);
            const pd = await pr.json();
            const players = Array.isArray(pd.players) ? pd.players : [];
            setMemberProfiles(players.filter((p: any)=> (td.team.members||[]).includes(p.clerkUserId)));
            setPendingProfiles(players.filter((p: any)=> (td.team.pendingRequests||[]).includes(p.clerkUserId)));
          } else {
            setMemberProfiles([]);
            setPendingProfiles([]);
          }
        }
      } else { setTeam(null); setPendingProfiles([]); setMemberProfiles([]); }
    }
  };

  const fetchJoinableTeams = async (page = 1) => {
    try {
      if (!game) return;
      setBrowseLoading(true);
      const r = await fetch(`/api/ics25/teams?game=${game}&status=incomplete&page=${page}&limit=10`);
      const d = await r.json();
      if (r.ok && d.ok) {
        setBrowseTeams(d.teams || []);
        setBrowsePage(d.page || 1);
        setBrowseTotalPages(d.pages || 1);
      }
    } finally {
      setBrowseLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'team' && !team) {
      fetchJoinableTeams(1);
    }
  }, [activeTab, game]);

  const handleJoinByCode = async (codeFromList?: string) => {
    const codeVal = (codeFromList ?? joinCode).trim();
    if (!codeVal) return;
    if (!game) {
      toast({ title: "Select your game", description: "Edit your registration to choose a game first.", variant: "destructive" as any });
      return;
    }
    setJoining(true);
    try {
      const r = await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'requestJoin', code: codeVal }) });
      if (!r.ok) throw new Error('Failed to send join request');
      toast({ title: "Request sent", description: `Requested to join ${codeVal}` });
      setMe((prev: any) => prev ? { ...prev, teamRequests: Array.from(new Set([...(prev.teamRequests||[]), codeVal])) } : prev);
      setJoinCode("");
      // Clear invite query from URL to avoid repeated prompts
      try { router.replace('/ics25/my'); } catch {}
    } catch (e: any) {
      toast({ title: "Couldn't send request", description: e.message || 'Try again later', variant: "destructive" as any });
    } finally {
      setJoining(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    if (!game) {
      toast({ title: "Select your game", description: "Edit your registration to choose a game first.", variant: "destructive" as any });
      return;
    }
    setCreating(true);
    try {
      const r = await fetch('/api/ics25/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamName: teamName.trim(), game }) });
      if (!r.ok) throw new Error('Failed to create team');
      const d = await r.json();
      toast({ title: "Team created", description: `${teamName.trim()} • Code ${d.team.code}` });
      // Open the portal with the invite code so it picks up and shows the team inline
      window.location.href = `/ics25/my?code=${encodeURIComponent(d.team.code)}&game=${encodeURIComponent(game)}`;
    } catch (e: any) {
      toast({ title: "Creation failed", description: e.message || 'Try again later', variant: "destructive" as any });
    } finally {
      setCreating(false);
    }
  };

  const handleCancelRequest = async (code: string) => {
    try {
      const r = await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancelRequest', code }) });
      if (!r.ok) throw new Error('Failed to cancel');
      toast({ title: "Cancelled", description: `Join request to ${code} cancelled` });
      setMe((prev: any) => prev ? { ...prev, teamRequests: (prev.teamRequests||[]).filter((c: string)=> c !== code) } : prev);
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e.message || 'Try again later', variant: "destructive" as any });
    }
  };

  const leaveTeam = async () => {
    if (!team) return;
    if (team && me && team.leaderId === me.clerkUserId) {
      toast({ title: "Leader cannot leave", description: "Transfer leadership or delete team.", variant: "destructive" as any });
      return;
    }
    const r = await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'leaveTeam', code: team.code }) });
    if (r.ok) {
      toast({ title: "Left team", description: "You're no longer a member." });
      await refreshMe();
    } else {
      toast({ title: "Failed to leave", description: "Please try again", variant: "destructive" as any });
    }
  };

  const deleteTeam = async () => {
    if (!team) return;
    const r = await fetch(`/api/ics25/teams?code=${encodeURIComponent(team.code)}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: "Team deleted", description: `${team.teamName} was deleted` });
      await refreshMe();
    } else {
      toast({ title: "Delete failed", description: "Please try again", variant: "destructive" as any });
    }
  };

  const acceptRequest = async (playerId: string) => {
    if (!team) return;
    try {
      const r = await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', code: team.code, playerId }) });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.message || 'Failed to accept');
      toast({ title: 'Accepted', description: 'Player added to team' });
      await refreshMe();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message || 'Try again later', variant: 'destructive' as any });
    }
  };

  const denyRequest = async (playerId: string) => {
    if (!team) return;
    try {
      const r = await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deny', code: team.code, playerId }) });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.message || 'Failed to deny');
      toast({ title: 'Removed', description: 'Request denied' });
      await refreshMe();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message || 'Try again later', variant: 'destructive' as any });
    }
  };

  const handlePayNow = async () => {
    try {
      setPaying(true);
      const cr = await fetch('/api/ics25/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 500 }) });
      const cd = await cr.json();
      if (!cd.ok) throw new Error(cd.message || 'Failed to create order');

      if (!(window as any).Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
        await new Promise((res, rej) => { script.onload = res as any; script.onerror = () => rej(new Error('Failed to load Razorpay')); });
      }

      const options = {
        key: cd.key,
        order_id: cd.orderId,
        name: 'Insturix',
        description: `ICS’25 ${game?.toUpperCase()} Registration`,
        amount: cd.amount,
        currency: cd.currency,
        prefill: { name: me?.name, email: me?.email, contact: me?.phone },
        theme: { color: '#8b5cf6' },
        handler: async (resp: any) => {
          try {
            const vr = await fetch('/api/ics25/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: cd.orderId, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }) });
            const vd = await vr.json();
            if (!vd.ok) throw new Error(vd.message || 'Verification failed');
            toast({ title: "Payment successful", description: "We’ve verified your payment." });
            await refreshMe();
          } catch (e: any) {
            toast({ title: "Verification error", description: e.message || 'Please contact support.', variant: "destructive" as any });
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      } as any;

      const rz = new (window as any).Razorpay(options);
      rz.open();
    } catch (e: any) {
      setPaying(false);
      toast({ title: "Payment error", description: e.message || 'Try again later', variant: "destructive" as any });
    }
  };

  const saveProfile = async () => {
    try {
      setSavingProfile(true);
      const body: any = {
        name: profile.name,
        phone: profile.phone,
        instagram: profile.instagram,
        discord: profile.discord,
      };
      if (me?.game === 'valorant') body.gameDetails = { valorant: { riotId: profile.riotId } };
  if (me?.game === 'bgmi') body.gameDetails = { bgmi: { ign: profile.ign, uid: profile.uid } };
      const r = await fetch('/api/ics25/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Failed to save');
      toast({ title: "Saved", description: "Your registration details were updated." });
      await refreshMe();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message || 'Please try again later', variant: "destructive" as any });
    } finally {
      setSavingProfile(false);
    }
  };

  if (!userId) return <div className="mt-6 text-white/70">Please sign in to access your portal.</div>;
  if (loading) return (
    <div className="mt-6 grid md:grid-cols-3 gap-4">
      <Skeleton className="h-40 rounded-lg md:col-span-2" />
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-56 rounded-lg md:col-span-2" />
      <Skeleton className="h-56 rounded-lg" />
    </div>
  );
  if (error) return <div className="mt-6 text-red-400">{error}</div>;
  if (!me) return <div className="mt-6 text-white/70">No registration found. Please complete the ICS’25 registration first.</div>;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/60 to-zinc-900/20 p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">ICS’25 Player Portal</h1>
            <p className="text-sm text-white/60">Manage registration, teams, cashbacks and payments.</p>
          </div>
          <div className="flex items-center gap-2">
            {me.payment?.status === 'paid' ? (
              <Badge className="gap-1 bg-emerald-600 text-white border-emerald-700"><CheckCircle2 className="h-4 w-4" /> Paid</Badge>
            ) : (
              <>
                <Badge className="gap-1 bg-amber-500 text-black border-amber-600"><Clock className="h-4 w-4" /> Pending</Badge>
                <Button size="sm" onClick={handlePayNow} disabled={paying} className="gap-1">
                  <CircleDollarSign className="h-4 w-4" /> {paying ? 'Processing…' : 'Pay Now'}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="text-xs text-white/50">Game: <span className="font-medium text-white/70">{me.game?.toUpperCase() || '—'}</span> {team ? (
          <span className="ml-2 flex items-center gap-1">
            • Team: <span className="text-white/70">{team.teamName}</span>
            <span className="text-white/40">(Code:</span> <span className="font-mono text-white/70">{team.code}</span><span className="text-white/40">)</span>
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={()=>copy(team.code)}>
              <Copy className="h-3 w-3" />
            </Button>
          </span>
        ) : (
          <span className="ml-2">• Team: <span className="opacity-80">awaiting</span></span>
        )}</div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="registration">Registration</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="cashbacks">Cashbacks</TabsTrigger>
          <TabsTrigger value="event">Event details</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
        </TabsList>

        <TabsContent value="registration">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> {editingProfile ? 'Edit your details' : 'Your registration details'}</CardTitle>
                  <CardDescription>{editingProfile ? 'Update your personal and game-specific fields' : 'You can edit these anytime'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!editingProfile ? (
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-white/60">Full name</div>
                        <div className="text-white/90">{profile.name || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/60">Phone</div>
                        <div className="text-white/90">{profile.phone || '—'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-white/60">Instagram</div>
                          <div className="text-white/90">{profile.instagram || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-white/60">Discord</div>
                          <div className="text-white/90">{profile.discord || '—'}</div>
                        </div>
                      </div>
                      {me?.game === 'valorant' && (
                        <div>
                          <div className="text-xs text-white/60">Riot ID</div>
                          <div className="text-white/90">{profile.riotId || '—'}</div>
                        </div>
                      )}
                      {me?.game === 'bgmi' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-white/60">BGMI IGN</div>
                            <div className="text-white/90">{profile.ign || '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/60">BGMI UID</div>
                            <div className="text-white/90">{profile.uid || '—'}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="text-xs text-white/60">Full name</label>
                        <Input value={profile.name} onChange={(e)=>setProfile(p=>({...p, name: e.target.value}))} />
                      </div>
                      <div>
                        <label className="text-xs text-white/60">Phone</label>
                        <Input value={profile.phone || ''} onChange={(e)=>setProfile(p=>({...p, phone: e.target.value}))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/60">Instagram</label>
                          <Input value={profile.instagram || ''} onChange={(e)=>setProfile(p=>({...p, instagram: e.target.value}))} placeholder="@username" />
                        </div>
                        <div>
                          <label className="text-xs text-white/60">Discord</label>
                          <Input value={profile.discord || ''} onChange={(e)=>setProfile(p=>({...p, discord: e.target.value}))} placeholder="user#1234" />
                        </div>
                      </div>
                      {me?.game === 'valorant' && (
                        <div>
                          <label className="text-xs text-white/60">Riot ID</label>
                          <Input value={profile.riotId || ''} onChange={(e)=>setProfile(p=>({...p, riotId: e.target.value}))} placeholder="name#TAG" />
                        </div>
                      )}
                      {me?.game === 'bgmi' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-white/60">BGMI IGN</label>
                            <Input value={profile.ign || ''} onChange={(e)=>setProfile(p=>({...p, ign: e.target.value}))} />
                          </div>
                          <div>
                            <label className="text-xs text-white/60">BGMI UID</label>
                            <Input value={profile.uid || ''} onChange={(e)=>setProfile(p=>({...p, uid: e.target.value}))} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex items-center gap-2">
                  {!editingProfile ? (
                    <Button onClick={()=>setEditingProfile(true)}>Edit</Button>
                  ) : (
                    <>
                      <Button onClick={async ()=>{ await saveProfile(); setEditingProfile(false); }} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</Button>
                      <Button variant="ghost" onClick={()=>{ // reset local changes
                        const p = me;
                        if (p) {
                          setProfile({
                            name: p.name || '',
                            phone: p.phone || '',
                            instagram: p.instagram || '',
                            discord: p.discord || '',
                            riotId: p.gameDetails?.valorant?.riotId || '',
                            ign: p.gameDetails?.bgmi?.ign || '',
                            uid: p.gameDetails?.bgmi?.uid || '',
                          });
                        }
                        setEditingProfile(false);
                      }}>Cancel</Button>
                    </>
                  )}
                </CardFooter>
              </Card>
            </div>
            <div className="space-y-4">
              {me?.teamRequests?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sent join requests</CardTitle>
                    <CardDescription>Pending approvals from team leaders</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {me.teamRequests.map((c: string) => (
                      <div key={c} className="flex items-center justify-between p-2 rounded-md border border-zinc-800/50">
                        <div className="text-sm text-white/80">Code: <span className="font-mono">{c}</span></div>
                        <Button variant="ghost" size="sm" onClick={()=>handleCancelRequest(c)}>Cancel</Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              {team ? (
                <>
                  {/* Team Overview */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="h-5 w-5" /> {team.teamName}
                        <Badge variant="secondary" className="ml-1">{team.game?.toUpperCase()}</Badge>
                      </CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <span>Code: <span className="font-mono text-white/80">{team.code}</span></span>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={()=>copy(team.code)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <span className="hidden sm:inline text-white/40">•</span>
                        {/* Team page link removed: invites open portal directly */}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const memberCount = team.members?.length || 0;
                        const slotsLeft = Math.max(0, (maxMembers || 0) - memberCount);
                        const paidCount = memberProfiles.filter((m:any)=>m.payment?.status==='paid').length;
                        const leaderProfile = memberProfiles.find((p:any)=>p.clerkUserId === team.leaderId);
                        const pct = maxMembers ? Math.min(100, Math.round((memberCount / maxMembers) * 100)) : 0;
                        return (
                          <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="rounded-md border border-zinc-800/50 p-2">
                                <div className="text-white/50">Members</div>
                                <div className="text-white/90 text-sm font-medium">{memberCount}/{maxMembers}</div>
                              </div>
                              <div className="rounded-md border border-zinc-800/50 p-2">
                                <div className="text-white/50">Paid</div>
                                <div className="text-white/90 text-sm font-medium">{paidCount}/{memberCount}</div>
                              </div>
                              <div className="rounded-md border border-zinc-800/50 p-2">
                                <div className="text-white/50">Slots left</div>
                                <div className="text-white/90 text-sm font-medium">{slotsLeft}</div>
                              </div>
                              <div className="rounded-md border border-zinc-800/50 p-2">
                                <div className="text-white/50">Leader</div>
                                <div className="text-white/90 text-sm font-medium truncate">{leaderProfile?.name || '—'}</div>
                              </div>
                            </div>
                            <div className="mt-3">
                              <div className="h-2 w-full rounded bg-white/5 overflow-hidden">
                                <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="mt-1 text-[10px] text-white/50">Team completion {pct}%</div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {!isLeader && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="outline" className="gap-1"><LogOut className="h-4 w-4" /> Leave team</Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Leave team?</AlertDialogTitle>
                                      <AlertDialogDescription>Are you sure you want to leave <b>{team.teamName}</b>?</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={leaveTeam}>Leave</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              {isLeader && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" className="gap-1"><Trash2 className="h-4 w-4" /> Delete team</Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete this team?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Deleting will remove all members. This cannot be undone and refunds are not applicable.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={deleteTeam}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              <Button variant="secondary" className="gap-1" onClick={()=>copy(inviteUrl(team.game, team.code))}><Copy className="h-4 w-4" /> Copy invite link</Button>
                            </div>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Members list */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Members ({team.members?.length || 0})</CardTitle>
                      <CardDescription>Players in your team with payment status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {memberProfiles.length === 0 ? (
                        <div className="text-sm text-white/60">No members found.</div>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-2">
                          {memberProfiles.map((m: any) => {
                            const isLeaderRow = m.clerkUserId === team.leaderId;
                            return (
                              <div key={m.clerkUserId} className="flex items-center gap-3 p-2 rounded-md border border-zinc-800/50">
                                <img src={m.avatarUrl || '/avatar.png'} alt={m.name} className="h-9 w-9 rounded-full object-cover" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm text-white/90 truncate">{m.name}</div>
                                    {isLeaderRow && <Badge className="h-5 px-1.5 text-[10px]">Leader</Badge>}
                                  </div>
                                  <div className="text-xs text-white/60 truncate">{m.gameDetails?.valorant?.riotId || m.gameDetails?.bgmi?.ign || m.email}</div>
                                </div>
                                <div className={`text-[10px] px-2 py-0.5 rounded border ${m.payment?.status==='paid' ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-white/70 border-white/10'}`}>
                                  {m.payment?.status==='paid' ? 'Paid' : 'Awaiting'}
                                </div>
                                {isLeader && !isLeaderRow && (
                                  <Button size="sm" variant="ghost" className="text-xs" onClick={async ()=>{
                                    if (!confirm('Remove this player from the team?')) return;
                                    await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'removeMember', code: team.code, playerId: m.clerkUserId }) });
                                    await refreshMe();
                                  }}>Remove</Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  {invitedTeam && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Team invite detected</CardTitle>
                        <CardDescription>You were invited to join {invitedTeam.teamName} • Code {invitedTeam.code}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white/70">{invitedTeam.game?.toUpperCase()} • Members: {invitedTeam.members?.length ?? 0}</div>
                        {Array.isArray(me?.teamRequests) && me?.teamRequests?.includes(invitedTeam.code) ? (
                          <Button size="sm" variant="ghost" disabled>Requested</Button>
                        ) : (
                          <Button size="sm" onClick={() => handleJoinByCode(invitedTeam.code)} disabled={joining}>{joining ? 'Requesting…' : 'Request to join'}</Button>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><LinkIcon className="h-5 w-5" /> Join or Create a team</CardTitle>
                      <CardDescription>Send a join request or create your own team</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input placeholder="Enter team code" value={joinCode} onChange={(e)=>setJoinCode(e.target.value)} />
                        <Button onClick={() => handleJoinByCode()} disabled={joining}>{joining ? 'Requesting…' : 'Request join'}</Button>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input placeholder="Team name" value={teamName} onChange={(e)=>setTeamName(e.target.value)} />
                        <Button variant="secondary" disabled={creating} onClick={handleCreateTeam}>{creating ? 'Creating…' : 'Create team'}</Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Browse teams</CardTitle>
                      <CardDescription>Teams with open spots in your game</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Search by team name or code"
                          value={browseQuery}
                          onChange={(e)=>setBrowseQuery(e.target.value)}
                        />
                      </div>
                      {browseLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 rounded-md" />
                          ))}
                        </div>
                      ) : browseTeams.length === 0 ? (
                        <div className="text-sm text-white/60">No teams available right now. Try creating your own!</div>
                      ) : (
                        (() => {
                          const filtered = browseTeams.filter((t: any) => {
                            const q = browseQuery.trim().toLowerCase();
                            if (!q) return true;
                            return (
                              t.teamName?.toLowerCase().includes(q) ||
                              t.code?.toLowerCase().includes(q)
                            );
                          });
                          if (filtered.length === 0) {
                            return <div className="text-sm text-white/60">No matching teams. Try a different search.</div>;
                          }
                          return (
                            <div className="space-y-2">
                              {filtered.map((t: any) => {
                                const alreadyRequested = Array.isArray(me?.teamRequests) && me.teamRequests.includes(t.code);
                                return (
                                  <div key={t.code} className="flex items-center justify-between p-2 rounded-md border border-zinc-800/50">
                                    <div className="text-sm text-white/80">
                                      <div className="font-medium">{t.teamName}</div>
                                      <div className="text-xs text-white/50">{t.game.toUpperCase()} • Code: <span className="font-mono">{t.code}</span> • {t.members.length} members</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {alreadyRequested ? (
                                        <Button size="sm" variant="ghost" onClick={()=>handleCancelRequest(t.code)}>Cancel</Button>
                                      ) : (
                                        <Button size="sm" disabled={joining} onClick={() => { handleJoinByCode(t.code); }}>
                                          {joining ? 'Requesting…' : 'Request'}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()
                      )}
                    </CardContent>
                    <CardFooter className="flex items-center justify-between">
                      <Button variant="ghost" disabled={browsePage <= 1 || browseLoading} onClick={async () => { const next = browsePage - 1; setBrowsePage(next); await fetchJoinableTeams(next); }}>Previous</Button>
                      <div className="text-xs text-white/50">Page {browsePage} of {browseTotalPages}</div>
                      <Button variant="ghost" disabled={browsePage >= browseTotalPages || browseLoading} onClick={async () => { const next = browsePage + 1; setBrowsePage(next); await fetchJoinableTeams(next); }}>Next</Button>
                    </CardFooter>
                  </Card>
                </>
              )}
            </div>
            <div className="space-y-4">
              {me?.teamRequests?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sent join requests</CardTitle>
                    <CardDescription>Pending approvals from team leaders</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {me.teamRequests.map((c: string) => (
                      <div key={c} className="flex items-center justify-between p-2 rounded-md border border-zinc-800/50">
                        <div className="text-sm text-white/80">Code: <span className="font-mono">{c}</span></div>
                        <Button variant="ghost" size="sm" onClick={()=>handleCancelRequest(c)}>Cancel</Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {/* Team instructions / rules */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Info className="h-5 w-5" /> Team instructions</CardTitle>
                  <CardDescription>How teams work and what to do next</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-white/70 space-y-2">
                  <div>• Team size: Valorant 5 players, BGMI 4 players.</div>
                  <div>• Join using a team code or create your own team and share the invite link.</div>
                  <div>• Leaders must accept incoming join requests; members can cancel requests.</div>
                  <div>• Payment is per player. Team status shows Paid/Awaiting for each member.</div>
                  <div>• Leaders can remove members. Deleting a team removes all members.</div>
                </CardContent>
              </Card>
              {isLeader && team?.pendingRequests?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Incoming join requests</CardTitle>
                    <CardDescription>Accept or deny pending requests</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {team.pendingRequests.map((uid: string) => {
                      const p = pendingProfiles.find((pp)=>pp.clerkUserId === uid);
                      return (
                        <div key={uid} className="flex items-center justify-between p-2 rounded-md border border-zinc-800/50">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white/10 overflow-hidden">
                              {p?.avatarUrl ? <img src={p.avatarUrl} alt={p.name||'Player'} className="h-full w-full object-cover" /> : null}
                            </div>
                            <div>
                              <div className="text-sm text-white/90">{p?.name || 'Unknown Player'}</div>
                              <div className="text-xs text-white/60">{p?.gameDetails?.valorant?.riotId || p?.gameDetails?.bgmi?.ign || uid}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="secondary" onClick={()=>acceptRequest(uid)}>Accept</Button>
                            <Button size="sm" variant="ghost" onClick={()=>denyRequest(uid)}>Deny</Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cashbacks">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Cashback offers</CardTitle>
                  <CardDescription>Complete tasks to earn cashback</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside text-sm text-white/70 space-y-1">
                    <li>Get up to ₹250 cashback by completing partner tasks.</li>
                    <li>Follow Insturix on Instagram and share your team link.</li>
                    <li>Join our Discord and verify your Riot/BGMI ID.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="event">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Info className="h-5 w-5" /> Event details</CardTitle>
              <CardDescription>Schedules, rules and contact info</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-2">
              <div>• Check the schedule on Discord a week before the event.</div>
              <div>• Follow the official rules; cheating will lead to disqualification.</div>
              <div>• Support: support@insturix.com</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5" /> Payment</CardTitle>
                <CardDescription>Secure checkout via Razorpay</CardDescription>
              </div>
              {me?.payment?.status === 'paid' ? (
                <Badge className="gap-1 bg-emerald-600 text-white border-emerald-700"><CheckCircle2 className="h-4 w-4" /> Paid</Badge>
              ) : (
                <Badge className="gap-1 bg-amber-500 text-black border-amber-600"><Clock className="h-4 w-4" /> Pending</Badge>
              )}
            </CardHeader>
            <CardContent>
              {me?.payment?.status === 'paid' ? (
                <div className="mt-1 text-sm text-emerald-400">Payment confirmed</div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button onClick={handlePayNow} disabled={paying} className="gap-1">
                    <CircleDollarSign className="h-4 w-4" /> {paying ? 'Processing…' : 'Pay Now'}
                  </Button>
                  <div className="text-xs text-white/60">You'll be redirected to Razorpay to complete payment.</div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
