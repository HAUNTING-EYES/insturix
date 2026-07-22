'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Mono, Track, Clip } from '@/components/primitives';
import { Clapperboard, Copy, Upload, WandSparkles } from 'lucide-react';
import { AUTO_EDIT_STAGES, TOTAL_STAGES } from './auto-edit-stages';

/* ═══ Editron · auto-edit processing screen ══════════════════════════
   The edit assembling on screen. Presentation-only — driven by state
   (stageIndex/percent/done from useFootageAutoEdit). Continuous motion is
   CSS/compositor-driven (playhead sweep, pop-in, watermark word).

   The timeline here is a SCHEMATIC of the assembling edit keyed to the
   stage — the real clip data streams once the pipeline emits incremental
   overlays.  // TODO(backend): render streamed overlays instead of the
   schematic SEGS/DEADAIR/CAP_WORDS/MG below. */

// Schematic assembling data (illustrative until overlays stream — see note).
const SEGS = [{ l: 0, w: 17 }, { l: 18, w: 21 }, { l: 40, w: 15 }, { l: 56, w: 19 }, { l: 76, w: 24 }];
const DEADAIR = [{ l: 17, w: 6 }, { l: 46, w: 5 }, { l: 79, w: 4 }];
const CAP_WORDS = ['every', 'cut', 'shaped', 'for', 'its', 'channel', 'made', 'to', 'watch', 'silent', 'or', 'loud'];
const MARKERS = [{ f: 0, l: 'INTRO' }, { f: 40, l: 'CUT' }, { f: 76, l: 'OUTRO' }];

