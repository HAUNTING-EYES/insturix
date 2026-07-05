'use client';

import React, { useMemo, useState } from 'react';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import type { AvatarProviderId } from '@/lib/avatar/avatar-provider-adapter';
import { useAvatarRenderPlanMutation, useAvatarRenderJobMutation } from '@/components/dashboard/AvatarVault/useAvatarVault';
import { C, PROVIDER_META } from './av-tokens';
import { Mono, Btn, Field, inp, Portrait, Toggle, Seg } from './av-atoms';
import {
  AUDIO_MODE_OPTIONS, buildPlanInput, initialPlannerState, isProductUseCase, isSpeechUseCase,
  providerResultTitle, providerWarnings, speechInputProblem, useCaseOptionsForRecord as renderUseCaseOptions, visibleProviderIssues,
  type PlannerState,
} from './av-planner-logic';

const PROVIDER_IDS: AvatarProviderId[] = ['d_id', 'a2e', 'omnihuman_fal', 'minimax_s2v_fal'];

export function AvatarRenderPlanner({ record }: { record: AvatarProfileRecord }) {
  const planRender = useAvatarRenderPlanMutation();
  const createRenderJob = useAvatarRenderJobMutation();
  const [s, setS] = useState<PlannerState>(() => initialPlannerState(record));
  const [clientError, setClientError] = useState<string | null>(null);

  const set = <K extends keyof PlannerState>(k: K, v: PlannerState[K]) => { setS((cur) => ({ ...cur, [k]: v })); setClientError(null); };
  const useCaseOpts = useMemo(() => renderUseCaseOptions(record).map((o) => [o.id, o.label] as [PlannerState['useCase'], string]), [record]);

  const togglePick = (id: AvatarProviderId) =>
    setS((cur) => ({ ...cur, picked: cur.providerMode === 'single' ? [id] : cur.picked.includes(id) ? cur.picked.filter((x) => x !== id) : [...cur.picked, id] }));

  const validated = () => {
    if (!s.prompt.trim()) { setClientError('Scene prompt is required.'); return null; }
    const speech = speechInputProblem(record, s);
    if (speech) { setClientError(speech); return null; }
    return buildPlanInput(record.id, s, s.prompt.trim());
  };
  const doPlan = () => { const input = validated(); if (input) { setClientError(null); planRender.mutate(input); } };
  const doRender = () => { const input = validated(); if (input) { setClientError(null); createRenderJob.mutate(input); } };

  const recipe = planRender.data?.recipe;
  const plan = planRender.data?.providerPlan;
  const job = createRenderJob.data?.job;
  const errorMessage = clientError
    ?? (planRender.error instanceof Error ? planRender.error.message : null)
    ?? (createRenderJob.error instanceof Error ? createRenderJob.error.message : null);
  const hasSelection = Boolean(plan?.selectedProviderIds.length);
  const recipeIssues = recipe ? [...recipe.readiness.errors, ...recipe.readiness.warnings] : [];
  const provIssues = plan && recipe ? visibleProviderIssues(plan, recipe.readiness.errors.length > 0) : [];
  const provWarnings = providerWarnings(plan, recipe?.readiness.errors.length ?? 0);

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
            <Seg opts={useCaseOpts} val={s.useCase} on={(v) => set('useCase', v)} />
            <div style={{ marginTop: 16 }}><Field label="Scene prompt" hint="required"><textarea value={s.prompt} onChange={(e) => set('prompt', e.target.value)} rows={2} placeholder="Describe the scene, framing, mood…" style={{ ...inp, resize: 'vertical' }} /></Field></div>
            <div style={{ marginTop: 14 }}><Field label="Negative prompt" hint="optional"><input value={s.negativePrompt} onChange={(e) => set('negativePrompt', e.target.value)} placeholder="What to avoid…" style={inp} /></Field></div>
            {isSpeechUseCase(s.useCase) && <div style={{ marginTop: 14 }}><Field label="Script"><textarea value={s.script} onChange={(e) => set('script', e.target.value)} rows={3} placeholder="What they say…" style={{ ...inp, resize: 'vertical' }} /></Field></div>}
            {isProductUseCase(s.useCase) && <div style={{ marginTop: 14 }}><Field label="Product image URLs" hint="one per line"><textarea value={s.productImageUrls} onChange={(e) => set('productImageUrls', e.target.value)} rows={2} placeholder="https://…" style={{ ...inp, resize: 'vertical' }} /></Field></div>}
          </div>

          {/* audio */}
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}><Mono s={9} c={C.muted}>Audio</Mono><Seg opts={AUDIO_MODE_OPTIONS} val={s.audioMode} on={(v) => set('audioMode', v)} /></div>
            {showAudioUrl && <div style={{ marginBottom: 12 }}><Field label="Audio URL"><input value={s.audioSourceUrl} onChange={(e) => set('audioSourceUrl', e.target.value)} placeholder="https://" style={inp} /></Field></div>}
            <Field label="Voice to clone" hint="optional"><input value={s.voiceReferenceUrl} onChange={(e) => set('voiceReferenceUrl', e.target.value)} placeholder="Paste a voice-sample URL to clone…" style={inp} /></Field>
            {s.audioMode === 'tts_voiceover' && <Mono s={9} c={C.dim} st={{ display: 'block', marginTop: 10 }}>Uses the avatar&apos;s voice profile.</Mono>}
            {s.audioMode === 'copied_reference_audio' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', background: C.bg, border: `1px solid ${s.audioRightsConfirmed ? 'rgba(212,166,82,.4)' : C.border}`, borderRadius: 8, marginTop: 12 }}>
                <div><div style={{ fontSize: 13, fontWeight: 700 }}>I have rights to this audio</div><Mono s={8.5} c={C.muted}>Required to copy reference audio</Mono></div>
                <Toggle on={s.audioRightsConfirmed} onClick={() => set('audioRightsConfirmed', !s.audioRightsConfirmed)} />
              </div>
            )}
          </div>

          {/* provider */}
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <Mono s={9} c={C.muted}>Provider</Mono>
              <Seg opts={[['single', 'Single'], ['benchmark', 'Benchmark (A/B)']]} val={s.providerMode} on={(m) => setS((cur) => ({ ...cur, providerMode: m, picked: m === 'single' ? cur.picked.slice(0, 1) : cur.picked }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              {PROVIDER_IDS.map((id) => { const meta = PROVIDER_META[id]; const on = s.picked.includes(id); return (
                <button key={id} type="button" className="av-fr" onClick={() => togglePick(id)} style={{ cursor: 'pointer', textAlign: 'left', padding: 13, borderRadius: 9, background: on ? 'rgba(212,166,82,.08)' : C.surface, border: `1px solid ${on ? C.gold : C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? C.gold : C.faint }} /><Mono s={7.5} c={on ? C.gold : C.dim}>{meta.tag}</Mono></div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{meta.name}</div><Mono s={8.5} c={C.muted} st={{ display: 'block', marginTop: 3 }}>{meta.note}</Mono>
                </button>
              ); })}
            </div>
            {s.providerMode === 'benchmark' && <Mono s={8.5} c={C.dim} st={{ display: 'block', marginTop: 10 }}>A/B — renders on every selected provider to compare.</Mono>}
          </div>
        </div>

        {/* target + plan */}
        <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 12 }}>Target</Mono>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Aspect"><Seg opts={[['9:16', '9:16'], ['16:9', '16:9'], ['1:1', '1:1'], ['4:5', '4:5']]} val={s.aspectRatio} on={(v) => set('aspectRatio', v)} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Resolution"><select value={s.resolution} onChange={(e) => set('resolution', e.target.value)} style={inp}><option value="720p">720p</option><option value="1080p">1080p</option></select></Field>
                <Field label="Seconds"><input inputMode="decimal" value={s.durationSeconds} onChange={(e) => set('durationSeconds', e.target.value)} style={inp} /></Field>
              </div>
            </div>
          </div>

          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <Btn variant="primary" onClick={doPlan} disabled={!s.prompt.trim() || planRender.isPending} style={{ width: '100%', justifyContent: 'center' }}>{planRender.isPending ? 'Planning…' : 'Plan render'}</Btn>

            {errorMessage && <div style={{ marginTop: 12, padding: '9px 11px', background: C.bg, border: `1px solid rgba(212,106,92,.4)`, borderRadius: 8, fontSize: 12, color: C.coral }}>{errorMessage}</div>}

            {plan && recipe && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: hasSelection ? C.gold : C.coral }} />
                  <Mono s={9} c={hasSelection ? C.gold : C.coral}>{hasSelection ? 'Recipe ready' : providerResultTitle(plan, recipe.readiness.errors)}</Mono>
                </div>
                <Mono s={8} c={C.dim} st={{ display: 'block', marginBottom: 8 }}>{recipe.useCase} · {recipe.audio.mode} · {recipe.target.aspectRatio} · {recipe.target.durationSeconds ?? '—'}s · {recipe.target.resolution}</Mono>

                {plan.selectedProviderIds.map((id) => {
                  const w = plan.readinessByProvider[id]?.warnings ?? [];
                  return <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.border}` }}><Mono s={9} c={C.soft}>{PROVIDER_META[id]?.name ?? id}</Mono>{w.length ? <Mono s={8} c={C.coral}>{w[0].message}</Mono> : <Mono s={8} c={C.green}>ready</Mono>}</div>;
                })}

                {(recipeIssues.length > 0 || provIssues.length > 0 || provWarnings.length > 0) && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {recipeIssues.map((i) => <Mono key={`${i.path}-${i.code}`} s={8.5} c={i.severity === 'error' ? C.coral : C.gold}>{i.message}</Mono>)}
                    {[...provIssues, ...provWarnings].map((i) => <Mono key={`${i.providerId}-${i.path}-${i.code}`} s={8.5} c={i.severity === 'error' ? C.coral : C.gold}>{PROVIDER_META[i.providerId]?.name ?? i.providerId}: {i.message}</Mono>)}
                  </div>
                )}

                {hasSelection && (
                  <Btn variant="primary" onClick={doRender} disabled={createRenderJob.isPending} style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>{createRenderJob.isPending ? 'Starting…' : `Render${s.providerMode === 'benchmark' ? ` · ${s.picked.length} providers` : ''} →`}</Btn>
                )}

                {job && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: C.bg, border: `1px solid ${job.status === 'failed' ? 'rgba(212,106,92,.4)' : job.status === 'blocked' ? 'rgba(212,166,82,.4)' : C.border}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: job.status === 'failed' ? C.coral : C.soft }}>Render job · {job.status}</div>
                    <Mono s={8} c={C.dim} st={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>{PROVIDER_META[job.providerId]?.name ?? job.providerId} · {job.id}</Mono>
                    {job.statusReason && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{job.statusReason}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
