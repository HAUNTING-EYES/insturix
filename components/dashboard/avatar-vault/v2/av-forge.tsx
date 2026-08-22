'use client';
import { Select } from '@/components/primitives';

import React, { useEffect, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import type { AvatarReferenceRole, AvatarLikenessOwner, AvatarVoiceSourceType } from '@/lib/avatar/avatar-profile';
import {
  DEFAULT_AVATAR_DRAFT_FORM,
  buildAvatarProfileDraftRequest,
  hasRequiredAvatarDraftFields,
  toggleUsagePreset,
  type AvatarVaultDraftFormState,
} from '@/components/dashboard/AvatarVault/avatar-vault-form';
import { useAvatarVaultMutations } from '@/components/dashboard/AvatarVault/useAvatarVault';
import { VoiceRecorder } from '@/components/dashboard/AvatarVault/VoiceRecorder';
import { C, MONO, USAGE_PRESETS } from './av-tokens';
import { Mono, Btn, Field, inp, Portrait, Toggle, Seg, Drop } from './av-atoms';
import { recordToForm } from './av-record-map';

/* ═══ Avatar Vault v2 · forge (screen 2) ══════════════════════════════
   The founder's 6-pack forge, wired to AvatarVaultDraftFormState +
   buildAvatarProfileDraftRequest. Real image uploads (portrait/fullBody/
   side/expression) via uploadReference; Save creates a DRAFT (consent-gated,
   per spec) — accept/reject happen on the draft in the vault. */

const STEPS = [
  { id: 'identity', n: '01', label: 'Identity', hint: 'Face, body & likeness', title: 'Who is this person?' },
  { id: 'style', n: '02', label: 'Style', hint: 'Wardrobe & looks', title: 'How do they dress?' },
  { id: 'performance', n: '03', label: 'Performance', hint: 'Gesture, pose, camera', title: 'How do they move?' },
  { id: 'voice', n: '04', label: 'Voice', hint: 'How they sound', title: 'How do they sound?' },
  { id: 'persona', n: '05', label: 'Persona', hint: 'Role & tone', title: 'Who do they play?' },
  { id: 'rights', n: '06', label: 'Rights & brand', hint: 'Consent & binding', title: 'Rights & brand' },
] as const;

const OWNERS: Array<[AvatarLikenessOwner, string]> = [['self', 'Self'], ['client', 'Client'], ['licensed', 'Licensed'], ['unknown', 'Unknown']];
const VOICE_MODES: Array<[AvatarVoiceSourceType, string]> = [
  ['uploaded_voice_sample', 'Uploaded sample'],
  ['selected_tts_voice', 'TTS voice'],
  ['imported_voice_profile', 'Voice profile'],
];

interface BrandOption { brandId: string; name: string }

export function AvatarForge({ record, onDone }: { record: AvatarProfileRecord | null; onDone: () => void }) {
  const [f, setF] = useState<AvatarVaultDraftFormState>(() => (record ? recordToForm(record) : DEFAULT_AVATAR_DRAFT_FORM));
  const [step, setStep] = useState(0);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const { uploadReference, createDraft } = useAvatarVaultMutations();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingRole = useRef<AvatarReferenceRole | null>(null);

  const set = <K extends keyof AvatarVaultDraftFormState>(k: K, v: AvatarVaultDraftFormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  // Infer appearance from the uploaded photos instead of interrogating the user. Runs once
  // the portrait is in, fills ONLY empty fields (never overwrites what you typed), and
  // surfaces a photo-quality check. Fail-soft — a dead vision call just leaves fields blank.
  const [inferState, setInferState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [detected, setDetected] = useState<string[]>([]);
  const [photoIssues, setPhotoIssues] = useState<string[]>([]);

  useEffect(() => {
    if (inferState !== 'idle' || !f.portraitImageUrl) return;
    const imageUrls = [f.portraitImageUrl, f.fullBodyImageUrl, f.sideProfileImageUrl].filter(Boolean);
    setInferState('running');
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/avatar-vault/infer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrls }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!data?.ok) { setInferState('failed'); return; }
        const patch = data.patch ?? {};
        const quality = data.attributes?.quality;
        const det: string[] = [];
        setF((cur) => {
          const next = { ...cur };
          if (!next.hair.trim() && patch.bodyProfile?.hair) { next.hair = patch.bodyProfile.hair; det.push('hair'); }
          if (!next.notableTraits.trim() && patch.bodyProfile?.notableTraits?.length) {
            next.notableTraits = patch.bodyProfile.notableTraits.join(', '); det.push('traits');
          }
          if (!next.bodyDescription.trim() && (patch.identityDescription || patch.bodyProfile?.build)) {
            next.bodyDescription = [patch.identityDescription, patch.bodyProfile?.build && `build: ${patch.bodyProfile.build}`, patch.bodyProfile?.skinTone && `skin: ${patch.bodyProfile.skinTone}`].filter(Boolean).join('. ');
            det.push('body');
          }
          if (!next.portraitDescription.trim() && patch.identityDescription) { next.portraitDescription = patch.identityDescription; det.push('face'); }
          if (!next.defaultLook.trim() && patch.defaultLook) { next.defaultLook = patch.defaultLook; det.push('look'); }
          return next;
        });
        setDetected(det);
        setPhotoIssues(quality && (!quality.usable || (quality.issues?.length ?? 0) > 0)
          ? (quality.issues?.length ? quality.issues : ['These photos may not be a clear solo portrait.'])
          : []);
        setInferState('done');
      } catch {
        if (!cancelled) setInferState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [f.portraitImageUrl, f.fullBodyImageUrl, f.sideProfileImageUrl, inferState]);

  // Brand list for binding (multi-brand is core) — same source the rest of the app uses.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/services/editron/brands', { cache: 'no-store' });
        const data = await res.json();
        if (active && Array.isArray(data?.brands)) {
          setBrands(data.brands.map((b: { brandId: string; name: string }) => ({ brandId: b.brandId, name: b.name })));
        }
      } catch { /* brand list is best-effort; a bound brandId still saves */ }
    })();
    return () => { active = false; };
  }, []);

  const pickFile = (role: AvatarReferenceRole) => {
    pendingRole.current = role;
    fileRef.current?.click();
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const role = pendingRole.current;
    e.target.value = '';
    if (!file || !role) return;
    uploadReference.mutate(
      { file, role },
      {
        onSuccess: ({ asset }) => {
          if (role === 'face_front') setF((s) => ({ ...s, portraitAssetId: asset.assetId, portraitImageUrl: asset.imageUrl }));
          else if (role === 'full_body_front') setF((s) => ({ ...s, fullBodyAssetId: asset.assetId, fullBodyImageUrl: asset.imageUrl }));
          else if (role === 'face_side') setF((s) => ({ ...s, sideProfileImageUrl: asset.imageUrl }));
          else if (role === 'expression') setF((s) => ({ ...s, expressionReferenceUrls: [...s.expressionReferenceUrls.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), asset.imageUrl].join('\n') }));
        },
        onError: (err) => toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' }),
      },
    );
  };
  const uploadingRole = uploadReference.isPending ? pendingRole.current : null;

  const expressions = f.expressionReferenceUrls.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const done: Record<string, boolean> = {
    identity: Boolean(f.portraitImageUrl && f.displayName.trim()),
    style: f.usagePresets.length > 0,
    performance: Boolean(f.gestureStyle.trim()),
    voice: f.voiceMode === 'selected_tts_voice' ? Boolean(f.ttsVoiceId.trim()) : f.voiceMode === 'imported_voice_profile' ? Boolean(f.voiceProfileId.trim()) : Boolean(f.voiceSampleAssetId.trim() || f.voiceSampleUrl.trim()),
    persona: Boolean(f.defaultRole.trim()),
    rights: f.consentConfirmed,
  };
  const pct = Math.round((Object.values(done).filter(Boolean).length / STEPS.length) * 100);

  const canSave = hasRequiredAvatarDraftFields(f) && f.consentConfirmed;
  const save = () => {
    if (!canSave) return;
    const request = buildAvatarProfileDraftRequest(f, record ? { recordId: record.id, avatarId: record.profile.avatarId } : {});
    createDraft.mutate(request, {
      onSuccess: () => { toast({ title: record ? 'Draft updated' : 'Saved to vault', description: 'Review it in the vault to accept.' }); onDone(); },
      onError: (err) => toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' }),
    });
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <div className="av-forge">
        {/* step rail */}
        <div className="av-forge-rail" style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, position: 'sticky', top: 20 }}>
          {STEPS.map((s, i) => {
            const cur = i === step; const ok = done[s.id];
            return (
              <button key={s.id} className="av-fr" onClick={() => setStep(i)} style={{ cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 8, background: cur ? 'rgba(212,166,82,.08)' : 'transparent', border: `1px solid ${cur ? 'rgba(212,166,82,.35)' : 'transparent'}`, marginBottom: 2 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ok ? C.gold : C.well, border: `1px solid ${ok ? C.gold : C.border}`, fontFamily: MONO, fontSize: 9, fontWeight: 700, color: ok ? '#241B08' : cur ? C.gold : C.dim }}>{ok ? '✓' : s.n}</span>
                <div><div style={{ fontSize: 13, fontWeight: 700, color: cur ? C.text : C.soft }}>{s.label}</div><Mono s={8} c={C.dim}>{s.hint}</Mono></div>
              </button>
            );
          })}
        </div>

        {/* step body */}
        <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: '22px 24px', minHeight: 440 }}>
          <Mono s={9} c={C.gold}>{STEPS[step].n} · {STEPS[step].label}</Mono>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.025em', marginTop: 4, marginBottom: 20 }}>{STEPS[step].title}</div>

          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Display name"><input value={f.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="e.g. Maya Chen" style={inp} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 6 }}>Portrait · required</Mono><Drop label="Drop face" big filled={!!f.portraitImageUrl} imageUrl={f.portraitImageUrl || undefined} busy={uploadingRole === 'face_front'} onClick={() => pickFile('face_front')} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 6 }}>Full body · required</Mono><Drop label="Optional" filled={!!f.fullBodyImageUrl} imageUrl={f.fullBodyImageUrl || undefined} busy={uploadingRole === 'full_body_front'} onClick={() => pickFile('full_body_front')} /></div>
                  <div><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 6 }}>Side profile</Mono><Drop label="Optional" filled={!!f.sideProfileImageUrl} imageUrl={f.sideProfileImageUrl || undefined} busy={uploadingRole === 'face_side'} onClick={() => pickFile('face_side')} /></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><Mono s={9} c={C.muted}>Expression references</Mono><Mono s={8.5} c={C.faint}>{expressions.length} added</Mono></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {expressions.map((url, i) => (
                    <span key={`${url}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                      <Mono s={8.5} c={C.soft}>Expression {i + 1}</Mono>
                      <span onClick={() => set('expressionReferenceUrls', expressions.filter((_, j) => j !== i).join('\n'))} title="Remove" style={{ color: C.coral, cursor: 'pointer', fontSize: 11 }}>✕</span>
                    </span>
                  ))}
                  <Btn size="sm" disabled={uploadingRole === 'expression'} onClick={() => pickFile('expression')}>{uploadingRole === 'expression' ? '…' : '+ Add expression'}</Btn>
                </div>
              </div>
              {inferState === 'running' && <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 2 }}>✨ Reading your photos…</Mono>}
              {inferState === 'done' && detected.length > 0 && <Mono s={9} c={C.gold} st={{ display: 'block', marginBottom: 2 }}>✨ Filled {detected.join(', ')} from your photos — edit anything that&rsquo;s off.</Mono>}
              {photoIssues.length > 0 && <Mono s={9} c={C.coral} st={{ display: 'block', marginBottom: 2 }}>⚠ Photo check: {photoIssues.join('; ')}</Mono>}
              <Field label="Portrait description" hint="text · optional"><textarea value={f.portraitDescription} onChange={(e) => set('portraitDescription', e.target.value)} rows={2} placeholder="Describe the face in words (supplements the image)…" style={{ ...inp, resize: 'vertical' }} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Hair"><input value={f.hair} onChange={(e) => set('hair', e.target.value)} placeholder="e.g. shoulder-length, dark" style={inp} /></Field>
                <Field label="Notable traits" hint="one per line"><input value={f.notableTraits} onChange={(e) => set('notableTraits', e.target.value)} placeholder="e.g. warm smile" style={inp} /></Field>
              </div>
              <Field label="Body description" hint="optional"><textarea value={f.bodyDescription} onChange={(e) => set('bodyDescription', e.target.value)} rows={2} placeholder="Build, height, presence…" style={{ ...inp, resize: 'vertical' }} /></Field>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Wardrobe preset"><textarea value={f.wardrobePreset} onChange={(e) => set('wardrobePreset', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Default look"><input value={f.defaultLook} onChange={(e) => set('defaultLook', e.target.value)} placeholder="Everyday" style={inp} /></Field>
                <Field label="Product-shoot look"><input value={f.productShootLook} onChange={(e) => set('productShootLook', e.target.value)} placeholder="Polished" style={inp} /></Field>
                <Field label="Speech look"><input value={f.speechLook} onChange={(e) => set('speechLook', e.target.value)} placeholder="Presenter" style={inp} /></Field>
              </div>
              <div>
                <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 8 }}>Usage presets</Mono>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {USAGE_PRESETS.map(([k, l]) => { const on = f.usagePresets.includes(k); return (
                    <button key={k} className="av-fr" onClick={() => set('usagePresets', toggleUsagePreset(f.usagePresets, k, !on))} style={{ cursor: 'pointer', padding: '8px 13px', borderRadius: 20, background: on ? 'rgba(212,166,82,.1)' : C.surface, border: `1px solid ${on ? C.gold : C.border}`, color: on ? C.gold : C.soft, fontSize: 12.5, fontWeight: 600 }}>{on ? '✓ ' : ''}{l}</button>
                  ); })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Gesture style"><input value={f.gestureStyle} onChange={(e) => set('gestureStyle', e.target.value)} placeholder="e.g. measured, expressive hands" style={inp} /></Field>
                <Field label="Pose library" hint="one per line"><input value={f.poseLibrary} onChange={(e) => set('poseLibrary', e.target.value)} placeholder="e.g. presenter, seated" style={inp} /></Field>
              </div>
              <Field label="Product interaction"><input value={f.productInteraction} onChange={(e) => set('productInteraction', e.target.value)} placeholder="How they hold / present a product" style={inp} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Camera presence"><input value={f.cameraPresence} onChange={(e) => set('cameraPresence', e.target.value)} placeholder="e.g. confident, direct eye-line" style={inp} /></Field>
                <Field label="Movement constraints" hint="one per line"><input value={f.movementConstraints} onChange={(e) => set('movementConstraints', e.target.value)} placeholder="e.g. minimal, stays seated" style={inp} /></Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 8 }}>Voice source</Mono><Seg opts={VOICE_MODES} val={f.voiceMode} on={(v) => set('voiceMode', v)} /></div>
              {f.voiceMode === 'uploaded_voice_sample' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Record voice sample" hint="10-30s clean speech">
                    <VoiceRecorder
                      subjectName={f.displayName}
                      onUploaded={(url) => {
                        set('voiceMode', 'uploaded_voice_sample');
                        set('voiceSampleUrl', url);
                      }}
                    />
                  </Field>
                  {f.voiceSampleUrl.trim()
                    ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: C.bg, border: '1px solid rgba(94,201,126,.35)', borderRadius: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.green }}>✓ Voice sample saved</span>
                        <button type="button" onClick={() => { set('voiceSampleUrl', ''); set('voiceSampleAssetId', ''); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 11, textDecoration: 'underline' }}>Replace</button>
                      </div>
                    : <Field label="Voice sample URL" hint="or paste a saved reference"><input value={f.voiceSampleUrl} onChange={(e) => set('voiceSampleUrl', e.target.value)} placeholder="https://" style={inp} /></Field>}
                </div>
              )}
              {f.voiceMode === 'selected_tts_voice' && (
                <Field label="TTS voice id"><input value={f.ttsVoiceId} onChange={(e) => set('ttsVoiceId', e.target.value)} placeholder="voice_…" style={inp} /></Field>
              )}
              {f.voiceMode === 'imported_voice_profile' && (
                <Field label="Voice profile id"><input value={f.voiceProfileId} onChange={(e) => set('voiceProfileId', e.target.value)} placeholder="prof_…" style={inp} /></Field>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <Field label="Language"><Select aria-label="Language" value={f.language} onChange={(v) => set('language', v)} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' }, { value: 'es', label: 'Spanish' }]} /></Field>
                <Field label="Speaking style"><input value={f.speakingStyle} onChange={(e) => set('speakingStyle', e.target.value)} placeholder="e.g. calm, warm, unhurried" style={inp} /></Field>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Default role"><input value={f.defaultRole} onChange={(e) => set('defaultRole', e.target.value)} placeholder="e.g. Brand presenter, UGC creator" style={inp} /></Field>
              <Field label="Default tone"><input value={f.defaultTone} onChange={(e) => set('defaultTone', e.target.value)} placeholder="e.g. warm, credible, unhurried" style={inp} /></Field>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><Mono s={9} c={C.muted}>Preview line</Mono><div style={{ fontSize: 14, color: C.soft, marginTop: 6, fontStyle: 'italic' }}>&ldquo;{f.defaultRole || 'A presenter'} speaking in a {f.defaultTone || 'warm'} tone.&rdquo;</div></div>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 8 }}>Likeness owner</Mono><Seg opts={OWNERS} val={f.likenessOwner} on={(v) => set('likenessOwner', v)} /></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: C.bg, border: `1px solid ${f.consentConfirmed ? 'rgba(212,166,82,.4)' : C.border}`, borderRadius: 8 }}>
                <div><div style={{ fontSize: 13.5, fontWeight: 700 }}>Consent confirmed</div><Mono s={8.5} c={C.muted}>Required to save · rights to this likeness</Mono></div><Toggle on={f.consentConfirmed} onClick={() => set('consentConfirmed', !f.consentConfirmed)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Commercial use allowed</div><Toggle on={f.commercialUseAllowed} onClick={() => set('commercialUseAllowed', !f.commercialUseAllowed)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div><div style={{ fontSize: 13.5, fontWeight: 700 }}>Bind to a brand</div><Mono s={8.5} c={C.muted}>Scope this person to one brand vault</Mono></div><Toggle on={f.bindBrand} onClick={() => set('bindBrand', !f.bindBrand)} />
              </div>
              {f.bindBrand && (
                <Field label="Brand">
                  {brands.length > 0
                    ? <Select aria-label="Brand" placeholder="Select a brand…" value={f.brandId} onChange={(v) => set('brandId', v)} options={brands.map((b) => ({ value: b.brandId, label: b.name }))} />
                    : <Mono s={9} c={C.muted}>No brands yet — create one in Brand Vault first, then it appears here.</Mono>}
                </Field>
              )}
              <Field label="Rights notes" hint="optional"><textarea value={f.rightsNotes} onChange={(e) => set('rightsNotes', e.target.value)} rows={2} placeholder="Any usage limits, expiry, territory…" style={{ ...inp, resize: 'vertical' }} /></Field>
            </div>
          )}
        </div>

        {/* live preview */}
        <div className="av-forge-side" style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <Mono s={8.5} c={C.muted} st={{ display: 'block', marginBottom: 12 }}>Taking shape</Mono>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Portrait name={f.displayName} size={120} url={f.portraitImageUrl || undefined} /></div>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>{f.displayName || 'Unnamed'}</div>
              <Mono s={8.5} c={C.muted} st={{ display: 'block', marginTop: 3 }}>{f.defaultRole || 'role undefined'}</Mono>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {([['Face', !!f.portraitImageUrl], ['Full body', !!f.fullBodyImageUrl], ['Hair / traits', !!(f.hair || f.notableTraits)], ['Wardrobe', f.usagePresets.length > 0], ['Movement', !!f.gestureStyle], ['Voice', done.voice], ['Persona', !!(f.defaultRole || f.defaultTone)], ['Rights', f.consentConfirmed]] as Array<[string, boolean]>).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: v ? C.gold : C.faint }} />
                  <Mono s={9} c={v ? C.soft : C.dim}>{k}</Mono>
                  <span style={{ marginLeft: 'auto' }}><Mono s={8} c={v ? C.gold : C.faint}>{v ? 'set' : '—'}</Mono></span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Mono s={9} c={C.muted}>Completeness</Mono><Mono s={9} c={C.gold}>{pct}%</Mono></div>
            <div style={{ height: 5, background: C.well, borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: C.gold, transition: 'width .4s cubic-bezier(0.16,1,0.3,1)' }} /></div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <Btn onClick={() => (step > 0 ? setStep(step - 1) : onDone())}>{step > 0 ? '◂ Back' : 'Cancel'}</Btn>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Mono s={9} c={C.dim}>{canSave ? 'Ready to save' : 'Draft'}</Mono>
          {step < STEPS.length - 1
            ? <Btn variant="primary" onClick={() => setStep(step + 1)}>Next · {STEPS[step + 1].label} →</Btn>
            : <Btn variant="primary" disabled={!canSave || createDraft.isPending} onClick={save}>{createDraft.isPending ? 'Saving…' : 'Save to vault'}</Btn>}
        </div>
      </div>
    </>
  );
}
