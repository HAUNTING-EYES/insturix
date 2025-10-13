"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
// Avoid importing SVG as module to prevent svgr loader requirement
import { useUser } from "@clerk/nextjs";

type GameType = "bgmi" | "valorant";

type Step = 1 | 2 | 3;

type Leader = {
  name: string;
  phone: string;
  email: string;
  instagram: string;
  discord?: string;
};

type BgmiDetails = { ign: string; uid: string; rank?: string };
type ValorantDetails = { riotId: string; rank?: string; preferredAgents?: string };

type TeamMember = { name: string; bgmi?: BgmiDetails; valorant?: ValorantDetails };

export default function RegisterForm() {
  const { user } = useUser();
  const [referral, setReferral] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [game, setGame] = useState<GameType | null>('valorant');
  const [leader, setLeader] = useState<Leader>({ name: "", phone: "", email: "", instagram: "", discord: "" });
  const [leaderBgmi, setLeaderBgmi] = useState<BgmiDetails>({ ign: "", uid: "", rank: "" });
  const [leaderVal, setLeaderVal] = useState<ValorantDetails>({ riotId: "", rank: "", preferredAgents: "" });

  // Team & payment handled in portal
  const [navBusy, setNavBusy] = useState(false);
  const [discordError, setDiscordError] = useState<string | null>(null);

  const amountPerPerson = 500;
  const totalAmount = amountPerPerson; // individual registration price

  useEffect(() => {
    // Prefill leader details from signed-in user
    if (user) {
      setLeader((prev) => ({
        ...prev,
        name: prev.name || user.fullName || "",
        email: prev.email || user.primaryEmailAddress?.emailAddress || "",
      }));
      // Prefill phone with E.164 number if available
      const phoneE164 = (user as any)?.primaryPhoneNumber?.phoneNumber as string | undefined;
      if (phoneE164 && !leader.phone) {
        setLeader((prev) => ({ ...prev, phone: phoneE164 }));
      }
    }
  }, [user]);
  useEffect(() => {
    // Read referral code from URL if present
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get('ref');
      if (ref) setReferral(ref);
    } catch {}
  }, []);
  
  // Client-side guard: if a player already exists, redirect to portal immediately
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!user) { setChecking(false); return; }
        const res = await fetch('/api/ics25/players/me', { cache: 'no-store', headers: { 'accept': 'application/json' } });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data?.player) {
            window.location.href = '/ics25/my';
            return;
          }
        }
      } catch {
        // ignore and show form
      }
      if (!cancelled) setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user]);
  // No team or payment logic here; portal will handle next steps

  const clampStep = (n: number): Step => Math.max(1, Math.min(3, n)) as Step;
  const next = () => setStep((s) => clampStep(s + 1));
  const prev = () => setStep((s) => clampStep(s - 1));

  const delayed = async (fn: () => void, delayMs = 350) => {
    if (navBusy) return;
    setNavBusy(true);
    await new Promise((r) => setTimeout(r, delayMs));
    fn();
    setNavBusy(false);
  };

  const required = (s: string) => s.trim().length > 0;

  // Validators
  const normalizePhone = (s: string) => s.replace(/[^+\d]/g, "");
  const validatePhone = (s: string) => {
    const p = normalizePhone(s);
    // Accept E.164 +country and 8-15 digits, or plain 10-15 digits
    if (/^\+[1-9]\d{7,14}$/.test(p)) return true;
    if (/^\d{10,15}$/.test(p)) return true;
    return false;
  };
  const validateDiscord = (s?: string) => {
    if (!s) return true; // optional
    const str = s.trim();
    // Allow legacy name#1234 or new usernames 2-32 chars (letters, numbers, underscore, dot)
    if (/^.{2,32}#[0-9]{4}$/.test(str)) return true;
    if (/^[a-z0-9._]{2,32}$/i.test(str)) return true;
    return false;
  };
  const validateRiotId = (s: string) => {
    const str = s.trim();
    // Name 3-16 (no #/spaces), #, Tag 3-5 alphanum
    return /^[^#\s]{3,16}#[A-Za-z0-9]{3,5}$/.test(str);
  };

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!required(leader.name) || !required(leader.phone) || !required(leader.email) || !required(leader.instagram)) {
        toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
        return false;
      }
      if (!validatePhone(leader.phone)) {
        toast({ title: "Invalid phone number", description: "Enter a valid phone number with country code (e.g., +911234567890) or 10-15 digits.", variant: "destructive" });
        return false;
      }
      if (!validateDiscord(leader.discord)) {
        toast({ title: "Invalid Discord ID", description: "Use username#1234 or a valid Discord username.", variant: "destructive" });
        return false;
      }
    }
    if (step === 2) {
      if (!game) {
        toast({ title: "Select game", description: "Choose Valorant or BGMI.", variant: "destructive" });
        return false;
      }
    }
    if (step === 3) {
      if (game === "bgmi") {
        if (!required(leaderBgmi.ign) || !required(leaderBgmi.uid) || !required(leaderBgmi.rank || "")) {
          toast({ title: "BGMI details", description: "Leader IGN, UID and Tier/Rank are required.", variant: "destructive" });
          return false;
        }
      } else if (game === "valorant") {
        if (!required(leaderVal.riotId) || !required(leaderVal.rank || "") || !required(leaderVal.preferredAgents || "")) {
          toast({ title: "Valorant details", description: "Leader Riot ID, Rank and Preferred Agent(s) are required.", variant: "destructive" });
          return false;
        }
        if (!validateRiotId(leaderVal.riotId)) {
          toast({ title: "Invalid Riot ID", description: "Use format Name#TAG (e.g., Phoenix#IN) with a 3-16 char name and 3-5 char tag.", variant: "destructive" });
          return false;
        }
      }
    }
    // No validations for team/payment steps here
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    delayed(() => next());
  };
  const handlePrev = () => {
    delayed(() => prev());
  };

  const saveAndGoToPortal = async () => {
    try {
      setLoading(true);
      if (!game) {
        toast({ title: "Select game", description: "Choose Valorant or BGMI.", variant: "destructive" });
        return;
      }
      const userId = user?.id || '';
      const playerPayload: any = {
        clerkUserId: userId,
        name: leader.name,
        email: leader.email,
        phone: leader.phone,
        instagram: leader.instagram,
        discord: leader.discord,
        game,
        gameDetails: game === 'valorant' ? { valorant: leaderVal } : { bgmi: leaderBgmi },
        referralCode: referral || undefined,
      };
      const res = await fetch('/api/ics25/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(playerPayload) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || 'Failed to save');
      window.location.href = '/ics25/my';
    } catch (e: any) {
      toast({ title: "Save error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Payment is handled in the portal, not here

  const StepNav = ({ title, right }: { title: string; right?: { label: string; onClick: () => void; disabled?: boolean } }) => (
    <div className="sticky bottom-4 z-20 mt-8 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-3">
      <Button variant="secondary" onClick={handlePrev} disabled={step === 1 || navBusy}>
        Previous
      </Button>
      <div className="flex-1 text-center text-sm text-white/80 px-2">
        {title}
      </div>
      {right ? (
        <Button onClick={right.onClick} disabled={right.disabled || navBusy}>{right.label}</Button>
      ) : step < 3 ? (
        <Button onClick={handleNext} disabled={navBusy}>Next</Button>
      ) : step === 3 ? (
        <Button onClick={saveAndGoToPortal} disabled={loading || navBusy}>Save & Go to Portal</Button>
      ) : null}
    </div>
  );

  return (
    <Card className="bg-black/30 border-white/10">
      <CardContent className="p-6">
        {checking ? (
          <div className="py-12 text-center text-white/80">Checking your registration…</div>
        ) : (
        <>
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="bg-violet-500/10 text-violet-300">ICS’25</Badge>
          <span className="text-white/70">Gaming Registration</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {[1,2,3].map((s) => (
            <div key={s} className={`h-1 rounded ${step >= s ? 'bg-violet-500' : 'bg-white/10'}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/70">Full name</label>
                  <Input placeholder="e.g., Aditya Sharma" value={leader.name} onChange={(e)=>setLeader({...leader,name:e.target.value})} readOnly={!!user?.fullName} />
                </div>
                <div>
                  <label className="text-xs text-white/70">Phone number</label>
                  <Input placeholder="e.g., +911234567890" value={leader.phone} onChange={(e)=>setLeader({...leader,phone:e.target.value})} onBlur={(e)=>setLeader({...leader, phone: normalizePhone(e.target.value)})} />
                </div>
                <div>
                  <label className="text-xs text-white/70">Email</label>
                  <Input placeholder="name@example.com" value={leader.email} onChange={(e)=>setLeader({...leader,email:e.target.value})} readOnly={!!user?.primaryEmailAddress?.emailAddress} />
                </div>
                <div>
                  <label className="text-xs text-white/70">Instagram handle</label>
                  <Input placeholder="@yourhandle" value={leader.instagram} onChange={(e)=>setLeader({...leader,instagram:e.target.value})} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-white/70">Discord ID (optional)</label>
                  <Input
                    placeholder="username#1234 or new_username"
                    value={leader.discord || ""}
                    onChange={(e)=>{
                      const val = e.target.value;
                      setLeader({...leader,discord: val});
                      if (val && !validateDiscord(val)) setDiscordError("Invalid Discord ID (use username#1234 or a valid new username)"); else setDiscordError(null);
                    }}
                    aria-invalid={!!discordError}
                    className={discordError ? "border-red-500/60 focus-visible:ring-red-500" : undefined}
                  />
                  {discordError && (
                    <p className="mt-1 text-xs text-red-400">{discordError}</p>
                  )}
                </div>
              </div>
              <StepNav title="Personal Details" />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="space-y-4">
              <div className="w-full">
                <div className="mt-2 relative w-full rounded-xl p-1 bg-white/5 border border-white/10 backdrop-blur supports-[backdrop-filter]:bg-white/5">
                  <div className="relative grid grid-cols-2 w-full">
                    {/* Animated indicator */}
                    <motion.div
                      layout
                      className="absolute top-0 bottom-0 w-1/2 rounded-lg bg-violet-500/20 border border-violet-500/30"
                      animate={{ left: game === 'bgmi' ? '50%' : '0%' }}
                      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                    />
                    <button
                      type="button"
                      onClick={() => setGame('valorant')}
                      className={`relative z-10 px-4 py-3 text-sm font-medium transition-colors text-center ${game==='valorant' ? 'text-white' : 'text-white/70 hover:text-white'}`}
                    >
                      Valorant
                    </button>
                    <button
                      type="button"
                      onClick={() => setGame('bgmi')}
                      className={`relative z-10 px-4 py-3 text-sm font-medium transition-colors text-center ${game==='bgmi' ? 'text-white' : 'text-white/70 hover:text-white'}`}
                    >
                      BGMI
                    </button>
                  </div>
                </div>
              </div>
              {game && (
                <div className="space-y-2">
                  <p className="text-xs text-white/70">You’ll provide your game-specific details next. Team formation happens in the following step.</p>
                </div>
              )}
              <StepNav title="Select Game" />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="space-y-4">
              <div className="relative">
                <AnimatePresence mode="wait">
                  {game === 'bgmi' && (
                    <motion.div key="bgmi-fields" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-white/70">Leader IGN</label>
                        <Input placeholder="In-Game Name" value={leaderBgmi.ign} onChange={(e)=>setLeaderBgmi({...leaderBgmi, ign:e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs text-white/70">Leader BGMI UID</label>
                        <Input placeholder="Numeric UID" value={leaderBgmi.uid} onChange={(e)=>setLeaderBgmi({...leaderBgmi, uid:e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs text-white/70">Leader Tier/Rank</label>
                        <Input placeholder="e.g., Ace, Crown" value={leaderBgmi.rank} onChange={(e)=>setLeaderBgmi({...leaderBgmi, rank:e.target.value})} />
                      </div>
                    </motion.div>
                  )}
                  {game === 'valorant' && (
                    <motion.div key="valorant-fields" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-white/70">Leader Riot ID</label>
                        <Input placeholder="Name#TAG" value={leaderVal.riotId} onChange={(e)=>setLeaderVal({...leaderVal, riotId:e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs text-white/70">Leader Rank</label>
                        <Input placeholder="e.g., Gold 2" value={leaderVal.rank} onChange={(e)=>setLeaderVal({...leaderVal, rank:e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs text-white/70">Preferred Agent(s)</label>
                        <Input placeholder="e.g., Jett, Sova" value={leaderVal.preferredAgents} onChange={(e)=>setLeaderVal({...leaderVal, preferredAgents:e.target.value})} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <StepNav title="Game Specific Details" />
            </motion.div>
          )}

          {/* Team and payment steps removed; proceed to portal after step 3 */}
        </AnimatePresence>
  </>
  )}
      </CardContent>
    </Card>
  );
}
