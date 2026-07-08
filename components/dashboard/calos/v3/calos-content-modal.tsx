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

/** datetime-local <input> value ("YYYY-MM-DDTHH:mm") for a local Date. */
const toLocalInput = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ContentModal({
  item, onClose, onSaveTitle, onSaveDates, onSaveDetails, onSaveTags, onDecision, onGenerate, onDelete, onOpenScript, onPublish, pubState, connected, onOpenPublishing,
}: {
  item: CalItem;
  onClose: () => void;
  onSaveTitle: (id: string, title: string) => void;
  onSaveDates: (id: string, plannedDates: string[]) => void;
  onSaveDetails: (id: string, details: string) => void;
  onSaveTags: (id: string, customTags: string[]) => void;
  onDecision: (id: string, decision: 'approved' | 'changes_requested') => void;
  onGenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenScript: (item: CalItem) => void;
  /** Optional — publishing lands in Phase 3. When absent, no Publish action shows. */
  onPublish?: (item: CalItem) => void;
  /** Delivery visibility: the card's publish-queue row, whether its platform is connected, and a
   *  jump to the Publishing (connect socials) screen. */
  pubState?: { platform: string; status: string; postUrl: string | null; error: string | null };
  connected?: boolean;
  onOpenPublishing?: () => void;
}) {
  const d = item;
  const [title, setTitle] = useState(d.title);
  const [dates, setDates] = useState<string[]>(() =>
    [...d.dates].sort((a, b) => a.getTime() - b.getTime()).map((dt) => dt.toISOString()),
  );
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState('');

  const removeDate = (iso: string) => {
    if (dates.length <= 1) return; // a deliverable always keeps at least one date
    const next = dates.filter((x) => x !== iso);
    setDates(next);
    onSaveDates(d.id, next);
  };
  const addDate = () => {
    if (!newDate) return;
    const dt = new Date(newDate);
    if (Number.isNaN(dt.getTime())) return;
    const iso = dt.toISOString();
    if (dates.includes(iso)) { setAdding(false); setNewDate(''); return; }
    const next = [...dates, iso].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    setDates(next);
    onSaveDates(d.id, next);
    setNewDate('');
    setAdding(false);
  };

  const [details, setDetails] = useState(d.brief);
  const [tags, setTags] = useState<string[]>(d.tags);
  const [tagInput, setTagInput] = useState('');
  const commitDetails = () => {
    const next = details.trim();
    if (next !== d.brief) onSaveDetails(d.id, next);
  };
  const addTag = () => {
    const t = tagInput.trim().replace(/^#+/, '').toLowerCase();
    setTagInput('');
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    onSaveTags(d.id, next);
  };
  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    onSaveTags(d.id, next);
  };

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <Mono s={9} c={C.muted}>
          AI SCORE <span style={{ color: d.score >= 80 ? C.gold : C.soft, fontWeight: 700 }}>{d.score}</span>
        </Mono>
        <span style={{ width: 1, height: 12, background: C.border }} />
        {tags.map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20 }}>
            <Mono s={8.5} c={C.soft}>#{t}</Mono>
            <span onClick={() => removeTag(t)} title="Remove tag" style={{ color: C.coral, cursor: 'pointer', fontSize: 10 }}>✕</span>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
          onBlur={addTag}
          placeholder="+ tag"
          className="calos-fr"
          style={{ width: 64, background: 'transparent', border: `1px dashed ${C.bs}`, borderRadius: 20, padding: '3px 8px', color: C.text, fontSize: 11, fontFamily: MONO, outline: 'none' }}
        />
      </div>

      {/* Editorial pipeline — display-only. Stage is driven by generation + the Approve /
          Request-changes actions (the /decision route); there is no endpoint to set an
          arbitrary editorialStatus, so the rail is a progress indicator, not a control. */}
      <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 9 }}>Editorial pipeline</Mono>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {STAGES.map((s, i) => {
          const done = i <= idx;
          const cur = s === railStage;
          return (
            <div key={s} style={{ flex: 1 }} title={stageLabel(s)}>
              <div style={{ height: 4, borderRadius: 2, background: done ? C.gold : C.well }} />
              <div style={{ marginTop: 6 }}>
                <Mono s={8} c={cur ? C.gold : done ? C.soft : C.dim}>{stageLabel(s)}</Mono>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <div>
          <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 8 }}>Planned</Mono>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {dates.map((iso) => {
              const dt = new Date(iso);
              const valid = !Number.isNaN(dt.getTime());
              return (
                <span key={iso} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                  <Mono s={9} c={C.soft}>{valid ? `${dayTitle(dt)} · ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : 'Unscheduled'}</Mono>
                  {dates.length > 1 && <span onClick={() => removeDate(iso)} title="Remove this date" style={{ color: C.coral, cursor: 'pointer', fontSize: 11 }}>✕</span>}
                </span>
              );
            })}
            {adding ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="calos-fr" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, fontFamily: SANS, outline: 'none', colorScheme: 'dark' }} />
                <button type="button" className="calos-fr" onClick={addDate} style={{ cursor: 'pointer', padding: '6px 10px', background: 'transparent', border: '1px solid rgba(212,166,82,.4)', borderRadius: 6, color: C.gold, fontFamily: MONO, fontSize: 9 }}>ADD</button>
                <button type="button" className="calos-fr" onClick={() => { setAdding(false); setNewDate(''); }} title="Cancel" style={{ cursor: 'pointer', background: 'none', border: 'none', color: C.muted }}>✕</button>
              </span>
            ) : (
              <button type="button" className="calos-fr" onClick={() => { setAdding(true); setNewDate(toLocalInput(d.dates[d.dates.length - 1] ?? new Date())); }} style={{ cursor: 'pointer', padding: '6px 10px', background: 'transparent', border: `1px dashed ${C.bs}`, borderRadius: 6, color: C.gold, fontFamily: MONO, fontSize: 9 }}>+ ADD</button>
            )}
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
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        onBlur={commitDetails}
        placeholder="Add a brief — the idea, hook, angle…"
        rows={3}
        className="calos-fr"
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13.5, color: C.soft, marginBottom: 12, fontFamily: SANS, outline: 'none', resize: 'vertical' }}
      />

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Mono s={9} c={C.muted}>Script</Mono>
          {d.hasScript ? <Mono s={9} c={C.gold}>● ready</Mono> : <Mono s={9} c={C.dim}>not generated</Mono>}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: d.hasScript ? C.soft : C.dim, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {d.hasScript ? d.raw.scriptPreview : 'Generate to write the script.'}
        </div>
      </div>

      {(d.stage === 'approved' || pubState) && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 18 }}>
          <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 6 }}>Delivery</Mono>
          {connected === false ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Mono s={11} c={C.coral}>{platLabel(d.platform)} isn’t connected — it won’t post.</Mono>
              {onOpenPublishing && <Btn size="sm" onClick={onOpenPublishing}>Connect</Btn>}
            </div>
          ) : pubState?.status === 'published' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Mono s={11} c={C.gold}>✓ Posted to {platLabel(d.platform)}</Mono>
              {pubState.postUrl && <a href={pubState.postUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.gold, textDecoration: 'underline' }}>View post</a>}
            </div>
          ) : pubState?.status === 'failed' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Mono s={11} c={C.coral}>Didn’t post{pubState.error ? `: ${pubState.error}` : '.'}</Mono>
              {onOpenPublishing && <Btn size="sm" onClick={onOpenPublishing}>Publishing</Btn>}
            </div>
          ) : (
            <Mono s={11} c={C.soft}>Queued — auto-posts on the scheduled date.</Mono>
          )}
        </div>
      )}

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
