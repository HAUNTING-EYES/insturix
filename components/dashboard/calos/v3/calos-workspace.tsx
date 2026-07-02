'use client';

import React from 'react';
import type { CadenceRule } from '@/app/dashboard/calos/CadenceEditor';
import type { CalosObjective } from '@/lib/calos/campaign-intent';
import { C, dayTitle, platLabel, stageLabel, stageTick } from './calos-view-model';
import type { CalItem } from './calos-view-model';
import { Mono, Glyph, StatusMark, Btn } from './calos-atoms';

/* ═══ CalOS v3 · campaign workspace ═══════════════════════════════════
   The founder's calos-v3.jsx Workspace screen. Scoped to one campaign
   (decision #5): `items` is the campaign's deliverables, and the per-platform
   progress reads actual-vs-planned from the campaign cadence. */

export interface WorkspaceCampaign {
  _id: string;
  name: string;
  objective?: CalosObjective;
  theme?: string;
  cadenceRules: CadenceRule[];
}

/** ~4 weeks per month — the planned target for a per-week cadence rule. */
const WEEKS_PER_MONTH = 4;

export function CalosWorkspace({
  campaign, items, onBack, onEditCadence, onOpen,
}: {
  campaign: WorkspaceCampaign;
  items: CalItem[]; // already scoped to this campaign
  onBack: () => void;
  onEditCadence: () => void;
  onOpen: (id: string) => void;
}) {
  const perPlat = campaign.cadenceRules.map((r) => ({
    ...r,
    actual: items.filter((d) => d.platform === r.platform).length,
    planned: Math.max(1, r.perWeek * WEEKS_PER_MONTH),
  }));

  return (
    <div>
      <div className="calos-tw" style={{ marginBottom: 16 }}>
        <div>
          <Btn size="sm" onClick={onBack} style={{ marginBottom: 10 }}>◂ Calendar</Btn>
          <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em' }}>{campaign.name}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            {campaign.objective && <Mono s={9} c={C.muted} st={{ textTransform: 'capitalize' }}>{campaign.objective}</Mono>}
            {campaign.objective && campaign.theme && <Mono s={9} c={C.dim}>·</Mono>}
            {campaign.theme && <Mono s={9} c={C.muted}>{campaign.theme}</Mono>}
          </div>
        </div>
        <Btn size="sm" onClick={onEditCadence}>Edit cadence</Btn>
      </div>

      {perPlat.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 22 }}>
          {perPlat.map((r) => (
            <div key={r.platform} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Glyph p={r.platform} act />
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{platLabel(r.platform)}</span>
                <Mono s={8.5} c={C.dim} st={{ marginLeft: 'auto' }}>{r.actual}/{r.planned}</Mono>
              </div>
              <div style={{ height: 4, background: C.well, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (r.actual / r.planned) * 100)}%`, height: '100%', background: C.gold }} />
              </div>
              <Mono s={8} c={C.muted} st={{ display: 'block', marginTop: 8 }}>{r.perWeek}×/wk cadence</Mono>
            </div>
          ))}
        </div>
      )}

      <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 10 }}>Deliverables · {items.length}</Mono>
      {items.length === 0 ? (
        <Mono s={11} c={C.dim}>No deliverables tagged to this campaign yet.</Mono>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 }}>
          {items.map((d) => (
            <button key={d.id} type="button" className="calos-fr" onClick={() => onOpen(d.id)} style={{ cursor: 'pointer', textAlign: 'left', background: C.raised, border: `1px solid ${C.border}`, borderLeft: `2px solid ${stageTick(d.stage)}`, borderRadius: 8, padding: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <Glyph p={d.platform} />
                <Mono s={8} c={C.muted}>{dayTitle(d.date)}</Mono>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}><Mono s={8.5} c={C.muted}>{d.score}</Mono><StatusMark stage={d.stage} /></span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{d.title}</div>
              <Mono s={8} c={C.dim} st={{ display: 'block', marginTop: 5 }}>{stageLabel(d.stage)}</Mono>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
