'use client';

import React, { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_CADENCE } from '@/lib/calos/cadence';
import { CALOS_CAMPAIGN_PLATFORMS } from '@/lib/calos/campaign-cadence';
import { clampPerWeek, normalizePreferredDays } from '@/lib/calos/cadence-normalize';
import { CALOS_OBJECTIVES, DEFAULT_OBJECTIVE, type CalosObjective } from '@/lib/calos/campaign-intent';
import type { CadenceRule } from '@/app/dashboard/calos/CadenceEditor';
import type { CalosCampaignReference } from '@/schemas/calos-campaign';
import { C, DOW, platLabel } from './calos-view-model';
import { Sheet, Btn, Glyph, Mono, inpS } from './calos-atoms';
import { CalosReferencesPanel } from './calos-references-panel';

/* ═══ CalOS v3 · cadence modal ════════════════════════════════════════
   The founder's calos-v3.jsx CadenceModal (create / edit campaign), in the
   v3 gold language. Payload mirrors the live CadenceEditor exactly
   (POST /campaigns · PATCH /campaigns/{id}), using the real cadence
   constants (platforms, objectives, max posts/week). Kept separate from the
   teal CadenceEditor so the v3 surface stays visually cohesive; the save
   contract is the single shared truth (any change to it lives in both). */

export interface EditableCampaign {
  _id: string;
  name: string;
  objective?: CalosObjective;
  theme?: string;
  cadenceRules: CadenceRule[];
  references?: CalosCampaignReference[];
}


