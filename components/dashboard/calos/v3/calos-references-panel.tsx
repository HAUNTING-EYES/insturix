'use client';

import React, { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import type { CalosCampaignReference } from '@/schemas/calos-campaign';
import { C, MONO } from './calos-view-model';
import { Btn, Mono, inpS } from './calos-atoms';

/* ═══ CalOS v3 · references panel ═════════════════════════════════════
   Reusable add/list/remove UI for source-material references, driven by an
   endpoint pair so it works for BOTH brand-level references (no campaign
   needed) and campaign-level references. Paste a link, paste notes, or
   upload a PDF/doc/image; each POSTs and shows its ingest status. */

export function CalosReferencesPanel({
  addUrl, delUrl, initialRefs, hint,
}: {
  /** POST target (JSON link/text or multipart file). */
  addUrl: string;
  /** DELETE target for a given reference id. */
  delUrl: (refId: string) => string;
  initialRefs: CalosCampaignReference[];
  /** Optional one-line description shown above the controls. */
  hint?: string;
}) {
  const [refs, setRefs] = useState<CalosCampaignReference[]>(initialRefs);
  const [linkInput, setLinkInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (body: FormData | Record<string, unknown>, isForm: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(addUrl, {
        method: 'POST',
        ...(isForm
          ? { body: body as FormData }
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Failed (${res.status})`);
      setRefs((r) => [...r, data.reference as CalosCampaignReference]);
      toast(
        data?.reference?.status === 'failed'
          ? { title: 'Added, but not readable', description: data.reference.error, variant: 'destructive' }
          : { title: 'Reference added' },
      );
    } catch (err) {
      toast({ title: "Couldn't add reference", description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  const addLink = () => { const u = linkInput.trim(); if (!u) return; setLinkInput(''); void add({ type: 'link', url: u }, false); };
  const addNote = () => { const t = noteInput.trim(); if (!t) return; setNoteInput(''); void add({ type: 'text', text: t }, false); };
  const addFile = (file: File) => { const fd = new FormData(); fd.append('file', file); void add(fd, true); };
  const remove = async (refId: string) => {
    setRefs((r) => r.filter((x) => x.id !== refId)); // optimistic
    try { await fetch(delUrl(refId), { method: 'DELETE' }); } catch { /* list already reflects it */ }
  };

  return (
    <div>
      {hint && <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 10 }}>{hint}</Mono>}
      {refs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {refs.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7 }}>
              <Mono s={8} c={C.dim}>{r.type.toUpperCase()}</Mono>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <Mono s={8.5} c={r.status === 'ready' ? C.gold : r.status === 'failed' ? C.coral : C.muted}>{r.status === 'ready' ? '● ready' : r.status === 'failed' ? 'failed' : 'pending'}</Mono>
              <span onClick={() => remove(r.id)} title="Remove" style={{ color: C.coral, cursor: 'pointer', fontSize: 11 }}>✕</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} placeholder="Paste a link…" style={{ ...inpS, flex: 1 }} />
        <Btn size="sm" onClick={addLink} disabled={busy || !linkInput.trim()}>Add</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }} placeholder="Paste notes / a brief…" style={{ ...inpS, flex: 1, fontFamily: MONO }} />
        <Btn size="sm" onClick={addNote} disabled={busy || !noteInput.trim()}>Add</Btn>
      </div>
      <label className="calos-fr" style={{ display: 'inline-block', cursor: busy ? 'default' : 'pointer', padding: '8px 12px', background: 'transparent', border: `1px dashed ${C.bs}`, borderRadius: 7 }}>
        <Mono s={9} c={C.gold}>{busy ? 'Working…' : '+ Upload PDF / doc / image'}</Mono>
        <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,image/*" style={{ display: 'none' }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ''; }} />
      </label>
    </div>
  );
}
