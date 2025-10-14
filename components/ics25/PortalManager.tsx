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
import { Progress } from "@/components/ui/progress";
import { Copy, Users, CreditCard, CheckCircle2, Clock, ShieldAlert, Link as LinkIcon, CircleDollarSign, LogOut, Trash2, Info, Check, X } from "lucide-react";
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
import PlayerHoverCard from "@/components/ics25/PlayerHoverCard";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

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
  const [paymentReferralCode, setPaymentReferralCode] = useState("");
  const [checkingRef, setCheckingRef] = useState(false);
  const [refCheck, setRefCheck] = useState<{ status: 'idle'|'valid'|'invalid'|'self'|'error'; message?: string; ownerName?: string } | null>(null);

  const [activeTab, setActiveTab] = useState<string>("registration");

  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseTeams, setBrowseTeams] = useState<any[]>([]);
  const [browseQuery, setBrowseQuery] = useState("");

  const [profile, setProfile] = useState<{ name: string; phone?: string; instagram?: string; discord?: string; riotId?: string; ign?: string; uid?: string; valorantRank?: string; preferredAgents?: string; bgmiRank?: string }>({ name: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [pendingProfiles, setPendingProfiles] = useState<any[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<any[]>([]);
  const [invitedTeam, setInvitedTeam] = useState<any | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [proofs, setProofs] = useState<{ promoReel?: string; linkedinPost?: string }>({});

  // Rank dropdown options
  const BGMI_GROUPS: { label: string; items: string[] }[] = [
    { label: 'Bronze', items: ['Bronze V','Bronze IV','Bronze III','Bronze II','Bronze I'] },
    { label: 'Silver', items: ['Silver V','Silver IV','Silver III','Silver II','Silver I'] },
    { label: 'Gold', items: ['Gold V','Gold IV','Gold III','Gold II','Gold I'] },
    { label: 'Platinum', items: ['Platinum V','Platinum IV','Platinum III','Platinum II','Platinum I'] },
    { label: 'Diamond', items: ['Diamond V','Diamond IV','Diamond III','Diamond II','Diamond I'] },
    { label: 'Crown', items: ['Crown V','Crown IV','Crown III','Crown II','Crown I'] },
    { label: 'Ace', items: ['Ace (Base level)','Ace Master','Ace Dominator'] },
    { label: 'Conqueror', items: ['Conqueror'] },
  ];
  const VALORANT_GROUPS: { label: string; items: string[] }[] = [
    { label: 'Iron', items: ['Iron 1','Iron 2','Iron 3'] },
    { label: 'Bronze', items: ['Bronze 1','Bronze 2','Bronze 3'] },
    { label: 'Silver', items: ['Silver 1','Silver 2','Silver 3'] },
    { label: 'Gold', items: ['Gold 1','Gold 2','Gold 3'] },
    { label: 'Platinum', items: ['Platinum 1','Platinum 2','Platinum 3'] },
    { label: 'Diamond', items: ['Diamond 1','Diamond 2','Diamond 3'] },
    { label: 'Ascendant', items: ['Ascendant 1','Ascendant 2','Ascendant 3'] },
    { label: 'Immortal', items: ['Immortal 1','Immortal 2','Immortal 3'] },
    { label: 'Radiant', items: ['Radiant'] },
  ];

  // Valorant preferred agents grouped by role
  const VALORANT_AGENT_GROUPS: { label: string; items: string[] }[] = [
    { label: 'Controllers', items: ['Astra','Brimstone','Clove','Harbor','Omen','Viper'] },
    { label: 'Duelists', items: ['Iso','Jett','Neon','Phoenix','Raze','Reyna','Yoru'] },
    { label: 'Initiators', items: ['Breach','Fade','Gekko','KAY/O','Skye','Sova'] },
    { label: 'Sentinels', items: ['Chamber','Cypher','Deadlock','Killjoy','Sage','Tejo','Veto','Vyse','Waylay'] },
  ];

  const splitAgents = (s?: string) => (s || "").split(',').map(a=>a.trim()).filter(Boolean);
  const joinAgents = (arr: string[]) => Array.from(new Set(arr)).join(', ');
  // Multi-select helpers derived from current profile preferredAgents
  const selectedAgents = splitAgents(profile.preferredAgents);
  const toggleAgent = (agent: string) => {
    const set = new Set(selectedAgents);
    if (set.has(agent)) {
      set.delete(agent);
    } else {
      if (selectedAgents.length >= 5) {
        toast({ title: "Limit reached", description: "You can select up to 5 agents.", variant: "destructive" as any });
        return;
      }
      set.add(agent);
    }
    setProfile(p => ({ ...p, preferredAgents: joinAgents(Array.from(set)) }));
  };
  const removeAgent = (agent: string) => {
    const next = selectedAgents.filter((a: string) => a !== agent);
    setProfile(p => ({ ...p, preferredAgents: joinAgents(next) }));
  };

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
            valorantRank: p.gameDetails?.valorant?.rank || "",
            preferredAgents: p.gameDetails?.valorant?.preferredAgents || "",
            ign: p.gameDetails?.bgmi?.ign || "",
            uid: p.gameDetails?.bgmi?.uid || "",
            bgmiRank: p.gameDetails?.bgmi?.rank || "",
          });
          // Preload referral code if exists
          const code = p?.cashbacks?.referral?.code || null;
          setReferralCode(code);
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

  const toggleListTeam = async () => {
    if (!team) return;
    try {
      const desired = !team.listed;
      const r = await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setListed', code: team.code, listed: desired }) });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.message || 'Failed to update visibility');
      setTeam((t: any) => t ? { ...t, listed: desired } : t);
      toast({ title: desired ? 'Team listed publicly' : 'Team hidden', description: desired ? 'Your team will appear in Browse teams.' : 'Your team will not appear in Browse teams.' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message || 'Try again later', variant: 'destructive' as any });
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
      const trimmed = (paymentReferralCode || '').trim();
      if (trimmed) {
        if (refCheck?.status === 'self') {
          toast({ title: 'Invalid referral', description: 'You cannot use your own referral code.', variant: 'destructive' as any });
          return;
        }
        if (refCheck?.status === 'invalid') {
          toast({ title: 'Invalid referral', description: 'This referral code is not valid. Clear it or check another code.', variant: 'destructive' as any });
          return;
        }
      }
      setPaying(true);
      const cr = await fetch('/api/ics25/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 500, referralCode: trimmed ? trimmed.toLowerCase() : undefined }) });
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

  const handleCheckReferral = async () => {
    const code = (paymentReferralCode || '').trim().toLowerCase();
    if (!code) { setRefCheck({ status: 'error', message: 'Enter a referral code to check' }); return; }
    setCheckingRef(true);
    setRefCheck(null);
    try {
      const r = await fetch(`/api/ics25/referrals/validate?code=${encodeURIComponent(code)}`);
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.message || 'Failed to check');
      if (!d.valid) {
        setRefCheck({ status: 'invalid', message: 'Invalid referral code' });
      } else if (d.self) {
        setRefCheck({ status: 'self', message: 'You cannot use your own code' });
      } else {
        setRefCheck({ status: 'valid', message: `Valid — belongs to ${d.owner?.name || 'a player'}`, ownerName: d.owner?.name });
      }
    } catch (e: any) {
      setRefCheck({ status: 'error', message: e.message || 'Could not validate code' });
    } finally {
      setCheckingRef(false);
    }
  };

  const saveProfile = async () => {
    try {
      if (!validateProfileForGame()) return;
      setSavingProfile(true);
      const body: any = {
        name: profile.name,
        phone: profile.phone,
        instagram: profile.instagram,
        discord: profile.discord,
      };
      if (me?.game === 'valorant') body.gameDetails = { valorant: { riotId: profile.riotId, rank: profile.valorantRank, preferredAgents: profile.preferredAgents } };
      if (me?.game === 'bgmi') body.gameDetails = { bgmi: { ign: profile.ign, uid: profile.uid, rank: profile.bgmiRank } };
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

  const ensureReferral = async () => {
    try {
      const r = await fetch('/api/ics25/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cashback.referral.ensure' }) });
      const d = await r.json();
      if (r.ok && d.ok) {
        setReferralCode(d.code || null);
        toast({ title: 'Referral ready', description: 'Share your code/link to earn cashback.' });
      } else {
        throw new Error(d?.message || 'Failed to generate referral');
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Could not generate referral', variant: 'destructive' as any });
    }
  };

  const submitCashback = async (task: 'promoReel'|'linkedinPost') => {
    const url = task === 'promoReel' ? proofs.promoReel : proofs.linkedinPost;
    if (!url || !/^https?:\/\//i.test(url)) {
      toast({ title: 'Proof link required', description: 'Paste a valid public URL as proof.', variant: 'destructive' as any });
      return;
    }
    try {
      const r = await fetch('/api/ics25/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cashback.submit', task, proofUrl: url }) });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.message || 'Submission failed');
      toast({ title: 'Submitted', description: 'We will verify this within 48 hours.' });
      await refreshMe();
    } catch (e: any) {
      toast({ title: 'Submission error', description: e.message || 'Try again later', variant: 'destructive' as any });
    }
  };

  // Validators for game-specific fields
  const validateRiotId = (s?: string) => {
    if (!s) return false;
    const str = s.trim();
    // Name 3-16 (no #/spaces), #, Tag 3-5 alphanum
    return /^[^#\s]{3,16}#[A-Za-z0-9]{3,5}$/.test(str);
  };
  const validateProfileForGame = (): boolean => {
    if (me?.game === 'valorant') {
      if (!profile.riotId || !profile.valorantRank || !profile.preferredAgents) {
        toast({ title: 'Missing fields', description: 'Riot ID, Rank and Preferred Agent(s) are required.', variant: 'destructive' as any });
        return false;
      }
      if (!validateRiotId(profile.riotId)) {
        toast({ title: 'Invalid Riot ID', description: 'Use Name#TAG with a 3-16 char name and 3-5 char tag (alphanumeric).', variant: 'destructive' as any });
        return false;
      }
    } else if (me?.game === 'bgmi') {
      if (!profile.ign || !profile.uid || !profile.bgmiRank) {
        toast({ title: 'Missing fields', description: 'BGMI IGN, UID and Tier/Rank are required.', variant: 'destructive' as any });
        return false;
      }
    }
    return true;
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
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/60 to-zinc-900/20 p-4 md:p-5">
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
        {(() => {
          // Compute next steps to guide the user
          const steps: { label: string; action: () => void }[] = [];
          const needsProfile = !profile?.name || (me?.game === 'valorant' && !profile.riotId) || (me?.game === 'bgmi' && !profile.ign);
          if (needsProfile) steps.push({ label: 'Complete registration', action: () => setActiveTab('registration') });
          if (!team) steps.push({ label: 'Join or create a team', action: () => setActiveTab('team') });
          if (me?.payment?.status !== 'paid') steps.push({ label: 'Complete payment', action: () => setActiveTab('payment') });
          if (steps.length === 0) return null;
          return (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-white/60">Next steps:</span>
              {steps.map((s, i) => (
                <Button key={i} size="sm" variant="secondary" className="h-7 px-2" onClick={s.action}>{s.label}</Button>
              ))}
            </div>
          );
        })()}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="sticky top-20 z-10 -mx-1 px-1">
          <TabsList className="w-full justify-start bg-zinc-900/60 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/40 border border-white/10">
          <TabsTrigger value="registration">Registration</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="cashbacks">Cashbacks</TabsTrigger>
          <TabsTrigger value="event">Event details</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="registration">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> {editingProfile ? 'Edit your details' : 'Your registration details'}
                    <span className="flex-1" />
                    <img
                      src={(me as any)?.avatarUrl || (me as any)?.imageUrl || '/avatar.png'}
                      alt={(me as any)?.name || 'Player'}
                      className="h-14 w-14 rounded-full object-cover border border-white/10 ring-1 ring-white/10"
                    />
                  </CardTitle>
                  <CardDescription>
                    {editingProfile ? (
                      <>
                        Update your personal and game-specific fields. Email is linked to your account and cannot be edited. You can participate in only one game per ID; your game selection is locked after first registration.
                      </>
                    ) : (
                      'You can edit these anytime. Email and selected game are locked.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!editingProfile ? (
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-white/60">Email</div>
                        <div className="text-white/90">{me?.email || '—'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-white/60">Game (locked)</div>
                          <div className="text-white/90">{me?.game ? me.game.toUpperCase() : '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-white/60">Team Code</div>
                          <div className="text-white/90">{me?.teamCode && me.teamCode !== 'awaiting' ? me.teamCode : '—'}</div>
                        </div>
                      </div>
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
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-white/60">Riot ID</div>
                            <div className="text-white/90">{profile.riotId || '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/60">Rank</div>
                            <div className="text-white/90">{profile.valorantRank || '—'}</div>
                          </div>
                          <div className="md:col-span-2">
                            <div className="text-xs text-white/60">Preferred Agent(s)</div>
                            <div className="text-white/90">{profile.preferredAgents || '—'}</div>
                          </div>
                        </div>
                      )}
                      {me?.game === 'bgmi' && (
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className="text-xs text-white/60">BGMI IGN</div>
                            <div className="text-white/90">{profile.ign || '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/60">BGMI UID</div>
                            <div className="text-white/90">{profile.uid || '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/60">Tier/Rank</div>
                            <div className="text-white/90">{profile.bgmiRank || '—'}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="text-xs text-white/60">Email</label>
                        <Input value={me?.email || ''} readOnly disabled />
                      </div>
                      <div>
                        <label className="text-xs text-white/60">Game</label>
                        <Input value={me?.game ? me.game.toUpperCase() : ''} readOnly disabled />
                        <div className="mt-1 text-[11px] text-white/50">You can participate in only one game per ID. This cannot be changed.</div>
                      </div>
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
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-white/60">Riot ID <span className="text-red-400">*</span></label>
                            <Input required value={profile.riotId || ''} onChange={(e)=>setProfile(p=>({...p, riotId: e.target.value}))} placeholder="Name#TAG" />
                          </div>
                          <div>
                            <label className="text-xs text-white/60">Rank <span className="text-red-400">*</span></label>
                            <Select value={profile.valorantRank || undefined} onValueChange={(v)=>setProfile(p=>({...p, valorantRank: v }))}>
                              <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                                <SelectValue placeholder="Select Valorant rank" />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 text-white border border-white/10">
                                {VALORANT_GROUPS.map((grp, gi) => (
                                  <SelectGroup key={grp.label}>
                                    <SelectLabel>{grp.label}</SelectLabel>
                                    {grp.items.map(r => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                    {gi < VALORANT_GROUPS.length - 1 && <SelectSeparator />}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs text-white/60">Preferred Agent(s) <span className="text-red-400">*</span></label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className="w-full min-h-10 text-left rounded-md border border-white/10 bg-white/5 px-2 py-2 focus:outline-none">
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedAgents.length === 0 ? (
                                      <span className="text-xs text-white/50">Select preferred agents…</span>
                                    ) : selectedAgents.map(agent => (
                                      <span key={agent} className="inline-flex items-center gap-1 rounded-md bg-white/10 border border-white/10 px-2 py-0.5 text-xs text-white/90">
                                        {agent}
                                        <X className="h-3.5 w-3.5 cursor-pointer opacity-70 hover:opacity-100" onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); removeAgent(agent); }} />
                                      </span>
                                    ))}
                                  </div>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="p-0 w-72 bg-zinc-900 text-white border border-white/10">
                                <Command>
                                  <CommandInput placeholder="Search agents…" />
                                  <CommandEmpty>No agents found.</CommandEmpty>
                                  <CommandList>
                                    {VALORANT_AGENT_GROUPS.map(group => (
                                      <CommandGroup key={group.label} heading={group.label}>
                                        {group.items.map(agent => {
                                          const checked = selectedAgents.includes(agent);
                                          return (
                                            <CommandItem key={agent} onSelect={() => toggleAgent(agent)}>
                                              <Check className={`mr-2 h-4 w-4 ${checked ? 'opacity-100' : 'opacity-0'}`} />
                                              {agent}
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                    ))}
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      )}
                      {me?.game === 'bgmi' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-white/60">BGMI IGN <span className="text-red-400">*</span></label>
                            <Input value={profile.ign || ''} onChange={(e)=>setProfile(p=>({...p, ign: e.target.value}))} />
                          </div>
                          <div>
                            <label className="text-xs text-white/60">BGMI UID <span className="text-red-400">*</span></label>
                            <Input value={profile.uid || ''} onChange={(e)=>setProfile(p=>({...p, uid: e.target.value}))} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs text-white/60">Tier/Rank <span className="text-red-400">*</span></label>
                            <Select value={profile.bgmiRank || undefined} onValueChange={(v)=>setProfile(p=>({...p, bgmiRank: v }))}>
                              <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                                <SelectValue placeholder="Select BGMI rank" />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 text-white border border-white/10">
                                {BGMI_GROUPS.map((grp, gi) => (
                                  <SelectGroup key={grp.label}>
                                    <SelectLabel>{grp.label}</SelectLabel>
                                    {grp.items.map(r => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                    {gi < BGMI_GROUPS.length - 1 && <SelectSeparator />}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
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
                            valorantRank: p.gameDetails?.valorant?.rank || '',
                            preferredAgents: p.gameDetails?.valorant?.preferredAgents || '',
                            ign: p.gameDetails?.bgmi?.ign || '',
                            uid: p.gameDetails?.bgmi?.uid || '',
                            bgmiRank: p.gameDetails?.bgmi?.rank || '',
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
                        <span className="hidden sm:inline text-white/40"></span>
                        {/* Team page link removed: invites open portal directly */}
                        {isLeader && (
                          <span className="ml-auto flex items-center gap-2 text-xs">
                            <Badge variant={team.listed ? 'default' : 'secondary'} className="h-5 px-1.5 text-[10px]">
                              {team.listed ? 'Public' : 'Private'}
                            </Badge>
                            <Button size="sm" variant="outline" className="h-7 px-2 ring-1 ring-white/20" onClick={toggleListTeam}>
                              {team.listed ? 'Make it private' : 'List publicly'}
                            </Button>
                          </span>
                        )}
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
                              <Progress value={pct} max={100} className="h-2 bg-white/5" />
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
                      <CardDescription></CardDescription>
                    </CardHeader>
                    <CardContent>
                      {memberProfiles.length === 0 ? (
                        <div className="text-sm text-white/60">No members found.</div>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-2">
                          {memberProfiles.map((m: any) => {
                            const isLeaderRow = m.clerkUserId === team.leaderId;
                            return (
                              <PlayerHoverCard key={m.clerkUserId} player={m}>
                                <div className="flex items-center gap-3 p-2 rounded-md border border-zinc-800/50">
                                  <img src={m.avatarUrl || '/avatar.png'} alt={m.name} className="h-9 w-9 rounded-full object-cover" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm text-white/90 truncate">{m.name}</div>
                                      {isLeaderRow && <Badge className="h-5 px-1.5 text-[10px]">Leader</Badge>}
                                    </div>
                                    <div className="text-xs text-white/60 truncate">{m.gameDetails?.valorant?.riotId || m.gameDetails?.bgmi?.ign || m.email}</div>
                                  </div>
                                  <div className={`text-[10px] px-2 py-0.5 rounded border ${m.payment?.status==='paid' ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-white/70 border-white/10'}`}>
                                    {m.payment?.status==='paid' ? 'Paid' : 'Pending'}
                                  </div>
                                  {isLeader && !isLeaderRow && (
                                    <Button size="sm" variant="ghost" className="text-xs" onClick={async ()=>{
                                      if (!confirm('Remove this player from the team?')) return;
                                      await fetch('/api/ics25/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'removeMember', code: team.code, playerId: m.clerkUserId }) });
                                      await refreshMe();
                                    }}>Remove</Button>
                                  )}
                                </div>
                              </PlayerHoverCard>
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
                          <Button size="sm" variant="outline" disabled className="opacity-80">Requested</Button>
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
                                        <>
                                          <Button size="sm" variant="outline" disabled className="opacity-80">Requested</Button>
                                          <Button size="sm" variant="ghost" onClick={()=>handleCancelRequest(t.code)}>Cancel</Button>
                                        </>
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
                  <div>• Payment is per player. Team status shows Paid/Pending for each member.</div>
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
                        <PlayerHoverCard key={uid} player={p || {}}>
                          <div className="flex items-center justify-between p-2 rounded-md border border-zinc-800/50">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-white/10 overflow-hidden">
                                {p?.avatarUrl ? <img src={p.avatarUrl} alt={p?.name||'Player'} className="h-full w-full object-cover" /> : <img src="/avatar.png" alt="Player" className="h-full w-full object-cover" />}
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
                        </PlayerHoverCard>
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
              {/* Cashback Summary */}
              {(() => {
                const promo = me?.cashbacks?.promoReel;
                const linkedin = me?.cashbacks?.linkedinPost;
                const refer = me?.cashbacks?.referral;
                const amtPromo = promo?.amount ?? 75;
                const amtLinkedin = linkedin?.amount ?? 75;
                const amtReferral = refer?.amount ?? 100;
                const earned = (promo?.status === 'verified' ? amtPromo : 0)
                  + (linkedin?.status === 'verified' ? amtLinkedin : 0)
                  + (refer?.qualified ? amtReferral : 0);
                const pending = (promo?.status === 'submitted' ? amtPromo : 0)
                  + (linkedin?.status === 'submitted' ? amtLinkedin : 0);
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Cashback Summary</CardTitle>
                      <CardDescription>Track your cashback progress</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border border-zinc-800/50 p-3">
                          <div className="text-white/60">Earned</div>
                          <div className="text-white/90 text-base font-semibold">₹ {earned}</div>
                        </div>
                        <div className="rounded-md border border-zinc-800/50 p-3">
                          <div className="text-white/60">Pending Review</div>
                          <div className="text-white/90 text-base font-semibold">₹ {pending}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-white/50">Note: Submissions are reviewed within 48 hours. Approved tasks will move to Earned.</div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Promo Reel Task */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Promo Reel — ₹75</CardTitle>
                  <CardDescription>Post a reel tagging @insturix and #ICS25 #insturix</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const st = me?.cashbacks?.promoReel?.status || 'none';
                    if (st === 'submitted') {
                      return <div className="text-xs rounded-md border border-amber-600/30 bg-amber-500/10 text-amber-300 px-3 py-2">Under review — we’ll verify this within 48 hours.</div>;
                    }
                    if (st === 'verified') {
                      return <div className="text-xs rounded-md border border-emerald-600/30 bg-emerald-500/10 text-emerald-300 px-3 py-2">Approved — ₹75 will be credited.</div>;
                    }
                    if (st === 'rejected') {
                      return <div className="text-xs rounded-md border border-red-600/30 bg-red-500/10 text-red-300 px-3 py-2">Rejected — please resubmit with valid proof.</div>;
                    }
                    return null;
                  })()}
                  <div className="text-xs text-white/60">Status: <span className="text-white/80 font-medium">{me?.cashbacks?.promoReel?.status || 'none'}</span></div>
                  <div className="flex gap-2">
                    <Input placeholder="Link to your reel (Instagram Reels, YouTube Shorts, etc.)" value={proofs.promoReel || ''} onChange={(e)=>setProofs(p=>({...p, promoReel: e.target.value}))} />
                    <Button size="sm" onClick={()=>submitCashback('promoReel')} disabled={(me?.cashbacks?.promoReel?.status === 'submitted' || me?.cashbacks?.promoReel?.status === 'verified') || !(proofs.promoReel && /^https?:\/\//i.test(proofs.promoReel))}>{me?.cashbacks?.promoReel?.status === 'submitted' ? 'In Review' : 'Submit'}</Button>
                  </div>
                </CardContent>
              </Card>

              {/* LinkedIn Post Task */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> LinkedIn Post — ₹75</CardTitle>
                  <CardDescription>Write a LinkedIn post tagging Insturix about ICS’25</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const st = me?.cashbacks?.linkedinPost?.status || 'none';
                    if (st === 'submitted') {
                      return <div className="text-xs rounded-md border border-amber-600/30 bg-amber-500/10 text-amber-300 px-3 py-2">Under review — we’ll verify this within 48 hours.</div>;
                    }
                    if (st === 'verified') {
                      return <div className="text-xs rounded-md border border-emerald-600/30 bg-emerald-500/10 text-emerald-300 px-3 py-2">Approved — ₹75 will be credited.</div>;
                    }
                    if (st === 'rejected') {
                      return <div className="text-xs rounded-md border border-red-600/30 bg-red-500/10 text-red-300 px-3 py-2">Rejected — please resubmit with valid proof.</div>;
                    }
                    return null;
                  })()}
                  <div className="text-xs text-white/60">Status: <span className="text-white/80 font-medium">{me?.cashbacks?.linkedinPost?.status || 'none'}</span></div>
                  <div className="flex gap-2">
                    <Input placeholder="Link to your LinkedIn post" value={proofs.linkedinPost || ''} onChange={(e)=>setProofs(p=>({...p, linkedinPost: e.target.value}))} />
                    <Button size="sm" onClick={()=>submitCashback('linkedinPost')} disabled={(me?.cashbacks?.linkedinPost?.status === 'submitted' || me?.cashbacks?.linkedinPost?.status === 'verified') || !(proofs.linkedinPost && /^https?:\/\//i.test(proofs.linkedinPost))}>{me?.cashbacks?.linkedinPost?.status === 'submitted' ? 'In Review' : 'Submit'}</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Referral Task */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Referral — ₹100</CardTitle>
                  <CardDescription>Earn cashback by registering 3 people via your referral</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-white/80">Your referral code</div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={referralCode || ''} placeholder="Generate your code" />
                    <Button size="sm" onClick={ensureReferral} disabled={!!referralCode}>Generate</Button>
                    {referralCode && (
                      <Button size="sm" variant="secondary" onClick={() => copy(`${window.location.origin}/ics25/register?ref=${encodeURIComponent(referralCode)}`)}>Copy link</Button>
                    )}
                  </div>
                  <div className="text-xs text-white/60">Progress: {me?.cashbacks?.referral?.referredCount || 0}/3 • {me?.cashbacks?.referral?.qualified ? 'Qualified — ₹75 added to Earned' : 'Not yet qualified'}</div>
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
                <div className="space-y-3">
                  <div className="rounded-md border border-white/10 p-3 text-sm text-white/80">
                    <div className="flex items-center justify-between">
                      <span>Registration fee</span>
                      <span className="font-semibold">₹ 500</span>
                    </div>
                    <div className="mt-1 text-xs text-white/50">No additional charges. Referral cashback is paid to the referrer after your payment is verified.</div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-white/60">Referral code (optional)</label>
                      <div className="flex gap-2">
                        <Input placeholder="Have a referral code?" value={paymentReferralCode} onChange={(e)=>{ setPaymentReferralCode(e.target.value); setRefCheck(null); }} />
                        <Button type="button" variant="outline" onClick={handleCheckReferral} disabled={checkingRef || !paymentReferralCode.trim()} className="whitespace-nowrap">
                          {checkingRef ? 'Checking…' : 'Check'}
                        </Button>
                      </div>
                      {refCheck?.status && (
                        <div className={`mt-2 text-[12px] flex items-center gap-1 ${refCheck.status==='valid' ? 'text-emerald-400' : refCheck.status==='self' ? 'text-amber-400' : refCheck.status==='invalid' || refCheck.status==='error' ? 'text-red-400' : 'text-white/60'}`}>
                          {refCheck.status==='valid' && <Check className="h-3.5 w-3.5" />}
                          {(refCheck.status==='invalid' || refCheck.status==='error' || refCheck.status==='self') && <X className="h-3.5 w-3.5" />}
                          <span>{refCheck.message}</span>
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-white/50">If you have a referral code, enter it now so your referrer can be credited when your payment is verified.</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={handlePayNow} disabled={paying} className="gap-1">
                      <CircleDollarSign className="h-4 w-4" /> {paying ? 'Processing…' : 'Pay Now'}
                    </Button>
                    <div className="text-xs text-white/60">You'll be redirected to Razorpay to complete payment.</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