export function CalosCadenceModal({
  campaign,
  brandId,
  initialRules,
  onClose,
  onSaved,
}: {
  /** null = create a new campaign; otherwise edit this one. */
  campaign: EditableCampaign | null;
  brandId: string;
  /** Create mode: the suggested cadence to pre-fill. */
  initialRules?: CadenceRule[];
  onClose: () => void;
  onSaved: (newCampaignId?: string) => void;
}) {
  const isCreate = !campaign;
  const [name, setName] = useState(campaign?.name ?? '');
  const [objective, setObjective] = useState<CalosObjective>(campaign?.objective ?? DEFAULT_OBJECTIVE);
  const [theme, setTheme] = useState(campaign?.theme ?? '');
  const [rows, setRows] = useState<CadenceRule[]>(
    (campaign?.cadenceRules?.length ? campaign.cadenceRules : initialRules?.length ? initialRules : (DEFAULT_CADENCE as CadenceRule[])).map((r) => {
      const preferredDays = normalizePreferredDays(r.preferredDays);
      return {
        platform: typeof r.platform === 'string' && r.platform.trim() ? r.platform.trim().toLowerCase() : 'instagram',
        // Days ARE the schedule: posts/week = number of selected days (one post per day). Falls back
        // to the stored perWeek only when no days are selected.
        perWeek: preferredDays.length > 0 ? clampPerWeek(preferredDays.length) : clampPerWeek(r.perWeek),
        preferredDays,
      };
    }),
  );
  const [saving, setSaving] = useState(false);
  // In create mode, holds the id once the campaign is saved so references can be added inline (without
  // closing + reopening). Null until then.
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Campaign id — the edited campaign, or the just-created one. References attach to it.
  const cid = campaign?._id ?? createdId;

  const toggleDay = (ri: number, di: number) =>
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== ri) return r;
        const preferredDays = r.preferredDays.includes(di)
          ? r.preferredDays.filter((x) => x !== di)
          : normalizePreferredDays([...r.preferredDays, di]);
        // Selecting/deselecting a day changes how many times/week you post → keep the counter in sync.
        return { ...r, preferredDays, perWeek: clampPerWeek(preferredDays.length) };
      }),
    );
  const setPW = (ri: number, v: number) =>
    setRows((rs) => rs.map((r, i) => (i === ri ? { ...r, perWeek: clampPerWeek(v) } : r)));
  const removeRow = (ri: number) => setRows((rs) => rs.filter((_, i) => i !== ri));
  const addPlat = () => {
    const used = new Set(rows.map((r) => r.platform));
    const next = CALOS_CAMPAIGN_PLATFORMS.find((p) => !used.has(p));
    if (next) setRows((rs) => [...rs, { platform: next, perWeek: 2, preferredDays: [2, 4] }]);
  };

  const save = async () => {
    if (saving) return;
    if (isCreate && !name.trim()) { toast({ title: 'Name your campaign first', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const res = isCreate
        ? await fetch('/api/services/calos/campaigns', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId, name: name.trim(), objective, theme, cadenceRules: rows }),
          })
        : await fetch(`/api/services/calos/campaigns/${campaign._id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId, updates: { cadenceRules: rows, objective, theme } }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Failed (${res.status})`);
      if (isCreate) {
        const newId = data?.campaign?._id as string | undefined;
        onSaved(newId); // refresh the parent list + select it
        if (newId) {
          setCreatedId(newId); // stay open so references can be added inline
          toast({ title: 'Campaign created', description: 'Add references below, or hit Done.' });
        } else {
          toast({ title: 'Campaign created' });
          onClose();
        }
      } else {
        toast({ title: 'Cadence saved' });
        onSaved(undefined);
        onClose();
      }
    } catch (err) {
      toast({ title: isCreate ? 'Failed to create campaign' : 'Failed to save cadence', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={isCreate ? 'New campaign' : 'Campaign · edit cadence'} onClose={onClose} w={620}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <label><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 6 }}>Name</Mono>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" style={inpS} /></label>
        <label><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 6 }}>Objective</Mono>
          <select value={objective} onChange={(e) => setObjective(e.target.value as CalosObjective)} style={{ ...inpS, textTransform: 'capitalize' }}>
            {CALOS_OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
      </div>
      <label style={{ display: 'block', marginBottom: 18 }}><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 6 }}>Theme</Mono>
        <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="The big idea every post ladders up to" style={inpS} /></label>

      <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 10 }}>Per-platform cadence</Mono>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r, ri) => (
          <div key={ri} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <Glyph p={r.platform} act />
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{platLabel(r.platform)}</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="calos-fr" onClick={() => setPW(ri, r.perWeek - 1)} style={{ cursor: 'pointer', width: 22, height: 22, borderRadius: 5, background: C.bg, border: `1px solid ${C.border}`, color: C.soft }}>−</button>
                <Mono s={10} c={C.soft}>{r.perWeek}×/wk</Mono>
                <button type="button" className="calos-fr" onClick={() => setPW(ri, r.perWeek + 1)} style={{ cursor: 'pointer', width: 22, height: 22, borderRadius: 5, background: C.bg, border: `1px solid ${C.border}`, color: C.soft }}>+</button>
                <button type="button" className="calos-fr" onClick={() => removeRow(ri)} title="Remove platform" style={{ cursor: 'pointer', width: 22, height: 22, borderRadius: 5, background: 'transparent', border: 'none', color: C.coral }}>✕</button>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {DOW.map((d, di) => {
                const on = r.preferredDays.includes(di);
                return (
                  <button key={di} type="button" className="calos-fr" onClick={() => toggleDay(ri, di)} style={{ cursor: 'pointer', flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 5, background: on ? 'rgba(212,166,82,.12)' : C.bg, border: `1px solid ${on ? 'rgba(212,166,82,.4)' : C.border}` }}>
                    <Mono s={8.5} c={on ? C.gold : C.dim}>{d[0]}</Mono>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="calos-fr" onClick={addPlat} style={{ marginTop: 10, cursor: 'pointer', width: '100%', padding: 10, background: 'transparent', border: `1px dashed ${C.bs}`, borderRadius: 8, color: C.gold, fontFamily: 'inherit', fontSize: 10 }}>
        <Mono s={10} c={C.gold}>+ ADD PLATFORM</Mono>
      </button>

      {/* References — the source material generation writes FROM (Phase A). Needs a campaign id, so in
          create mode it appears right after "Create campaign" (the modal stays open). */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 10 }}>References — what generation writes from (PDFs, links, docs, notes)</Mono>
        {!cid ? (
          <div style={{ padding: 10, background: C.surface, border: `1px dashed ${C.bs}`, borderRadius: 8 }}>
            <Mono s={9} c={C.muted}>Hit “Create campaign” below, then add campaign-specific references here. For references that apply to everything, use the brand-level “References” button on the calendar — no campaign needed.</Mono>
          </div>
        ) : (
          <CalosReferencesPanel
            addUrl={`/api/services/calos/campaigns/${cid}/references`}
            delUrl={(id) => `/api/services/calos/campaigns/${cid}/references?refId=${encodeURIComponent(id)}`}
            initialRefs={campaign?.references ?? []}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        {!createdId && <Btn size="sm" onClick={onClose}>Cancel</Btn>}
        <Btn size="sm" variant="primary" onClick={() => { if (createdId) onClose(); else void save(); }} disabled={saving}>
          {saving ? (isCreate ? 'Creating…' : 'Saving…') : createdId ? 'Done' : isCreate ? 'Create campaign' : 'Save cadence'}
        </Btn>
      </div>
    </Sheet>
  );
}
