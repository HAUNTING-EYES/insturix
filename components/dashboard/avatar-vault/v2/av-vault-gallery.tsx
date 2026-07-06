'use client';

import React, { useState } from 'react';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import { useAvatarProfiles, useAvatarVaultMutations } from '@/components/dashboard/AvatarVault/useAvatarVault';
import { C, EASE, statusMeta, usageLabel } from './av-tokens';
import { Mono, Btn, Portrait } from './av-atoms';

/* ═══ Avatar Vault v2 · gallery (screen 1) ════════════════════════════
   The founder's avatar-vault.jsx vault, wired to the real list query.
   Real statuses (draft/accepted/rejected/superseded/disabled), inline
   accept + reject-with-reason on drafts, loading skeletons, empty state. */

function SkeletonCard() {
  return (
    <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', gap: 13, marginBottom: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 10, background: C.well, border: `1px solid ${C.bs}` }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <div style={{ height: 14, width: '70%', borderRadius: 4, background: C.well }} />
          <div style={{ height: 9, width: '45%', borderRadius: 4, background: C.surface }} />
        </div>
      </div>
      <div style={{ height: 20, borderRadius: 20, background: C.surface, marginBottom: 12 }} />
      <div style={{ height: 30, borderRadius: 8, background: C.surface }} />
    </div>
  );
}

function VaultCard({
  record, onRender, onEdit,
}: {
  record: AvatarProfileRecord;
  onRender: (r: AvatarProfileRecord) => void;
  onEdit: (r: AvatarProfileRecord) => void;
}) {
  const { reviewDraft } = useAvatarVaultMutations();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const p = record.profile;
  const meta = statusMeta(record.status);
  const usage = p.performancePack?.usagePresets ?? [];
  const reviewable = record.status === 'draft' || record.status === 'rejected';
  const busy = reviewDraft.isPending;

  const accept = () => reviewDraft.mutate({ recordId: record.id, action: 'accept' });
  const confirmReject = () => {
    reviewDraft.mutate({ recordId: record.id, action: 'reject', reason: reason.trim() || 'Rejected in Avatar Vault.' });
    setRejecting(false);
    setReason('');
  };

  return (
    <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, opacity: record.status === 'superseded' || record.status === 'disabled' ? 0.6 : 1, transition: `border-color .2s ${EASE}` }}>
      <div style={{ display: 'flex', gap: 13, marginBottom: 14 }}>
        <Portrait name={p.displayName} size={56} url={p.portrait?.imageUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.displayName || 'Unnamed'}</div>
          <Mono s={8.5} c={C.muted} st={{ display: 'block', marginTop: 3 }}>{p.persona?.defaultRole || 'role undefined'}</Mono>
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, border: `1px solid ${record.status === 'accepted' ? 'rgba(212,166,82,.4)' : C.border}` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />
            <Mono s={8} c={meta.color}>{meta.label}</Mono>
          </div>
        </div>
      </div>

      {(usage.length > 0 || p.brandId) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          {usage.map((u) => <span key={u} style={{ padding: '3px 8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20 }}><Mono s={8} c={C.soft}>{usageLabel(u)}</Mono></span>)}
          {p.brandId && <span style={{ padding: '3px 8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20 }}><Mono s={8} c={C.gold}>◈ {p.brandId}</Mono></span>}
        </div>
      )}

      {record.status === 'rejected' && record.review?.rejectionReason && (
        <div style={{ marginBottom: 12, padding: '8px 10px', background: C.bg, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.coral}`, borderRadius: 6 }}>
          <Mono s={8} c={C.muted}>Rejection reason</Mono>
          <div style={{ fontSize: 12, color: C.soft, marginTop: 3 }}>{record.review.rejectionReason}</div>
        </div>
      )}

      {rejecting ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="av-fr" style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px', color: C.text, fontSize: 12.5, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn size="sm" onClick={() => { setRejecting(false); setReason(''); }} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
            <Btn size="sm" variant="danger" disabled={busy} onClick={confirmReject} style={{ flex: 1, justifyContent: 'center' }}>Confirm reject</Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          {record.status === 'accepted' && <Btn size="sm" variant="primary" onClick={() => onRender(record)} style={{ flex: 1, justifyContent: 'center' }}>Render →</Btn>}
          {reviewable && <Btn size="sm" variant="primary" disabled={busy} onClick={accept} style={{ flex: 1, justifyContent: 'center' }}>{busy ? '…' : '✓ Accept'}</Btn>}
          {reviewable && <Btn size="sm" variant="danger" disabled={busy} onClick={() => setRejecting(true)}>Reject</Btn>}
          <Btn size="sm" onClick={() => onEdit(record)}>Edit</Btn>
        </div>
      )}
    </div>
  );
}

export function AvatarVaultGallery({
  onCreate, onRender, onEdit,
}: {
  onCreate: () => void;
  onRender: (r: AvatarProfileRecord) => void;
  onEdit: (r: AvatarProfileRecord) => void;
}) {
  const { data: records, isLoading, isError, error } = useAvatarProfiles();

  if (isLoading) {
    return (
      <div className="av-vaultgrid">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ border: `1px dashed ${C.bs}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.coral }}>Couldn&apos;t load your vault.</div>
        <div style={{ color: C.soft, marginTop: 8, fontSize: 13 }}>{error instanceof Error ? error.message : 'Please try again.'}</div>
      </div>
    );
  }

  const list = records ?? [];
  if (list.length === 0) {
    return (
      <div style={{ border: `1px dashed ${C.bs}`, borderRadius: 16, padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em' }}>Your vault is empty.</div>
        <div style={{ color: C.soft, marginTop: 8 }}>Craft a virtual person once — reuse them across every render.</div>
        <div style={{ marginTop: 22 }}><Btn variant="primary" onClick={onCreate}>+ Create virtual person</Btn></div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-0.035em' }}>Your <span style={{ color: C.gold }}>people.</span></div>
        <Mono s={9} c={C.muted}>{list.length} virtual person{list.length === 1 ? '' : 's'}</Mono>
      </div>
      <div className="av-vaultgrid">
        {list.map((r) => <VaultCard key={r.id} record={r} onRender={onRender} onEdit={onEdit} />)}
        <button className="av-fr" onClick={onCreate} style={{ cursor: 'pointer', background: 'transparent', border: `1.5px dashed ${C.bs}`, borderRadius: 12, minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.muted }}>
          <span style={{ fontSize: 26, color: C.gold }}>+</span><Mono s={9} c={C.soft}>New virtual person</Mono>
        </button>
      </div>
    </>
  );
}
