'use client';

/**
 * Brand access editor (#3 — option D). Org admins choose who can use a client brand.
 *
 * Semantics mirror the backend exactly: no one selected => OPEN (everyone in the org), any members
 * selected => RESTRICTED to those members. Org admins always bypass restrictions, so their rows show
 * "Always" rather than a toggle. The PUT is server-enforced admin-only regardless of what renders here.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Globe, Loader2, Lock } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { useOrgMembers } from '@/hooks/useOrganization';

interface BrandAccessEditorProps {
  brandId: string;
  brandName: string;
  open: boolean;
  onClose: () => void;
}

interface AccessResponse {
  ok: boolean;
  userIds: string[];
}

async function readAccessResponse(response: Response, fallbackMessage: string): Promise<AccessResponse> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: unknown };
    ok?: unknown;
    userIds?: unknown;
  } | null;
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.userIds)) {
    throw new Error(typeof payload?.error?.message === 'string' ? payload.error.message : fallbackMessage);
  }
  return { ok: true, userIds: payload.userIds.filter((userId): userId is string => typeof userId === 'string') };
}

export function BrandAccessEditor({ brandId, brandName, open, onClose }: BrandAccessEditorProps) {
  const { orgId, orgRole } = useAuth();
  const isAdmin = orgRole === 'org:admin';
  const queryClient = useQueryClient();

  const { data: membersData, isLoading: membersLoading } = useOrgMembers(orgId ?? null);

  const accessQuery = useQuery({
    queryKey: ['brand-access', brandId],
    queryFn: async (): Promise<AccessResponse> => {
      const res = await fetch(`/api/brand-vault/brands/${encodeURIComponent(brandId)}/access`, {
        credentials: 'include',
      });
      return readAccessResponse(res, 'Failed to load brand access.');
    },
    enabled: open && Boolean(orgId) && isAdmin,
  });

  // selected = explicitly-granted member ids. Empty => open to everyone.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (accessQuery.data) setSelected(new Set(accessQuery.data.userIds ?? []));
  }, [accessQuery.data]);

  const members = membersData?.members ?? [];
  const everyone = selected.size === 0;

  const save = useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await fetch(`/api/brand-vault/brands/${encodeURIComponent(brandId)}/access`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });
      return readAccessResponse(res, 'Failed to save brand access.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-access'] });
      queryClient.invalidateQueries({ queryKey: ['active-brand', 'brands'] });
      onClose();
    },
  });

  const toggleMember = (clerkUserId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clerkUserId)) next.delete(clerkUserId);
      else next.add(clerkUserId);
      return next;
    });

  const loading = membersLoading || accessQuery.isLoading;

  return (
    <ModalOverlay open={open} onClose={onClose} title={`Manage access — ${brandName}`}>
      <div className="px-1 py-1 text-[#ECE9E1]">
        {!orgId ? (
          <p className="px-2 py-6 text-sm text-[#7A776E]">Brand access is an organization feature.</p>
        ) : !isAdmin ? (
          <p className="px-2 py-6 text-sm text-[#7A776E]">Only an org admin can manage who can use a brand.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-[#7A776E]">
            <Loader2 size={14} className="animate-spin" /> Loading members…
          </div>
        ) : accessQuery.isError ? (
          <p role="alert" className="px-2 py-6 text-sm leading-relaxed text-red-300">
            {accessQuery.error instanceof Error
              ? accessQuery.error.message
              : 'Brand access could not be verified. No changes were made.'}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#1C1B19]/60"
            >
              <span className="flex items-center gap-2.5 text-sm">
                <Globe size={16} className="text-[#5F5E5A]" />
                Open — everyone in the org
              </span>
              <Toggle on={everyone} />
            </button>

            <div className="my-1 border-t border-[#1C1B19]" />

            <div className="max-h-72 overflow-y-auto">
              {members.map((member) => {
                const bypass = member.role === 'admin' || member.role === 'owner';
                const granted = selected.has(member.clerkUserId);
                const label = member.username || member.email.split('@')[0];
                return (
                  <div
                    key={member.clerkUserId}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#1C1B19] bg-[#0F0F0E] text-[11px] uppercase text-[#ECE9E1]">
                        {label.charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{label}</span>
                        <span className="block truncate text-[11px] text-[#5F5E5A]">{member.email}</span>
                      </span>
                    </span>
                    {bypass ? (
                      <span className="shrink-0 rounded-full border border-[#1C1B19] px-2.5 py-0.5 text-[11px] text-[#7A776E]">
                        Admin · always
                      </span>
                    ) : (
                      <button type="button" onClick={() => toggleMember(member.clerkUserId)} aria-label={`Toggle access for ${label}`}>
                        <Toggle on={granted} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#1C1B19] px-1 pt-3">
              <span className="flex items-center gap-1.5 text-[11px] text-[#7A776E]">
                {everyone ? <Globe size={13} /> : <Lock size={13} className="text-[#D4A652]" />}
                {everyone
                  ? 'No one selected — everyone in the org can use this brand.'
                  : `Restricted to ${selected.size} ${selected.size === 1 ? 'person' : 'people'} + admins.`}
              </span>
              <button
                type="button"
                onClick={() => save.mutate([...selected])}
                disabled={save.isPending}
                className="flex items-center gap-2 rounded-full border border-[#D4A652]/40 bg-[#D4A652]/10 px-4 py-1.5 text-sm text-[#D4A652] transition-colors hover:bg-[#D4A652]/20 disabled:opacity-50"
              >
                {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save
              </button>
            </div>
            {save.isError && (
              <p role="alert" className="px-1 pt-2 text-[11px] text-red-400">
                {save.error instanceof Error ? save.error.message : 'Couldn’t save. Try again.'}
              </p>
            )}
          </>
        )}
      </div>
    </ModalOverlay>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? 'bg-[#D4A652]' : 'border border-[#3a3a37] bg-[#0F0F0E]'
      }`}
    >
      <span
        className={`absolute top-[2px] h-4 w-4 rounded-full transition-all ${
          on ? 'left-[18px] bg-white' : 'left-[2px] bg-[#5F5E5A]'
        }`}
      />
    </span>
  );
}
