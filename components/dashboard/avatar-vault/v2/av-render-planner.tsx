'use client';
import { Select } from '@/components/primitives';

import React, { useMemo, useState } from 'react';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import type { AvatarPipelineStageSnapshot } from '@/lib/avatar/avatar-pipeline-job';
import { useAvatarPipelineJobMutation, useAvatarPipelineJob } from '@/components/dashboard/AvatarVault/useAvatarVault';
import { VoiceRecorder } from '@/components/dashboard/AvatarVault/VoiceRecorder';
import { C } from './av-tokens';
import { Mono, Btn, Field, inp, Portrait, Toggle, Seg } from './av-atoms';
import {
  AUDIO_MODE_OPTIONS, MODALITY_OPTIONS, buildPlanInput, initialPlannerState, isProductUseCase, isSpeechUseCase,
  speechInputProblem, useCaseOptionsForRecord as renderUseCaseOptions, type PlannerState,
} from './av-planner-logic';
import {
  thinkForgeGenerateHref, extractScriptList, extractScriptContent, scriptGetUrl,
  type ThinkForgeScriptListItem,
} from './av-thinkforge-import';

/* ═══ Avatar Vault v2 · render planner ════════════════════════════════
   Wired to the PROVEN pipeline: /pipeline-jobs → Chatterbox voice clone →
   avatar face video → Remotion composite. One "Generate" button;
   live-polls the three real stages and surfaces the final video. */

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

function stageTone(status: AvatarPipelineStageSnapshot['status']): { color: string; spin: boolean } {
  if (status === 'succeeded') return { color: C.green, spin: false };
  if (status === 'failed') return { color: C.coral, spin: false };
  if (status === 'running') return { color: C.gold, spin: true };
  return { color: C.faint, spin: false };
}

