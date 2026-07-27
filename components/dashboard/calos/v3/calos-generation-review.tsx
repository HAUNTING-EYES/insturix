'use client';

import React from 'react';
import { C, dayTitle, stageTick } from './calos-view-model';
import type { CalItem } from './calos-view-model';
import { Sheet, Btn, Glyph, Mono } from './calos-atoms';

/* ═══ CalOS v3 · generation review ════════════════════════════════════
   The founder's GenPreview / AIPlanModal preview list. Because the real
   /auto-fill and /ai-plan endpoints persist their drafts server-side (no
   dry-run), these are the just-created drafts — "remove" is a real delete,
   so the flow is generate → review → prune, which nets to the same result
   as preview → place without any backend change. */

export function GenerationReview({
  title, sub, items, onRemove, onClose, onGenerateAll,
}: {
  title: string;
  sub?: string;
  items: CalItem[];
  /** Real delete of a just-created draft. */
  onRemove: (id: string) => void;
  onClose: () => void;
  /** Accept the kept ideas and generate every one's script/post (sequential, in the parent). When
   *  absent, the sheet is keep-only. */
  onGenerateAll?: (ids: string[]) => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);
  const acceptAndGenerate = async () => {
    if (busy || !onGenerateAll) return;
    setBusy(true);
    try {
      await onGenerateAll(items.map((d) => d.id));
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={title} sub={sub} onClose={onClose} w={560}>
      {items.length === 0 ? (
        <Mono s={12} c={C.dim}>Nothing new was generated — the cadence may already be met in this window.</Mono>
      ) : (
        <>
          <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 10 }}>{items.length} placed · remove any you don&apos;t want</Mono>
          <div className="calos-ns" style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 360, overflowY: 'auto' }}>
            {items.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.surface, border: `1px solid ${C.border}`, borderLeft: `2px solid ${stageTick(d.stage)}`, borderRadius: 7, padding: '9px 11px' }}>
                <Glyph p={d.platform} />
                <Mono s={8.5} c={C.muted}>{dayTitle(d.date)}</Mono>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                <button type="button" className="calos-fr" onClick={() => onRemove(d.id)} title="Remove this draft" style={{ cursor: 'pointer', background: 'none', border: 'none', color: C.coral, fontSize: 13 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            {onGenerateAll ? (
              <>
                <Btn size="sm" onClick={onClose} disabled={busy}>Just keep</Btn>
                <Btn size="sm" variant="primary" onClick={acceptAndGenerate} disabled={busy}>
                  {busy ? `Generating ${items.length}…` : `✨ Accept & generate all ${items.length}`}
                </Btn>
              </>
            ) : (
              <Btn size="sm" variant="primary" onClick={onClose}>Done · keep {items.length}</Btn>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
