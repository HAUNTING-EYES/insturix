'use client';

/**
 * Per-brand publishing connections (the picker UI for the CalOS connect flow).
 *
 * Lets the user assign a LinkedIn account they control — their personal profile or a company page
 * they admin (read from their existing per-user connection) — to the active brand, so approved cards
 * for that brand publish from the right identity. This is Model A (assign, no fresh OAuth): if the
 * user hasn't connected LinkedIn at all, it opens the existing uploaderx connect popup first.
 *
 * Single active account per brand: assigning one removes any previously-assigned account, matching
 * the publisher's single-account resolution. No assignment → the brand falls back to the per-user token.
 */

import { useCallback, useEffect, useState } from 'react';
import { Linkedin, Building2, User, Check, Loader2, X } from 'lucide-react';
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

export default function BrandConnections({ brandId, brandName, open, onClose }: BrandConnectionsProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<AssignableAccount[]>([]);
  const [assignedRefs, setAssignedRefs] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null); // accountRef being mutated, or 'connect'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, assignRes] = await Promise.all([
        fetch('/api/services/calos/connect/linkedin/accounts', { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => null),
        fetch(`/api/services/calos/connect/linkedin/assign?brandId=${encodeURIComponent(brandId)}`, {
          cache: 'no-store',
        })
          .then((r) => r.json())
          .catch(() => null),
      ]);

      setConnected(!!accRes?.connected);

      const list: AssignableAccount[] = [];
      if (accRes?.person) list.push(accRes.person);
      if (Array.isArray(accRes?.organizations)) list.push(...accRes.organizations);
      setAccounts(list);

      setAssignedRefs(
        new Set<string>(
          Array.isArray(assignRes?.assignments)
            ? assignRes.assignments
                .map((a: { accountRef?: string }) => a.accountRef)
                .filter((r: string | undefined): r is string => Boolean(r))
            : [],
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // LinkedIn connect popup (reuses the per-user uploaderx OAuth) → refetch on close / postMessage.
  const connect = useCallback(() => {
    setBusy('connect');
    const w = 600;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      '/api/services/uploaderx/linkedin/auth',
      'LinkedIn Connect',
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`,
    );

    const finish = () => {
      window.removeEventListener('message', onMessage);
      setBusy(null);
      void load();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.source !== 'uploaderx-linkedin-oauth') return;
      clearInterval(timer);
      finish();
    };
    window.addEventListener('message', onMessage);
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        finish();
      }
    }, 500);
  }, [load]);

  const assign = useCallback(
    async (acc: AssignableAccount) => {
      setBusy(acc.accountRef);
      try {
        const res = await fetch('/api/services/calos/connect/linkedin/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            accountRef: acc.accountRef,
            accountType: acc.accountType,
            displayName: acc.displayName,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({ title: data?.error || `Assign failed (${res.status})`, variant: 'destructive' });
          return;
        }
        // Single active account per brand: drop any previously-assigned different account.
        const others = Array.from(assignedRefs).filter((ref) => ref !== acc.accountRef);
        await Promise.all(
          others.map((ref) =>
            fetch(
              `/api/services/calos/connect/linkedin/assign?brandId=${encodeURIComponent(
                brandId,
              )}&accountRef=${encodeURIComponent(ref)}`,
              { method: 'DELETE' },
            ).catch(() => null),
          ),
        );
        toast({ title: `${brandName} now posts to LinkedIn as ${acc.displayName}` });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [brandId, brandName, assignedRefs, load],
  );

  const unassign = useCallback(
    async (acc: AssignableAccount) => {
      setBusy(acc.accountRef);
      try {
        const res = await fetch(
          `/api/services/calos/connect/linkedin/assign?brandId=${encodeURIComponent(
            brandId,
          )}&accountRef=${encodeURIComponent(acc.accountRef)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          toast({ title: `Unassign failed (${res.status})`, variant: 'destructive' });
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

  if (!open) return null;

  const hasOrgs = accounts.some((a) => a.accountType === 'organization');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#1C1B19] bg-[#0F0F0E] p-5 text-[#ECE9E1] shadow-2xl">
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
          ) : !connected ? (
            <div className="mt-3 space-y-3">
              <p className="text-[11px] text-[#7A776E]">
                Connect LinkedIn once, then assign a profile or company page to this brand.
              </p>
              <button
                onClick={connect}
                disabled={busy === 'connect'}
                className="inline-flex items-center gap-2 rounded-lg bg-[#5CCCB8] px-3 py-1.5 text-xs font-medium text-[#0B0B0A] hover:bg-[#5CCCB8]/90 disabled:opacity-60"
              >
                {busy === 'connect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Linkedin className="h-3.5 w-3.5" />}
                Connect LinkedIn
              </button>
            </div>
          ) : accounts.length === 0 ? (
            <p className="mt-3 text-[11px] text-[#7A776E]">No assignable accounts found on your LinkedIn connection.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {accounts.map((acc) => {
                const isAssigned = assignedRefs.has(acc.accountRef);
                const isBusy = busy === acc.accountRef;
                return (
                  <div
                    key={acc.accountRef}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                      isAssigned ? 'border-[#5CCCB8]/40 bg-[#5CCCB8]/5' : 'border-[#1C1B19] bg-[#0F0F0E]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {acc.accountType === 'organization' ? (
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-[#7A776E]" />
                      ) : (
                        <User className="h-3.5 w-3.5 shrink-0 text-[#7A776E]" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs">{acc.displayName}</div>
                        <div className="text-[10px] text-[#7A776E]">
                          {acc.accountType === 'organization' ? 'Company page' : 'Personal profile'}
                        </div>
                      </div>
                    </div>
                    {isAssigned ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#5CCCB8]">
                          <Check className="h-3 w-3" /> Assigned
                        </span>
                        <button
                          onClick={() => unassign(acc)}
                          disabled={isBusy}
                          className="rounded-md border border-[#1C1B19] px-2 py-1 text-[10px] text-[#7A776E] hover:bg-[#1C1B19]/60 hover:text-[#ECE9E1] disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => assign(acc)}
                        disabled={isBusy}
                        className="shrink-0 rounded-md border border-[#1C1B19] px-2.5 py-1 text-[10px] text-[#ECE9E1] hover:bg-[#1C1B19]/60 disabled:opacity-60"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Assign'}
                      </button>
                    )}
                  </div>
                );
              })}
              {!hasOrgs && (
                <p className="pt-1 text-[10px] text-[#7A776E]">
                  Only your personal profile is available. To post as a company page, reconnect LinkedIn with
                  organization access.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-[#5A5851]">
          Approved cards for this brand publish to the assigned account at their scheduled time. With no
          assignment, posts use your personal LinkedIn connection.
        </p>
      </div>
    </div>
  );
}