function StageRow({ stage }: { stage: AvatarPipelineStageSnapshot }) {
  const tone = stageTone(stage.status);
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.border}` }}>
      <span
        className={tone.spin ? 'av-spin' : undefined}
        style={{ marginTop: 3, flexShrink: 0, width: 10, height: 10, borderRadius: tone.spin ? '50%' : 2, border: tone.spin ? `1.5px solid ${C.gold}` : 'none', borderTopColor: tone.spin ? 'transparent' : undefined, background: tone.spin ? 'transparent' : tone.color }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{stage.label}</span>
          <Mono s={8} c={tone.color} st={{ textTransform: 'capitalize' }}>{stage.status}</Mono>
        </div>
        {stage.statusReason && <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{stage.statusReason}</div>}
      </div>
    </div>
  );
}

/* Script entry points: write it in ThinkForge (routes there), or import an existing
   ThinkForge script into the planner. Reuses ThinkForge's own list-all/get endpoints. */
function ScriptSource({ avatarId, onImport }: { avatarId: string; onImport: (script: string) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<ThinkForgeScriptListItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const openPicker = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true); setErr(null); setLoading(true);
    try {
      const res = await fetch('/api/services/thinkforge/script/list-all?limit=50');
      setScripts(extractScriptList(await res.json().catch(() => null)));
    } catch { setErr('Could not load your ThinkForge scripts.'); }
    finally { setLoading(false); }
  };

  const pick = async (item: ThinkForgeScriptListItem) => {
    setErr(null); setLoading(true);
    try {
      const res = await fetch(scriptGetUrl(item));
      const content = extractScriptContent(await res.json().catch(() => null));
      if (!content) { setErr('That script has no text yet.'); return; }
      onImport(content); setOpen(false);
    } catch { setErr('Could not load that script.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn size="sm" variant="ghost" onClick={() => { window.location.href = thinkForgeGenerateHref(avatarId); }}>✨ Generate with AI</Btn>
        <Btn size="sm" variant="ghost" onClick={openPicker}>{open ? 'Close' : 'Import from ThinkForge'}</Btn>
      </div>
      {open && (
        <div style={{ marginTop: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, maxHeight: 200, overflowY: 'auto' }}>
          {loading && <Mono s={9} c={C.muted}>Loading…</Mono>}
          {err && <Mono s={9} c={C.coral}>{err}</Mono>}
          {!loading && !err && scripts.length === 0 && <Mono s={9} c={C.muted}>No ThinkForge scripts yet — use “Generate with AI”.</Mono>}
          {!loading && scripts.map((sc) => (
            <button
              key={`${sc.sessionId}:${sc.scriptId}`}
              className="av-fr"
              onClick={() => pick(sc)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, padding: '8px 4px', cursor: 'pointer', color: C.text, fontSize: 12.5, fontWeight: 700 }}
            >
              {sc.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AvatarRenderPlanner({ record }: { record: AvatarProfileRecord }) {
  const generate = useAvatarPipelineJobMutation();
  const [jobId, setJobId] = useState<string | null>(null);
  const jobQuery = useAvatarPipelineJob(jobId);
  const [s, setS] = useState<PlannerState>(() => initialPlannerState(record));
  const [clientError, setClientError] = useState<string | null>(null);

  const set = <K extends keyof PlannerState>(k: K, v: PlannerState[K]) => { setS((cur) => ({ ...cur, [k]: v })); setClientError(null); };
  const useCaseOpts = useMemo(() => renderUseCaseOptions(record).map((o) => [o.id, o.label] as [PlannerState['useCase'], string]), [record]);
  // Full body (lane B) is capped at the 10s relip budget; talking head can run longer.
  const secondsBase = s.renderModality === 'body_motion' ? ['5', '10'] : ['8', '15', '30'];
  const secondsChoices = secondsBase.includes(s.durationSeconds) ? secondsBase : [s.durationSeconds, ...secondsBase];

  const job = jobQuery.data ?? generate.data?.job;
  const composition = job?.stages.find((st) => st.id === 'composition_remotion');
  const face = job?.stages.find((st) => st.id === 'face_omnihuman_fal');
  const finalUrl = str(composition?.output?.videoUrl);
  const rawUrl = str(face?.output?.videoUrl);
  const inFlight = generate.isPending || job?.status === 'queued' || job?.status === 'running';

  const errorMessage = clientError
    ?? (generate.error instanceof Error ? generate.error.message : null)
    ?? (jobQuery.error instanceof Error ? jobQuery.error.message : null);

  const doGenerate = () => {
    if (!s.prompt.trim()) { setClientError('Scene prompt is required.'); return; }
    const speech = speechInputProblem(record, s);
    if (speech) { setClientError(speech); return; }
    setClientError(null);
    generate.mutate(buildPlanInput(record.id, s, s.prompt.trim()), {
      onSuccess: (data) => setJobId(data.job.id),
    });
  };

  const showAudioUrl = s.audioMode === 'uploaded_voiceover' || s.audioMode === 'copied_reference_audio' || s.audioMode === 'external_mix';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <Portrait name={record.profile.displayName} size={52} url={record.profile.portrait?.imageUrl} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>{record.profile.displayName}</div>
          <Mono s={9} c={C.muted}>{record.profile.persona?.defaultRole || 'avatar'} · render</Mono>
        </div>
      </div>

      <div className="av-rendergrid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* use case + prompt */}
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 10 }}>Use case</Mono>
            <Seg opts={useCaseOpts} val={s.useCase} on={(v) => { set('useCase', v); if (!isSpeechUseCase(v)) set('renderModality', 'talking_head'); }} />
            {isSpeechUseCase(s.useCase) && (
              <div style={{ marginTop: 16 }}>
                <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 10 }}>Motion</Mono>
                <Seg opts={MODALITY_OPTIONS} val={s.renderModality} on={(v) => { set('renderModality', v); if (v === 'body_motion' && Number(s.durationSeconds) > 10) set('durationSeconds', '10'); }} />
                {s.renderModality === 'body_motion' && (
                  <Mono s={8} c={C.muted} st={{ display: 'block', marginTop: 8 }}>Full-body shots are capped at 10s per shot — keep the script short, or use talking head for longer takes.</Mono>
                )}
              </div>
            )}
            <div style={{ marginTop: 16 }}><Field label="Scene prompt" hint="required"><textarea value={s.prompt} onChange={(e) => set('prompt', e.target.value)} rows={2} placeholder="Describe the scene, framing, mood…" style={{ ...inp, resize: 'vertical' }} /></Field></div>
            <div style={{ marginTop: 14 }}><Field label="Negative prompt" hint="optional"><input value={s.negativePrompt} onChange={(e) => set('negativePrompt', e.target.value)} placeholder="What to avoid…" style={inp} /></Field></div>
            {isSpeechUseCase(s.useCase) && (
              <div style={{ marginTop: 14 }}>
                <ScriptSource avatarId={record.id} onImport={(script) => set('script', script)} />
                <Field label="Script" hint="what they say"><textarea value={s.script} onChange={(e) => set('script', e.target.value)} rows={3} placeholder="Type what the avatar should say…" style={{ ...inp, resize: 'vertical' }} /></Field>
              </div>
            )}
            {isProductUseCase(s.useCase) && <div style={{ marginTop: 14 }}><Field label="Product image URLs" hint="one per line"><textarea value={s.productImageUrls} onChange={(e) => set('productImageUrls', e.target.value)} rows={2} placeholder="https://…" style={{ ...inp, resize: 'vertical' }} /></Field></div>}
          </div>

          {/* audio / voice */}
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}><Mono s={9} c={C.muted}>Audio</Mono><Seg opts={AUDIO_MODE_OPTIONS} val={s.audioMode} on={(v) => set('audioMode', v)} /></div>
            {showAudioUrl && <div style={{ marginBottom: 12 }}><Field label="Audio URL"><input value={s.audioSourceUrl} onChange={(e) => set('audioSourceUrl', e.target.value)} placeholder="https://" style={inp} /></Field></div>}
            <Field label="Voice to clone" hint="record or paste — we clone it, then speak your script">
              <VoiceRecorder subjectName={record.profile.displayName} onUploaded={(url) => { set('voiceReferenceUrl', url); set('audioMode', 'tts_voiceover'); }} />
              <input value={s.voiceReferenceUrl} onChange={(e) => set('voiceReferenceUrl', e.target.value)} placeholder="…or paste a voice-sample URL" style={{ ...inp, marginTop: 8 }} />
            </Field>
            {s.audioMode === 'copied_reference_audio' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', background: C.bg, border: `1px solid ${s.audioRightsConfirmed ? 'rgba(212,166,82,.4)' : C.border}`, borderRadius: 8, marginTop: 12 }}>
                <div><div style={{ fontSize: 13, fontWeight: 700 }}>I have rights to this audio</div><Mono s={8.5} c={C.muted}>Required to copy reference audio</Mono></div>
                <Toggle on={s.audioRightsConfirmed} onClick={() => set('audioRightsConfirmed', !s.audioRightsConfirmed)} />
              </div>
            )}
          </div>
        </div>

        {/* target + generate + live pipeline */}
        <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 12 }}>Target</Mono>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Aspect"><Seg opts={[['9:16', '9:16'], ['16:9', '16:9'], ['1:1', '1:1'], ['4:5', '4:5']]} val={s.aspectRatio} on={(v) => set('aspectRatio', v)} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Resolution"><Select aria-label="Resolution" value={s.resolution} onChange={(v) => set('resolution', v)} options={[{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }]} /></Field>
                <Field label="Seconds"><Select aria-label="Seconds" value={s.durationSeconds} onChange={(v) => set('durationSeconds', v)} options={secondsChoices.map((sec) => ({ value: sec, label: sec }))} /></Field>
              </div>
            </div>
          </div>

          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <Btn variant="primary" onClick={doGenerate} disabled={!s.prompt.trim() || inFlight} style={{ width: '100%', justifyContent: 'center' }}>
              {generate.isPending ? 'Starting…' : inFlight ? 'Generating…' : job ? 'Generate again' : 'Generate video'}
            </Btn>

            {errorMessage && <div style={{ marginTop: 12, padding: '9px 11px', background: C.bg, border: `1px solid rgba(212,106,92,.4)`, borderRadius: 8, fontSize: 12, color: C.coral }}>{errorMessage}</div>}

            {job && (
              <div style={{ marginTop: 14, paddingTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Mono s={9} c={job.status === 'failed' ? C.coral : job.status === 'succeeded' ? C.green : C.gold} st={{ textTransform: 'capitalize' }}>{job.status === 'blocked' ? 'Waiting' : job.status}</Mono>
                  {job.statusReason && <Mono s={8} c={C.dim}>· {job.recipe?.audio.mode ?? ''}</Mono>}
                </div>
                {job.stages.map((st) => <StageRow key={st.id} stage={st} />)}

                {finalUrl ? (
                  <a href={finalUrl} target="_blank" rel="noreferrer" className="av-fr" style={{ display: 'block', marginTop: 12, textAlign: 'center', padding: '10px', background: 'rgba(94,201,126,.1)', border: `1px solid rgba(94,201,126,.4)`, borderRadius: 8 }}>
                    <Mono s={10} c={C.green}>▸ View final video</Mono>
                  </a>
                ) : rawUrl ? (
                  <a href={rawUrl} target="_blank" rel="noreferrer" className="av-fr" style={{ display: 'block', marginTop: 12, textAlign: 'center', padding: '9px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <Mono s={9} c={C.soft}>▸ Raw avatar clip (final composite pending)</Mono>
                  </a>
                ) : null}

                <Mono s={8} c={C.faint} st={{ display: 'block', marginTop: 10, wordBreak: 'break-all' }}>{job.id}</Mono>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
