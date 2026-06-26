'use client';

/**
 * Per-brand publishing connections (the picker UI for the CalOS connect flow).
 *
 * Two ways to give a brand a LinkedIn identity for its approved posts:
 *  - Model A — assign an account the OPERATOR already controls (their profile, or a page they admin,
 *    read from their existing connection). No token stored; the operator's live token is used.
 *  - Model B — connect the CLIENT's OWN login (fresh OAuth popup → pick which account → bind). The
 *    client's token is stored encrypted; for clients who won't grant the operator admin access.
 *
 * "Assigned now" is the source of truth (covers both models). Single active account per brand:
 * binding one removes any previous binding. No binding → the brand falls back to the per-user token.
 */

import { useCallback, useEffect, useState } from 'react';
import { Linkedin, Facebook, Instagram, Building2, User, Check, Loader2, X, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface AssignableAccount {
  accountRef: string;
  accountType: 'organization' | 'personal';
  displayName: string;
}

interface BrandConnectionsProps {
  brandId: string;
  brandName: string;
  open: boolean;
  onClose: () => void;
}

const LINKEDIN_ASSIGN_BASE = '/api/services/calos/connect/linkedin/assign';
const FACEBOOK_ASSIGN_BASE = '/api/services/calos/connect/facebook/assign';
const INSTAGRAM_ASSIGN_BASE = '/api/services/calos/connect/instagram/assign';

export default function BrandConnections({ brandId, brandName, open, onClose }: BrandConnectionsProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false); // operator's own LinkedIn (Model A source)
  const [operatorAccounts, setOperatorAccounts] = useState<AssignableAccount[]>([]);
  const [assignments, setAssignments] = useState<AssignableAccount[]>([]);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [facebookPages, setFacebookPages] = useState<AssignableAccount[]>([]);
  const [facebookAssignments, setFacebookAssignments] = useState<AssignableAccount[]>([]);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [instagramAccounts, setInstagramAccounts] = useState<AssignableAccount[]>([]);
  const [instagramAssignments, setInstagramAssignments] = useState<AssignableAccount[]>([]);
  const [pending, setPending] = useState<{ pendingId: string; accounts: AssignableAccount[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // accountRef | 'connect-a' | 'connect-b' | pendingId

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, assignRes, fbAccRes, fbAssignRes, igAccRes, igAssignRes] = await Promise.all([
        // TODO(CALOS_LOUD): revert these .catch logs to `.catch(() => null)` once stable.
        fetch('/api/services/calos/connect/linkedin/accounts', { cache: 'no-store' })
          .then((r) => r.json())
          .catch((e) => { console.error('[CALOS_LOUD] BrandConnections: linkedin accounts fetch failed:', e); return null; }),
        fetch(`${LINKEDIN_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .catch((e) => { console.error('[CALOS_LOUD] BrandConnections: linkedin assignments fetch failed:', e); return null; }),
        fetch('/api/services/calos/connect/facebook/accounts', { cache: 'no-store' })
          .then((r) => r.json())
          .catch((e) => { console.error('[CALOS_LOUD] BrandConnections: facebook accounts fetch failed:', e); return null; }),
        fetch(`${FACEBOOK_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .catch((e) => { console.error('[CALOS_LOUD] BrandConnections: facebook assignments fetch failed:', e); return null; }),
        fetch('/api/services/calos/connect/instagram/accounts', { cache: 'no-store' })
          .then((r) => r.json())
          .catch((e) => { console.error('[CALOS_LOUD] BrandConnections: instagram accounts fetch failed:', e); return null; }),
        fetch(`${INSTAGRAM_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .catch((e) => { console.error('[CALOS_LOUD] BrandConnections: instagram assignments fetch failed:', e); return null; }),
      ]);

      setConnected(!!accRes?.connected);
      const list: AssignableAccount[] = [];
      if (accRes?.person) list.push(accRes.person);
      if (Array.isArray(accRes?.organizations)) list.push(...accRes.organizations);
      setOperatorAccounts(list);

      setAssignments(
        Array.isArray(assignRes?.assignments)
          ? assignRes.assignments.filter((a: AssignableAccount) => a?.accountRef)
          : [],
      );

      setFacebookConnected(!!fbAccRes?.connected);
      setFacebookPages(
        Array.isArray(fbAccRes?.pages)
          ? fbAccRes.pages.filter((a: AssignableAccount) => a?.accountRef)
          : [],
      );
      setFacebookAssignments(
        Array.isArray(fbAssignRes?.assignments)
          ? fbAssignRes.assignments.filter((a: AssignableAccount) => a?.accountRef)
          : [],
      );

      setInstagramConnected(!!igAccRes?.connected);
      setInstagramAccounts(
        Array.isArray(igAccRes?.accounts)
          ? igAccRes.accounts.filter((a: AssignableAccount) => a?.accountRef)
          : [],
      );
      setInstagramAssignments(
        Array.isArray(igAssignRes?.assignments)
          ? igAssignRes.assignments.filter((a: AssignableAccount) => a?.accountRef)
          : [],
      );
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Delete every binding except keepRef (single active account per brand).
  const removeOtherBindings = useCallback(
    async (keepRef: string) => {
      const others = assignments.filter((a) => a.accountRef !== keepRef).map((a) => a.accountRef);
      await Promise.all(
        others.map((ref) =>
          fetch(
            `${LINKEDIN_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}&accountRef=${encodeURIComponent(ref)}`,
            { method: 'DELETE' },
            // TODO(CALOS_LOUD): revert to `.catch(() => null)` once stable.
          ).catch((e) => { console.error('[CALOS_LOUD] BrandConnections: linkedin unassign DELETE failed:', e); return null; }),
        ),
      );
    },
    [assignments, brandId],
  );

  const removeOtherFacebookBindings = useCallback(
    async (keepRef: string) => {
      const others = facebookAssignments.filter((a) => a.accountRef !== keepRef).map((a) => a.accountRef);
      await Promise.all(
        others.map((ref) =>
          fetch(
            `${FACEBOOK_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}&accountRef=${encodeURIComponent(ref)}`,
            { method: 'DELETE' },
            // TODO(CALOS_LOUD): revert to `.catch(() => null)` once stable.
          ).catch((e) => { console.error('[CALOS_LOUD] BrandConnections: facebook unassign DELETE failed:', e); return null; }),
        ),
      );
    },
    [facebookAssignments, brandId],
  );

  const removeOtherInstagramBindings = useCallback(
    async (keepRef: string) => {
      const others = instagramAssignments.filter((a) => a.accountRef !== keepRef).map((a) => a.accountRef);
      await Promise.all(
        others.map((ref) =>
          fetch(
            `${INSTAGRAM_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}&accountRef=${encodeURIComponent(ref)}`,
            { method: 'DELETE' },
            // TODO(CALOS_LOUD): revert to `.catch(() => null)` once stable.
          ).catch((e) => { console.error('[CALOS_LOUD] BrandConnections: instagram unassign DELETE failed:', e); return null; }),
        ),
      );
    },
    [instagramAssignments, brandId],
  );

  // Popup helper: open url, resolve when it closes or posts `source`. Returns the message payload (or null).
  const openPopup = useCallback(
    (url: string, source: string): Promise<Record<string, unknown> | null> =>
      new Promise((resolve) => {
        const w = 600;
        const h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        const popup = window.open(url, 'LinkedIn Connect', `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`);
        let settled = false;
        const finish = (payload: Record<string, unknown> | null) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          clearInterval(timer);
          resolve(payload);
        };
        const onMessage = (e: MessageEvent) => {
          if (e.origin !== window.location.origin) return;
          if (e.data?.source !== source) return;
          finish(e.data.payload ?? {});
        };
        window.addEventListener('message', onMessage);
        const timer = setInterval(() => {
          if (popup?.closed) finish(null);
        }, 500);
      }),
    [],
  );

  const openFacebookPopup = useCallback(
    (url: string): Promise<void> =>
      new Promise((resolve) => {
        const w = 600;
        const h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        const popup = window.open(url, 'Facebook Connect', `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`);
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearInterval(timer);
          resolve();
        };
        const timer = setInterval(() => {
          if (!popup || popup.closed) {
            finish();
            return;
          }
          try {
            const href = popup.location.href;
            if (href.startsWith(window.location.origin) && href.includes('/dashboard/uploaderx')) {
              popup.close();
              finish();
            }
          } catch {
            // OAuth provider page is cross-origin until it redirects back to the app.
          }
        }, 500);
      }),
    [],
  );

  // Model A: operator connects their OWN LinkedIn (reuses uploaderx OAuth), then we re-read accounts.
  const connectOperator = useCallback(async () => {
    setBusy('connect-a');
    try {
      await openPopup('/api/services/uploaderx/linkedin/auth', 'uploaderx-linkedin-oauth');
      await load();
    } finally {
      setBusy(null);
    }
  }, [openPopup, load]);

  // Model B: client connects their OWN login → returns a pending connect to pick from.
  const connectClientOwn = useCallback(async () => {
    setBusy('connect-b');
    try {
      const payload = await openPopup(
        `/api/services/calos/connect/linkedin/oauth?brandId=${encodeURIComponent(brandId)}`,
        'calos-linkedin-connect',
      );
      if (payload?.success && payload.pendingId) {
        setPending({
          pendingId: String(payload.pendingId),
          accounts: Array.isArray(payload.accounts) ? (payload.accounts as AssignableAccount[]) : [],
        });
      } else if (payload && !payload.success) {
        toast({ title: 'LinkedIn connect failed', description: String(payload.error || ''), variant: 'destructive' });
      }
    } finally {
      setBusy(null);
    }
  }, [openPopup, brandId]);

  const connectFacebook = useCallback(async () => {
    setBusy('connect-facebook');
    try {
      await openFacebookPopup('/api/services/uploaderx/facebook/auth');
      await load();
    } finally {
      setBusy(null);
    }
  }, [openFacebookPopup, load]);

  const connectInstagram = useCallback(async () => {
    setBusy('connect-instagram');
    try {
      await openFacebookPopup('/api/services/uploaderx/instagram/auth');
      await load();
    } finally {
      setBusy(null);
    }
  }, [openFacebookPopup, load]);

  const assign = useCallback(
    async (acc: AssignableAccount) => {
      setBusy(acc.accountRef);
      try {
        const res = await fetch(LINKEDIN_ASSIGN_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, accountRef: acc.accountRef, accountType: acc.accountType, displayName: acc.displayName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({ title: data?.error || `Assign failed (${res.status})`, variant: 'destructive' });
          return;
        }
        await removeOtherBindings(acc.accountRef);
        toast({ title: `${brandName} now posts to LinkedIn as ${acc.displayName}` });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [brandId, brandName, removeOtherBindings, load],
  );

  const assignFacebook = useCallback(
    async (acc: AssignableAccount) => {
      const busyKey = `facebook:${acc.accountRef}`;
      setBusy(busyKey);
      try {
        const res = await fetch(FACEBOOK_ASSIGN_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, accountRef: acc.accountRef, displayName: acc.displayName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({ title: data?.error || `Assign failed (${res.status})`, variant: 'destructive' });
          return;
        }
        await removeOtherFacebookBindings(acc.accountRef);
        toast({ title: `${brandName} now posts to Facebook as ${acc.displayName}` });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [brandId, brandName, removeOtherFacebookBindings, load],
  );

  // Model B finalize: promote the pending connect's chosen account to a bound (encrypted) account.
  const selectPending = useCallback(
    async (acc: AssignableAccount) => {
      if (!pending) return;
      setBusy(acc.accountRef);
      try {
        const res = await fetch('/api/services/calos/connect/linkedin/oauth/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pendingId: pending.pendingId, accountRef: acc.accountRef }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({ title: data?.error || `Connect failed (${res.status})`, variant: 'destructive' });
          return;
        }
        await removeOtherBindings(acc.accountRef);
        toast({ title: `${brandName} now posts to LinkedIn as ${acc.displayName}` });
        setPending(null);
        await load();
      } finally {
        setBusy(null);
      }
    },
    [pending, brandName, removeOtherBindings, load],
  );

  const unassign = useCallback(
    async (acc: AssignableAccount) => {
      setBusy(acc.accountRef);
      try {
        const res = await fetch(
          `${LINKEDIN_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}&accountRef=${encodeURIComponent(acc.accountRef)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          toast({ title: `Remove failed (${res.status})`, variant: 'destructive' });
          return;
        }
        toast({ title: `LinkedIn unassigned — ${brandName} falls back to your personal connection` });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [brandId, brandName, load],
  );

  const unassignFacebook = useCallback(
    async (acc: AssignableAccount) => {
      const busyKey = `facebook:${acc.accountRef}`;
      setBusy(busyKey);
      try {
        const res = await fetch(
          `${FACEBOOK_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}&accountRef=${encodeURIComponent(acc.accountRef)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          toast({ title: `Remove failed (${res.status})`, variant: 'destructive' });
          return;
        }
        toast({ title: `Facebook Page unassigned - ${brandName} needs a Page assignment before posting` });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [brandId, brandName, load],
  );

  const assignInstagram = useCallback(
    async (acc: AssignableAccount) => {
      setBusy(`instagram:${acc.accountRef}`);
      try {
        const res = await fetch(INSTAGRAM_ASSIGN_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, accountRef: acc.accountRef, displayName: acc.displayName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({ title: data?.error || `Assign failed (${res.status})`, variant: 'destructive' });
          return;
        }
        await removeOtherInstagramBindings(acc.accountRef);
        toast({ title: `${brandName} now posts to Instagram as ${acc.displayName}` });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [brandId, brandName, removeOtherInstagramBindings, load],
  );

  const unassignInstagram = useCallback(
    async (acc: AssignableAccount) => {
      setBusy(`instagram:${acc.accountRef}`);
      try {
        const res = await fetch(
          `${INSTAGRAM_ASSIGN_BASE}?brandId=${encodeURIComponent(brandId)}&accountRef=${encodeURIComponent(acc.accountRef)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          toast({ title: `Remove failed (${res.status})`, variant: 'destructive' });
          return;
        }
        toast({ title: `Instagram unassigned - ${brandName} needs an account assignment before posting` });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [brandId, brandName, load],
  );

  if (!open) return null;

  const assignedRefs = new Set(assignments.map((a) => a.accountRef));
  const unassignedOperatorAccounts = operatorAccounts.filter((a) => !assignedRefs.has(a.accountRef));
  const facebookAssignedRefs = new Set(facebookAssignments.map((a) => a.accountRef));
  const unassignedFacebookPages = facebookPages.filter((a) => !facebookAssignedRefs.has(a.accountRef));
  const instagramAssignedRefs = new Set(instagramAssignments.map((a) => a.accountRef));
  const unassignedInstagramAccounts = instagramAccounts.filter((a) => !instagramAssignedRefs.has(a.accountRef));

  const AccountIcon = ({ type }: { type: AssignableAccount['accountType'] }) =>
    type === 'organization' ? (
      <Building2 className="h-3.5 w-3.5 shrink-0 text-[#7A776E]" />
    ) : (
      <User className="h-3.5 w-3.5 shrink-0 text-[#7A776E]" />
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[#1C1B19] bg-[#0F0F0E] p-5 text-[#ECE9E1] shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold">Publishing</h2>
            <p className="mt-0.5 text-[11px] text-[#7A776E]">
              Where <span className="text-[#ECE9E1]">{brandName}</span> posts when approved
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-[#7A776E] hover:bg-[#1C1B19]/60 hover:text-[#ECE9E1]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[#1C1B19] bg-[#0B0B0A] p-4">
          <div className="flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-[#5CCCB8]" />
            <span className="text-xs font-medium">LinkedIn</span>
          </div>

          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#7A776E]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {/* Assigned now (covers both models) */}
              {assignments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-[#5A5851]">Assigned</div>
                  {assignments.map((acc) => {
                    const isBusy = busy === acc.accountRef;
                    return (
                      <div
                        key={acc.accountRef}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#5CCCB8]/40 bg-[#5CCCB8]/5 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <AccountIcon type={acc.accountType} />
                          <div className="min-w-0">
                            <div className="truncate text-xs">{acc.displayName || acc.accountRef}</div>
                            <div className="text-[10px] text-[#7A776E]">
                              {acc.accountType === 'organization' ? 'Company page' : 'Personal profile'}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#5CCCB8]">
                            <Check className="h-3 w-3" /> Active
                          </span>
                          <button
                            onClick={() => unassign(acc)}
                            disabled={isBusy}
                            className="rounded-md border border-[#1C1B19] px-2 py-1 text-[10px] text-[#7A776E] hover:bg-[#1C1B19]/60 hover:text-[#ECE9E1] disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Model A — the operator's own accounts */}
              {connected ? (
                unassignedOperatorAccounts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-[#5A5851]">Your accounts</div>
                    {unassignedOperatorAccounts.map((acc) => {
                      const isBusy = busy === acc.accountRef;
                      return (
                        <div
                          key={acc.accountRef}
                          className="flex items-center justify-between gap-3 rounded-lg border border-[#1C1B19] bg-[#0F0F0E] px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <AccountIcon type={acc.accountType} />
                            <div className="min-w-0">
                              <div className="truncate text-xs">{acc.displayName}</div>
                              <div className="text-[10px] text-[#7A776E]">
                                {acc.accountType === 'organization' ? 'Company page' : 'Personal profile'}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => assign(acc)}
                            disabled={isBusy}
                            className="shrink-0 rounded-md border border-[#1C1B19] px-2.5 py-1 text-[10px] text-[#ECE9E1] hover:bg-[#1C1B19]/60 disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Assign'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                assignments.length === 0 && (
                  <p className="text-[11px] text-[#7A776E]">
                    Connect LinkedIn to assign your own profile or a company page you admin.
                  </p>
                )
              )}

              {!connected && (
                <button
                  onClick={connectOperator}
                  disabled={busy === 'connect-a'}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#5CCCB8] px-3 py-1.5 text-xs font-medium text-[#0B0B0A] hover:bg-[#5CCCB8]/90 disabled:opacity-60"
                >
                  {busy === 'connect-a' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Linkedin className="h-3.5 w-3.5" />}
                  Connect your LinkedIn
                </button>
              )}

              {/* Model B — the client's own login + pick step */}
              <div className="border-t border-[#1C1B19] pt-3">
                {pending ? (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-[#5A5851]">Pick the account to bind</div>
                    {pending.accounts.length === 0 ? (
                      <p className="text-[11px] text-[#7A776E]">That login has no postable LinkedIn account.</p>
                    ) : (
                      pending.accounts.map((acc) => {
                        const isBusy = busy === acc.accountRef;
                        return (
                          <div
                            key={acc.accountRef}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[#1C1B19] bg-[#0F0F0E] px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <AccountIcon type={acc.accountType} />
                              <div className="min-w-0">
                                <div className="truncate text-xs">{acc.displayName}</div>
                                <div className="text-[10px] text-[#7A776E]">
                                  {acc.accountType === 'organization' ? 'Company page' : 'Personal profile'}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => selectPending(acc)}
                              disabled={isBusy}
                              className="shrink-0 rounded-md bg-[#5CCCB8] px-2.5 py-1 text-[10px] font-medium text-[#0B0B0A] hover:bg-[#5CCCB8]/90 disabled:opacity-60"
                            >
                              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Use this'}
                            </button>
                          </div>
                        );
                      })
                    )}
                    <button onClick={() => setPending(null)} className="text-[10px] text-[#7A776E] hover:text-[#ECE9E1]">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectClientOwn}
                    disabled={busy === 'connect-b'}
                    className="inline-flex items-center gap-2 text-[11px] text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-60"
                  >
                    {busy === 'connect-b' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Connect a client&apos;s own LinkedIn instead
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[#1C1B19] bg-[#0B0B0A] p-4">
          <div className="flex items-center gap-2">
            <Facebook className="h-4 w-4 text-[#5C8DFF]" />
            <span className="text-xs font-medium">Facebook</span>
            <span className="rounded-full border border-[#1C1B19] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#7A776E]">
              Page only
            </span>
          </div>

          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#7A776E]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {facebookAssignments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-[#5A5851]">Assigned Page</div>
                  {facebookAssignments.map((acc) => {
                    const isBusy = busy === `facebook:${acc.accountRef}`;
                    return (
                      <div
                        key={acc.accountRef}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#5C8DFF]/40 bg-[#5C8DFF]/5 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <AccountIcon type="organization" />
                          <div className="min-w-0">
                            <div className="truncate text-xs">{acc.displayName || acc.accountRef}</div>
                            <div className="text-[10px] text-[#7A776E]">Facebook Page</div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#5C8DFF]">
                            <Check className="h-3 w-3" /> Active
                          </span>
                          <button
                            onClick={() => unassignFacebook(acc)}
                            disabled={isBusy}
                            className="rounded-md border border-[#1C1B19] px-2 py-1 text-[10px] text-[#7A776E] hover:bg-[#1C1B19]/60 hover:text-[#ECE9E1] disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {facebookConnected ? (
                <>
                  {unassignedFacebookPages.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wide text-[#5A5851]">Your Pages</div>
                      {unassignedFacebookPages.map((acc) => {
                        const isBusy = busy === `facebook:${acc.accountRef}`;
                        return (
                          <div
                            key={acc.accountRef}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[#1C1B19] bg-[#0F0F0E] px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <AccountIcon type="organization" />
                              <div className="min-w-0">
                                <div className="truncate text-xs">{acc.displayName}</div>
                                <div className="text-[10px] text-[#7A776E]">Facebook Page</div>
                              </div>
                            </div>
                            <button
                              onClick={() => assignFacebook(acc)}
                              disabled={isBusy}
                              className="shrink-0 rounded-md border border-[#1C1B19] px-2.5 py-1 text-[10px] text-[#ECE9E1] hover:bg-[#1C1B19]/60 disabled:opacity-60"
                            >
                              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Assign'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {facebookPages.length === 0 && (
                    <p className="text-[11px] text-[#7A776E]">
                      Facebook is connected, but no Pages are available for publishing.
                    </p>
                  )}
                </>
              ) : (
                facebookAssignments.length === 0 && (
                  <p className="text-[11px] text-[#7A776E]">
                    Connect Facebook to assign a Page. CalOS does not publish to personal Facebook profiles.
                  </p>
                )
              )}

              {(!facebookConnected || facebookPages.length === 0) && (
                <button
                  onClick={connectFacebook}
                  disabled={busy === 'connect-facebook'}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#5C8DFF] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5C8DFF]/90 disabled:opacity-60"
                >
                  {busy === 'connect-facebook' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Facebook className="h-3.5 w-3.5" />}
                  {facebookConnected ? 'Reconnect Facebook' : 'Connect Facebook'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[#1C1B19] bg-[#0B0B0A] p-4">
          <div className="flex items-center gap-2">
            <Instagram className="h-4 w-4 text-[#E1306C]" />
            <span className="text-xs font-medium">Instagram</span>
            <span className="rounded-full border border-[#1C1B19] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#7A776E]">
              Image only
            </span>
          </div>

          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#7A776E]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {instagramAssignments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-[#5A5851]">Assigned account</div>
                  {instagramAssignments.map((acc) => {
                    const isBusy = busy === `instagram:${acc.accountRef}`;
                    return (
                      <div
                        key={acc.accountRef}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#E1306C]/40 bg-[#E1306C]/5 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <AccountIcon type="organization" />
                          <div className="min-w-0">
                            <div className="truncate text-xs">{acc.displayName || acc.accountRef}</div>
                            <div className="text-[10px] text-[#7A776E]">Instagram account</div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#E1306C]">
                            <Check className="h-3 w-3" /> Active
                          </span>
                          <button
                            onClick={() => unassignInstagram(acc)}
                            disabled={isBusy}
                            className="rounded-md border border-[#1C1B19] px-2 py-1 text-[10px] text-[#7A776E] hover:bg-[#1C1B19]/60 hover:text-[#ECE9E1] disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {instagramConnected ? (
                <>
                  {unassignedInstagramAccounts.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wide text-[#5A5851]">Your accounts</div>
                      {unassignedInstagramAccounts.map((acc) => {
                        const isBusy = busy === `instagram:${acc.accountRef}`;
                        return (
                          <div
                            key={acc.accountRef}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[#1C1B19] bg-[#0F0F0E] px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <AccountIcon type="organization" />
                              <div className="min-w-0">
                                <div className="truncate text-xs">{acc.displayName}</div>
                                <div className="text-[10px] text-[#7A776E]">Instagram account</div>
                              </div>
                            </div>
                            <button
                              onClick={() => assignInstagram(acc)}
                              disabled={isBusy}
                              className="shrink-0 rounded-md border border-[#1C1B19] px-2.5 py-1 text-[10px] text-[#ECE9E1] hover:bg-[#1C1B19]/60 disabled:opacity-60"
                            >
                              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Assign'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {instagramAccounts.length === 0 && (
                    <p className="text-[11px] text-[#7A776E]">
                      Instagram is connected, but no accounts are available for publishing.
                    </p>
                  )}
                </>
              ) : (
                instagramAssignments.length === 0 && (
                  <p className="text-[11px] text-[#7A776E]">
                    Connect Instagram to assign an account. Instagram posts need an image (the card&apos;s
                    generated graphic).
                  </p>
                )
              )}

              {(!instagramConnected || instagramAccounts.length === 0) && (
                <button
                  onClick={connectInstagram}
                  disabled={busy === 'connect-instagram'}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E1306C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#E1306C]/90 disabled:opacity-60"
                >
                  {busy === 'connect-instagram' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Instagram className="h-3.5 w-3.5" />}
                  {instagramConnected ? 'Reconnect Instagram' : 'Connect Instagram'}
                </button>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-[#5A5851]">
          Approved cards publish to the assigned account at their scheduled time. LinkedIn can use your
          personal connection when unassigned; Facebook needs a Page; Instagram needs an account + an image.
        </p>
      </div>
    </div>
  );
}
