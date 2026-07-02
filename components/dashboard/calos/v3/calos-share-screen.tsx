'use client';

import React from 'react';
import { C, MONO, DOW, dateKey, sameDay, stageTick } from './calos-view-model';
import type { Placement } from './calos-view-model';
import { Mono, Glyph, Btn } from './calos-atoms';

/* ═══ CalOS v3 · share screen ═════════════════════════════════════════
   The founder's calos-v3.jsx read-only ShareScreen. An in-app preview of the
   client-facing calendar; "Copy link" mints the real read-only URL via
   /client-view (the same call the header Share button used). */

export function CalosShareScreen({
  brandName, monthLabel, cells, byDay, today, onBack, onCopyLink,
}: {
  brandName: string;
  monthLabel: string;
  cells: Array<Date | null>;
  byDay: Map<string, Placement[]>;
  today: Date;
  onBack: () => void;
  onCopyLink: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold }} />
          <Mono s={9} c={C.gold}>Shared · read only</Mono>
          <span style={{ fontSize: 13, color: C.soft }}>{brandName} · {monthLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" variant="primary" onClick={onCopyLink}>Copy link</Btn>
          <Btn size="sm" onClick={onBack}>◂ Back to editing</Btn>
        </div>
      </div>

      <div className="calos-ns" style={{ overflowX: 'auto' }}><div className="calos-min">
        <div className="calos-grid" style={{ marginBottom: 6 }}>{DOW.map((d) => <div key={d} style={{ padding: '0 4px 6px' }}><Mono s={9} c={C.dim}>{d}</Mono></div>)}</div>
        <div className="calos-grid" style={{ gap: 6 }}>
          {cells.map((cell, i) => {
            const evs = cell ? (byDay.get(dateKey(cell)) ?? []) : [];
            const isToday = cell ? sameDay(cell, today) : false;
            const wknd = i % 7 === 0 || i % 7 === 6;
            const inten = Math.min(0.16, evs.length * 0.05);
            return (
              <div key={i} style={{ minHeight: 110, borderRadius: 8, padding: 7, backgroundColor: !cell ? 'transparent' : wknd ? C.bg : C.raised, backgroundImage: evs.length ? `linear-gradient(0deg,rgba(212,166,82,${inten}),rgba(212,166,82,${inten}))` : 'none', border: `1px solid ${isToday ? C.gold : cell ? C.border : 'transparent'}`, opacity: cell ? 1 : 0.3, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cell && <span style={{ fontFamily: MONO, fontSize: 11, color: isToday ? C.gold : C.muted }}>{String(cell.getDate()).padStart(2, '0')}</span>}
                {evs.slice(0, 3).map((pl) => (
                  <div key={`${pl.item.id}-${pl.time}`} style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.surface, border: `1px solid ${C.border}`, borderLeft: `2px solid ${stageTick(pl.item.stage)}`, borderRadius: 4, padding: '4px 6px' }}>
                    <Glyph p={pl.item.platform} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.item.title}</span>
                  </div>
                ))}
                {evs.length > 3 && <Mono s={9} c={C.gold}>+{evs.length - 3} more</Mono>}
              </div>
            );
          })}
        </div>
      </div></div>
    </div>
  );
}
