'use client';

import React, { useState } from 'react';
import { C, SANS, MONO, STAGES, stageLabel, platLabel, dayTitle } from './calos-view-model';
import type { CalItem } from './calos-view-model';
import { Sheet, Btn, Glyph, StatusMark, Mono } from './calos-atoms';

/* ═══ CalOS v3 · content card ═════════════════════════════════════════
   Per-deliverable editor: title, editorial pipeline, brief, script, and the
   review/generate/publish actions. Presentational — every mutation is a
   callback the calendar wires to useCalosDeliverables + the /decision and
   /generate endpoints. */

export function ContentModal({
  item, onClose, onSaveTitle, onStage, onDecision, onGenerate, onDelete, onOpenScript, onPublish,
}: {
  item: CalItem;
  onClose: () => void;
  onSaveTitle: (id: string, title: string) => void;
  onStage: (id: string, stage: string) => void;
  onDecision: (id: string, decision: 'approved' | 'changes_requested') => void;
  onGenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenScript: (item: CalItem) => void;
  /** Optional — publishing lands in Phase 3. When absent, no Publish action shows. */
  onPublish?: (item: CalItem) => void;
}) {
  const d = item;
  const [title, setTitle] = useState(d.title);
  // The rail highlights the furthest non-terminal stage; changes_requested and
  // published both display against the in_review / approved anchors.
  const railStage =
    d.stage === 'changes_requested' ? 'in_review' : d.stage === 'published' ? 'approved' : d.stage;
  const idx = STAGES.indexOf(railStage as (typeof STAGES)[number]);

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== d.title) onSaveTitle(d.id, next);
  };

  return (
    <Sheet title={`${platLabel(d.platform)} · content card`} onClose={onClose} w={660}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        className="calos-fr"
        style={{ width: '100%', background: 'transparent', border: 'none', color: C.text, fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', outline: 'none', fontFamily: SANS, marginBottom: 8 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <Mono s={9} c={C.muted}>
          AI SCORE <span style={{ color: d.score >= 80 ? C.gold : C.soft, fontWeight: 700 }}>{d.score}</span>
        </Mono>
        <span style={{ width: 1, height: 12, background: C.border }} />
        {d.tags.map((t) => (
          <span key={t} style={{ padding: '3px 8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20 }}>
            <Mono s={8.5} c={C.soft}>#{t}</Mono>
          </span>
        ))}
      </div>

      <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 9 }}>Editorial pipeline</Mono>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {STAGES.map((s, i) => {
          const done = i <= idx;
          const cur = s === railStage;
          return (
            <button
              key={s}
              className="calos-fr"
              onClick={() => onStage(d.id, s)}
              title={`Move to ${stageLabel(s)}`}
              style={{ flex: 1, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }}
            >
              <div style={{ height: 4, borderRadius: 2, background: done ? C.gold : C.well }} />
              <div style={{ marginTop: 6 }}>
                <Mono s={8} c={cur ? C.gold : done ? C.soft : C.dim}>{stageLabel(s)}</Mono>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <div>
          <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 8 }}>Planned</Mono>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(d.raw.plannedDates?.length ? d.raw.plannedDates : [d.date.toISOString()]).map((iso, i) => {
              const dt = new Date(iso);
              const valid = !Number.isNaN(dt.getTime());
              return (
                <span key={`${iso}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                  <Mono s={9} c={C.soft}>{valid ? `${dayTitle(dt)} · ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : 'Unscheduled'}</Mono>
                </span>
              );
            })}
          </div>
        </div>
        <div>
          <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 8 }}>Platform</Mono>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <Glyph p={d.platform} act />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{platLabel(d.platform)}</span>
            <StatusMark stage={d.stage} />
          </div>
        </div>
      </div>

      <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 7 }}>Idea / brief</Mono>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13.5, color: d.brief ? C.soft : C.dim, marginBottom: 12 }}>
        {d.brief || 'No brief yet.'}
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Mono s={9} c={C.muted}>Script</Mono>
          {d.hasScript ? <Mono s={9} c={C.gold}>● ready</Mono> : <Mono s={9} c={C.dim}>not generated</Mono>}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: d.hasScript ? C.soft : C.dim, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {d.hasScript ? d.raw.scriptPreview : 'Generate to write the script.'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn size="sm" onClick={() => onOpenScript(d)}>Open script</Btn>
        <Btn size="sm" variant="primary" onClick={() => onGenerate(d.id)}>✨ Generate</Btn>
        <Btn size="sm" variant="approve" onClick={() => { onDecision(d.id, 'approved'); onClose(); }}>✓ Approve</Btn>
        <Btn size="sm" variant="danger" onClick={() => { onDecision(d.id, 'changes_requested'); onClose(); }}>Request changes</Btn>
        {d.stage === 'approved' && onPublish && (
          <Btn size="sm" variant="primary" onClick={() => onPublish(d)}>Publish →</Btn>
        )}
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="danger" onClick={() => { onDelete(d.id); onClose(); }}>Delete</Btn>
      </div>
    </Sheet>
  );
}