export interface MissingFootageBeat {
  id: string;
  scriptText: string;
  visualIntent: string;
  coverage: 'partial' | 'missing';
  notes: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export function missingFootageBeatsFromScriptCoverage(value: unknown): MissingFootageBeat[] {
  const audit = asRecord(value);
  if (!audit) return [];
  const beats = Array.isArray(audit.beats) ? audit.beats : [];
  const assignments = Array.isArray(audit.assignments) ? audit.assignments : [];
  const assignmentByBeat = new Map<string, Record<string, unknown>>();
  for (const candidate of assignments) {
    const assignment = asRecord(candidate);
    const beatId = boundedText(assignment?.beatId, 128);
    if (assignment && beatId) assignmentByBeat.set(beatId, assignment);
  }

  return beats.flatMap((candidate, index) => {
    const beat = asRecord(candidate);
    if (!beat) return [];
    const id = boundedText(beat.id, 128) || `beat_${index + 1}`;
    const assignment = assignmentByBeat.get(id);
    const rawCoverage = boundedText(assignment?.coverage, 16);
    if (rawCoverage === 'covered') return [];
    const verification = asRecord(assignment?.verification);
    const notes = Array.isArray(verification?.notes)
      ? verification.notes
        .map((note) => boundedText(note, 240))
        .filter(Boolean)
        .slice(0, 3)
      : [];
    return [{
      id,
      scriptText: boundedText(beat.scriptText, 500),
      visualIntent: boundedText(beat.visualIntent, 500),
      coverage: rawCoverage === 'partial' ? 'partial' as const : 'missing' as const,
      notes,
    }];
  });
}

export interface AutoEditProcessingProps {
  filename: string;
  stageIndex: number;
  percent: number;
  done: boolean;
  /** Editorial log lines (newest last). Empty until the pipeline emits them. */
  logLines: string[];
  onSkip?: () => void;
  onReplay?: () => void;
  onOpenEditor?: () => void;
  needsInput?: {
    beats: MissingFootageBeat[];
    error?: string | null;
    busy?: boolean;
    actionMessage?: string | null;
  };
  onUploadFootage?: () => void;
  onCopyFilmBrief?: (beat: MissingFootageBeat) => void;
  onCopyGenerationPrompt?: (beat: MissingFootageBeat) => void;
}

export function AutoEditProcessing({
  filename, stageIndex, percent, done, logLines, onSkip, onReplay, onOpenEditor,
  needsInput, onUploadFootage, onCopyFilmBrief, onCopyGenerationPrompt,
}: AutoEditProcessingProps) {
  if (needsInput) {
    return (
      <NeedsFootage
        filename={filename}
        state={needsInput}
        onUpload={onUploadFootage}
        onCopyFilmBrief={onCopyFilmBrief}
        onCopyGenerationPrompt={onCopyGenerationPrompt}
      />
    );
  }

  const idx = Math.max(0, Math.min(TOTAL_STAGES - 1, stageIndex));
  const stage = AUTO_EDIT_STAGES[idx];
  const word = done ? 'READY' : stage.word;
  const reached = (id: (typeof AUTO_EDIT_STAGES)[number]['id']) => done || idx >= AUTO_EDIT_STAGES.findIndex((s) => s.id === id);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-surface-canvas font-sans text-ds-primary">
      <style>{`
        @keyframes ae-recp{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes ae-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
        @keyframes ae-word{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        @keyframes ae-line{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes ae-ph{from{left:54px}to{left:calc(100% - 2px)}}
        @keyframes ae-breathe{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
        .ae-pop{animation:ae-pop .42s cubic-bezier(0.16,1,0.3,1) both}
        .ae-ph{animation:ae-ph 2.8s linear infinite}
        .ae-breathe{animation:ae-breathe 1.3s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.ae-ph,.ae-breathe{animation:none}}
      `}</style>

      {/* top progress hairline */}
      <div className="fixed inset-x-0 top-0 z-30 h-0.5">
        <div className={cn('h-full transition-[width] duration-100', done ? 'bg-status-success' : 'bg-gold')} style={{ width: `${percent}%` }} />
      </div>

      {/* header */}
      <div className="z-10 flex items-center justify-between px-[22px] py-4">
        <div className="flex items-center gap-3">
          <Mono size="11" className="font-bold tracking-[0.18em] text-gold">EDITRON</Mono>
          <span className="h-3.5 w-px bg-ds-subtle" />
          <span className="font-mono text-[12px] text-ds-secondary">{filename}</span>
        </div>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', done ? 'bg-status-success' : 'bg-status-danger')} style={done ? undefined : { animation: 'ae-recp 1.2s infinite' }} />
          <Mono size="9" className={done ? 'text-status-success' : 'text-status-danger'}>{done ? 'DONE' : 'ON AIR'}</Mono>
        </span>
      </div>

      {/* watermark depth layer */}
      <div key={word} className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
        <span className="whitespace-nowrap text-[min(27vw,290px)] font-extrabold tracking-[-0.045em] text-[#100F0E]" style={{ animation: 'ae-word .7s cubic-bezier(0.16,1,0.3,1) both' }}>{word}</span>
      </div>

      {/* body */}
      <div className="relative z-[5] flex flex-1 flex-col justify-center px-[clamp(22px,4vw,56px)] pb-10 pt-5">
        <div className="mx-auto w-full max-w-[1080px]">
          {/* hero row */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-7">
            <div>
              <Mono size="9" className="mb-1 block">{done ? 'COMPLETE' : stage.verb}</Mono>
              <div className="flex items-baseline gap-1.5">
                <span className={cn('font-mono text-[clamp(56px,12vw,150px)] font-extrabold leading-[0.85] tracking-[-0.05em] tabular-nums', done ? 'text-status-success' : 'text-gold')}>{percent}</span>
                <span className="text-[clamp(22px,4vw,46px)] font-extrabold text-ds-muted">%</span>
              </div>
            </div>
            <div className="max-w-[340px] text-right">
              <Mono size="8" className="mb-2.5 block text-ds-dim">STAGE {String(done ? TOTAL_STAGES : idx + 1).padStart(2, '0')} / {String(TOTAL_STAGES).padStart(2, '0')}</Mono>
              <div className="flex flex-col items-end gap-1.5">
                {logLines.map((l, i) => {
                  const last = i === logLines.length - 1;
                  return <div key={`${l}-${i}`} className={cn(last ? 'text-[14.5px] font-semibold text-ds-secondary' : 'text-[12.5px] text-ds-dim')} style={{ animation: 'ae-line .4s ease both' }}>{l}</div>;
                })}
              </div>
            </div>
          </div>

          {/* timeline hero */}
          <div className="rounded-card border border-ds-subtle bg-surface-raised p-3.5 shadow-[0_24px_70px_rgba(0,0,0,.4)]">
            <div className="mb-2.5 flex items-center gap-2.5">
              <Mono size="9">Assembling</Mono>
              <Mono size="8" className="text-ds-dim">{done ? TOTAL_STAGES : idx + 1} of {TOTAL_STAGES} passes</Mono>
              <span className="flex-1" />
              <Mono size="9" className={done ? 'text-status-success' : 'text-gold'}>{done ? '0:48' : '…'} / 1:02</Mono>
            </div>

            <div className="relative">
              {/* playhead — a live scan beam sweeping the timeline so the wait never reads as stuck */}
              <div className={cn('ae-ph pointer-events-none absolute inset-y-0 z-[6] w-[2px] bg-gold shadow-[0_0_14px_2px_rgba(212,166,82,0.5)]', done && 'opacity-35')}>
                {/* trailing light — a soft gold wash behind the head */}
                <span className="pointer-events-none absolute inset-y-0 right-full w-16 bg-gradient-to-l from-[rgba(212,166,82,0.16)] to-transparent" />
                {/* breathing head */}
                <span className="ae-breathe absolute -left-[3px] -top-px h-1.5 w-[7px] bg-gold" style={{ clipPath: 'polygon(0 0,100% 0,50% 100%)', filter: 'drop-shadow(0 0 5px rgba(212,166,82,0.85))' }} />
              </div>

              {/* ruler + markers */}
              <div className="relative flex h-5 border-b border-ds-subtle pl-[54px]">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className={cn('flex-1 pl-[5px]', i && 'border-l border-ds-subtle')}><Mono size="7" className="text-ds-dim">{i * 10}s</Mono></div>
                ))}
                {MARKERS.map((m) => (
                  <div key={m.l} className="pointer-events-none absolute inset-y-0 flex items-center gap-[3px]" style={{ left: `calc(54px + (100% - 54px) * ${m.f / 100})` }}>
                    <span className="h-0 w-0 border-x-[3px] border-t-4 border-x-transparent border-t-ds-faint" />
                    <Mono size="7" className="text-ds-faint">{m.l}</Mono>
                  </div>
                ))}
              </div>

              {/* VID */}
              <Track label="VID">
                {!reached('cut') ? (
                  <>
                    <Clip leftPct={0} widthPct={100} tone="gold" className="pl-1.5 opacity-90"><Mono size="7" className="text-ds-secondary">raw · unedited</Mono></Clip>
                    {DEADAIR.map((d, i) => <Clip key={i} leftPct={d.l} widthPct={d.w} tone="danger" className="border-status-danger/40 bg-[repeating-linear-gradient(45deg,rgba(212,106,92,.16),rgba(212,106,92,.16)_4px,transparent_4px,transparent_8px)]" />)}
                  </>
                ) : (
                  SEGS.map((sg, i) => (
                    <Clip key={i} leftPct={sg.l} widthPct={sg.w - 1} tone="default" className="ae-pop pl-1.5" style={{ animationDelay: `${i * 55}ms` }}>
                      <Mono size="7">Vd</Mono>
                      {reached('punch') && (i === 0 || i === 2) && <span className="ml-auto mr-1 h-1 w-1 rounded-full bg-gold" />}
                    </Clip>
                  ))
                )}
              </Track>

              {/* CC */}
              <Track label="CC">
                {reached('caption') ? (
                  <div className="flex h-full items-center gap-[3px]">
                    {CAP_WORDS.map((w, i) => <span key={i} className="ae-pop shrink-0 rounded-[3px] border border-ds-subtle bg-surface-deeper px-[5px] py-0.5 font-mono text-[7.5px] text-ds-secondary" style={{ animationDelay: `${i * 30}ms` }}>{w}</span>)}
                  </div>
                ) : <Idle />}
              </Track>

              {/* AUD */}
              <Track label="AUD">
                {reached('music') ? (
                  <Clip leftPct={0} widthPct={100} tone="green" className="ae-pop gap-[1.5px] px-1.5">
                    {Array.from({ length: 74 }).map((_, i) => <span key={i} className="w-[1.5px] shrink-0 rounded-[1px] bg-status-success/50" style={{ height: 2 + Math.abs(Math.sin(i * 0.5)) * 14 }} />)}
                  </Clip>
                ) : <Idle />}
              </Track>

              {/* MG */}
              <Track label="MG" last>
                {reached('graphics') ? (
                  <>
                    <Clip leftPct={6} widthPct={26} tone="gold" className="ae-pop pl-1.5"><Mono size="7" className="text-gold">Mg</Mono><Mono size="7" className="text-ds-secondary">lower third</Mono></Clip>
                    <Clip leftPct={58} widthPct={20} tone="gold" className="ae-pop pl-1.5" style={{ animationDelay: '110ms' }}><Mono size="7" className="text-gold">Mg · stat</Mono></Clip>
                  </>
                ) : <Idle />}
              </Track>
            </div>
          </div>

          {/* footer */}
          <div className="mt-[18px] flex items-center gap-4">
            <Mono size="8" className="text-ds-dim">{Math.round((percent / 100) * 62)}s of 62s read</Mono>
            <span className="flex-1" />
            {done ? (
              <>
                <button type="button" onClick={onReplay} className="rounded-button border border-ds-subtle bg-surface-deeper px-4 py-2.5 text-[12.5px] font-bold text-ds-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60">↻ Replay</button>
                <button type="button" onClick={onOpenEditor} className="rounded-button border border-gold bg-gold px-5 py-2.5 text-[12.5px] font-extrabold text-[#241B08] hover:bg-[#E0B86A] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60">Open in editor →</button>
              </>
            ) : (
              <button type="button" onClick={onSkip} className="rounded-button border border-ds-subtle bg-transparent px-4 py-2.5 text-[12.5px] font-bold text-ds-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60">Skip →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NeedsFootage({
  filename,
  state,
  onUpload,
  onCopyFilmBrief,
  onCopyGenerationPrompt,
}: {
  filename: string;
  state: NonNullable<AutoEditProcessingProps['needsInput']>;
  onUpload?: () => void;
  onCopyFilmBrief?: (beat: MissingFootageBeat) => void;
  onCopyGenerationPrompt?: (beat: MissingFootageBeat) => void;
}) {
  return (
    <main className="min-h-screen bg-surface-canvas px-[clamp(20px,5vw,72px)] py-8 font-sans text-ds-primary">
      <div className="mx-auto max-w-[1040px]">
        <header className="mb-8 flex items-center justify-between gap-4 border-b border-ds-subtle pb-5">
          <div>
            <Mono size="10" className="mb-2 block font-bold tracking-[0.18em] text-gold">EDITRON / FOOTAGE NEEDED</Mono>
            <h1 className="max-w-[760px] text-[clamp(30px,5vw,58px)] font-extrabold leading-[1.02]">The script asks for shots we cannot verify.</h1>
          </div>
          <Mono size="9" className="max-w-[220px] text-right text-ds-dim">{filename}</Mono>
        </header>

        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[700px] text-[15px] leading-6 text-ds-secondary">
            Upload footage that visibly covers these beats. Editron will analyze it and resume this same edit.
          </p>
          <button
            type="button"
            onClick={onUpload}
            disabled={state.busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-button border border-gold bg-gold px-5 py-2.5 text-[13px] font-extrabold text-[#241B08] hover:bg-[#E0B86A] disabled:cursor-wait disabled:opacity-55"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            {state.busy ? 'Uploading footage...' : 'Upload footage'}
          </button>
        </div>

        {state.error && <p role="alert" className="mb-5 border-l-2 border-status-danger pl-3 text-[13px] leading-5 text-status-danger">{state.error}</p>}
        {state.actionMessage && <p role="status" className="mb-5 border-l-2 border-gold pl-3 text-[13px] leading-5 text-ds-secondary">{state.actionMessage}</p>}

        {state.beats.length > 0 ? (
          <ol className="grid gap-3">
            {state.beats.map((beat, index) => (
              <li key={beat.id} className="rounded-card border border-ds-subtle bg-surface-raised p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Mono size="8" className="text-gold">MISSING BEAT {String(index + 1).padStart(2, '0')}</Mono>
                  <Mono size="8" className="text-ds-dim">{beat.coverage.toUpperCase()}</Mono>
                </div>
                {beat.scriptText && <p className="mb-3 text-[17px] font-semibold leading-6 text-ds-primary">{beat.scriptText}</p>}
                {beat.visualIntent && (
                  <div className="mb-4 border-l-2 border-ds-faint pl-3">
                    <Mono size="8" className="mb-1 block text-ds-dim">VISUAL EVIDENCE REQUIRED</Mono>
                    <p className="text-[14px] leading-5 text-ds-secondary">{beat.visualIntent}</p>
                  </div>
                )}
                {beat.notes.length > 0 && <p className="mb-4 text-[12px] leading-5 text-ds-muted">Checked: {beat.notes.join(' ')}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onCopyFilmBrief?.(beat)}
                    className="inline-flex min-h-9 items-center gap-2 rounded-button border border-ds-subtle bg-surface-deeper px-3 py-2 text-[12px] font-bold text-ds-secondary hover:border-ds-faint"
                  >
                    <Clapperboard aria-hidden="true" className="h-3.5 w-3.5" />
                    Copy film brief
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyGenerationPrompt?.(beat)}
                    className="inline-flex min-h-9 items-center gap-2 rounded-button border border-ds-subtle bg-surface-deeper px-3 py-2 text-[12px] font-bold text-ds-secondary hover:border-ds-faint"
                  >
                    <WandSparkles aria-hidden="true" className="h-3.5 w-3.5" />
                    Copy generation prompt
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-card border border-ds-subtle bg-surface-raised p-5 text-[14px] leading-6 text-ds-secondary">
            The grounding audit could not identify a specific beat. Upload the missing supporting footage, then resume the edit.
          </div>
        )}

        <footer className="mt-6 flex items-center gap-2 text-[11px] text-ds-dim">
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          Film and generation actions copy a precise brief; upload the resulting shot here to continue.
        </footer>
      </div>
    </main>
  );
}

function Idle() {
  return <div className="absolute inset-x-0.5 inset-y-1 rounded-[3px] border border-dashed border-ds-faint opacity-45" />;
}
