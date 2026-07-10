'use client';

/**
 * SaaS Explainer Studio — the PREMIUM path's front-end (a separate SaaS surface, per product decision).
 *
 * Four screens, one state machine:
 *   brief  → pick brand + goal + duration/aspect            → POST /plan
 *   script → edit / regenerate the spoken narration + voice  → POST /finalize
 *   render → poll the render job                             → GET /status
 *   result → watch the MP4, export/download, make another
 *
 * The user finishes the whole video here (chat-to-edit lives on the result screen); Editron is only the optional
 * export target. Additive + non-breaking: mounts at its own route, leaves the existing draft intake untouched.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useActiveBrand } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';
import { useToast } from '@/hooks/editron/use-toast';
import { Btn, Mono } from '@/components/primitives';
import { VO_VOICES, DEFAULT_VOICE } from '@/lib/editron/saas-explainer/vo-voices';
import {
  useSaasExplainerPlan,
  useSaasExplainerFinalize,
  useSaasExplainerStatus,
  useSaasExplainerChatEdit,
  useSaasExplainerIngestDoc,
  useSaasExplainerIngestReference,
  type SaasExplainerPlanResult,
  type ScriptPlanScene,
} from '@/hooks/editron/use-saas-explainer';

type Screen = 'brief' | 'script' | 'render' | 'result';
type Aspect = '16:9' | '9:16' | '1:1';

const STEPS: Array<{ id: Screen; label: string }> = [
  { id: 'brief', label: 'Brief' },
  { id: 'script', label: 'Script' },
  { id: 'render', label: 'Render' },
  { id: 'result', label: 'Result' },
];

const DURATIONS = [30, 45, 60, 90] as const;
const ASPECTS: Array<{ id: Aspect; label: string }> = [
  { id: '16:9', label: 'Landscape 16:9' },
  { id: '9:16', label: 'Vertical 9:16' },
  { id: '1:1', label: 'Square 1:1' },
];

export default function SaasExplainerStudio() {
  const { toast } = useToast();
  const { brands, activeBrandId, activeBrand, setActiveBrandId, isLoading: brandsLoading } = useActiveBrand();

  const [screen, setScreen] = useState<Screen>('brief');

  // brief state
  const [productName, setProductName] = useState('');
  const [outcome, setOutcome] = useState('');
  const [audience, setAudience] = useState('');
  const [durationSec, setDurationSec] = useState<number>(60);
  const [aspectRatio, setAspectRatio] = useState<Aspect>('16:9');
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);

  // uploaded source doc (PDF/DOCX) — the video's topic/source material
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [sourceDocName, setSourceDocName] = useState('');

  // style reference video → frames the craft agent designs to match
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [referenceLabel, setReferenceLabel] = useState('');
  const [referenceUrlInput, setReferenceUrlInput] = useState('');

  // script state
  const [plan, setPlan] = useState<SaasExplainerPlanResult | null>(null);
  const [scenes, setScenes] = useState<ScriptPlanScene[]>([]);

  // render state
  const [jobId, setJobId] = useState<string | null>(null);

  // chat-edit state
  const [chatInput, setChatInput] = useState('');
  const [chatReply, setChatReply] = useState<string | null>(null);

  const planMutation = useSaasExplainerPlan();
  const finalizeMutation = useSaasExplainerFinalize();
  const chatEdit = useSaasExplainerChatEdit();
  const ingestDoc = useSaasExplainerIngestDoc();
  const ingestReference = useSaasExplainerIngestReference();
  const status = useSaasExplainerStatus(screen === 'render' || screen === 'result' ? jobId : null);

  const stepIndex = STEPS.findIndex((s) => s.id === screen);
  const canBrief = Boolean(activeBrandId || outcome.trim() || productName.trim() || sourceMaterial);

  const uploadDoc = (file: File | undefined) => {
    if (!file) return;
    ingestDoc.mutate(file, {
      onSuccess: (res) => {
        setSourceMaterial(res.text);
        setSourceDocName(res.name);
        toast({ title: 'Document loaded', description: `${res.name} — ${res.chars.toLocaleString()} characters of source material.` });
      },
      onError: (err) => toast({ variant: 'destructive', title: 'Could not read document', description: err.message }),
    });
  };
  const clearDoc = () => { setSourceMaterial(''); setSourceDocName(''); };

  const applyReference = (res: { referenceImageUrls: string[]; frames: number }, label: string) => {
    setReferenceImageUrls(res.referenceImageUrls);
    setReferenceLabel(label);
    toast({ title: 'Reference captured', description: `${res.frames} frame(s) — the video will be designed to match this look.` });
  };
  const uploadReferenceVideo = (file: File | undefined) => {
    if (!file) return;
    ingestReference.mutate({ file }, {
      onSuccess: (res) => applyReference(res, file.name),
      onError: (err) => toast({ variant: 'destructive', title: 'Could not read reference video', description: err.message }),
    });
  };
  const fetchReferenceUrl = () => {
    const url = referenceUrlInput.trim();
    if (!url) return;
    ingestReference.mutate({ videoUrl: url }, {
      onSuccess: (res) => { applyReference(res, url); setReferenceUrlInput(''); },
      onError: (err) => toast({ variant: 'destructive', title: 'Could not fetch reference video', description: err.message }),
    });
  };
  const clearReference = () => { setReferenceImageUrls([]); setReferenceLabel(''); setReferenceUrlInput(''); };

  const generateScript = () => {
    if (!canBrief) {
      toast({ variant: 'destructive', title: 'Add a goal or brand', description: 'Pick a Brand Vault brand or describe the goal first.' });
      return;
    }
    planMutation.mutate(
      {
        brandId: activeBrandId || undefined,
        productName: productName.trim() || undefined,
        // ensure the intake has a content anchor (needs outcome/script/brandId) even when only a doc is provided.
        outcome:
          outcome.trim() ||
          (sourceMaterial ? 'Create a clear explainer about the product/topic in the provided source material.' : undefined),
        audience: audience.trim() || undefined,
        durationSec,
        aspectRatio,
        sourceMaterial: sourceMaterial || undefined,
      },
      {
        onSuccess: (res) => {
          setPlan(res);
          setScenes(res.scenes);
          setScreen('script');
          if (res.warnings?.length) {
            toast({ title: 'Script ready — with notes', description: res.warnings[0] });
          }
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Could not write the script', description: err.message }),
      },
    );
  };

  const updateScene = (index: number, narration: string) => {
    setScenes((prev) => prev.map((s) => (s.index === index ? { ...s, narration } : s)));
  };

  const renderVideo = (overrideScenes?: ScriptPlanScene[], overrideVoice?: string) => {
    if (!plan) return;
    const scriptScenes = overrideScenes ?? scenes;
    if (!scriptScenes.some((s) => s.narration.trim())) {
      toast({ variant: 'destructive', title: 'Empty script', description: 'At least one scene needs narration.' });
      return;
    }
    finalizeMutation.mutate(
      {
        scriptScenes,
        productModel: plan.productModel,
        message: plan.message,
        voice: overrideVoice ?? voice,
        brandId: activeBrandId || undefined,
        referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
      },
      {
        onSuccess: (res) => {
          setJobId(res.jobId);
          setScreen('render');
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Could not start the render', description: err.message }),
      },
    );
  };

  const sendChatEdit = (fromResult = false) => {
    const message = chatInput.trim();
    if (!message || !plan) return;
    chatEdit.mutate(
      { message, scenes, videoMessage: plan.message },
      {
        onSuccess: (res) => {
          setScenes(res.scenes);
          const nextVoice = res.voice ?? voice;
          if (res.voice) setVoice(res.voice);
          setChatReply(res.reply);
          setChatInput('');
          // From the result screen, a visual/voice/pacing edit needs a fresh render to be seen.
          if (fromResult && res.needsRerender) renderVideo(res.scenes, nextVoice);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Edit failed', description: err.message }),
      },
    );
  };

  const s = status.data;
  // advance to result once the job is done (effect, not during render)
  useEffect(() => {
    if (screen === 'render' && s?.status === 'done' && s.outputUrl) setScreen('result');
  }, [screen, s?.status, s?.outputUrl]);

  const startOver = () => {
    setScreen('brief');
    setPlan(null);
    setScenes([]);
    setJobId(null);
    clearDoc();
    clearReference();
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col gap-6 p-6 text-ds-primary">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Mono size="9" className="text-gold">SAAS EXPLAINER · STUDIO</Mono>
          <h1 className="text-2xl font-bold tracking-tight">Make a brand-faithful explainer</h1>
        </div>
        <StepRail stepIndex={stepIndex} />
      </header>

      {screen === 'brief' && (
        <section className="flex flex-col gap-5 rounded-xl border border-ds-subtle bg-surface-raised p-6">
          <FieldRow label="Brand" hint="Colors, logo, voice pull from Brand Vault.">
            <select
              className="w-full rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
              value={activeBrandId ?? ''}
              onChange={(e) => setActiveBrandId(e.target.value || null)}
              disabled={brandsLoading}
            >
              <option value="">No brand — describe manually</option>
              {brands.map((b) => (
                <option key={b.brandId} value={b.brandId}>{b.name}</option>
              ))}
            </select>
            {activeBrand?.name && <p className="mt-1 text-xs text-ds-muted">Using {activeBrand.name}.</p>}
          </FieldRow>

          <FieldRow label="Product name" hint="Optional — falls back to the brand.">
            <TextInput value={productName} onChange={setProductName} placeholder="e.g. Insturix" />
          </FieldRow>

          <FieldRow label="Goal of the video" hint="What should a viewer understand or do?">
            <textarea
              className="min-h-[80px] w-full rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="Show how the product turns a week of content work into one on-brand workflow."
            />
          </FieldRow>

          <div className="rounded-xl border border-ds-subtle bg-surface-raised/40 p-4">
            <Mono size="8" className="text-gold">REFERENCES · OPTIONAL</Mono>
            <p className="mt-1 mb-4 text-xs text-ds-muted">A video sets the <span className="text-ds-secondary">look</span>, a doc sets the <span className="text-ds-secondary">topic</span>.</p>

            <FieldRow label="Reference video" hint="Match a video's style — link or upload.">
              {referenceLabel ? (
                <div className="flex items-center justify-between rounded-md border border-ds-emphasis bg-surface-well px-3 py-2">
                  <span className="truncate text-sm text-ds-secondary">🎬 {referenceLabel} · {referenceImageUrls.length} frame(s)</span>
                  <Btn variant="ghost" size="sm" onClick={clearReference}>Remove</Btn>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
                      value={referenceUrlInput}
                      onChange={(e) => setReferenceUrlInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !ingestReference.isPending) fetchReferenceUrl(); }}
                      placeholder="Paste a video link…"
                      disabled={ingestReference.isPending}
                    />
                    <Btn variant="ghost" onClick={fetchReferenceUrl} disabled={ingestReference.isPending || !referenceUrlInput.trim()}>
                      {ingestReference.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                    </Btn>
                  </div>
                  <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-ds-emphasis bg-surface-well px-3 py-2 text-sm text-ds-muted hover:text-ds-primary ${ingestReference.isPending ? 'opacity-60' : ''}`}>
                    {ingestReference.isPending ? 'Reading…' : '⬆ or upload an mp4 / mov / webm'}
                    <input type="file" accept=".mp4,.mov,.webm,.m4v" className="hidden" disabled={ingestReference.isPending}
                      onChange={(e) => { uploadReferenceVideo(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>
              )}
            </FieldRow>

            <div className="mt-4">
              <FieldRow label="Source document" hint="What it's about — PDF, deck, or doc.">
                {sourceDocName ? (
                  <div className="flex items-center justify-between rounded-md border border-ds-emphasis bg-surface-well px-3 py-2">
                    <span className="text-sm text-ds-secondary">📄 {sourceDocName} · {sourceMaterial.length.toLocaleString()} chars</span>
                    <Btn variant="ghost" size="sm" onClick={clearDoc}>Remove</Btn>
                  </div>
                ) : (
                  <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-ds-emphasis bg-surface-well px-3 py-3 text-sm text-ds-muted hover:text-ds-primary ${ingestDoc.isPending ? 'opacity-60' : ''}`}>
                    {ingestDoc.isPending ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Reading…</span> : '⬆ Upload a PDF, DOCX, PPTX, or TXT'}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md"
                      className="hidden"
                      disabled={ingestDoc.isPending}
                      onChange={(e) => { uploadDoc(e.target.files?.[0]); e.target.value = ''; }}
                    />
                  </label>
                )}
              </FieldRow>
            </div>
          </div>

          <FieldRow label="Audience" hint="Optional.">
            <TextInput value={audience} onChange={setAudience} placeholder="SaaS founders, marketing agencies" />
          </FieldRow>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Length">
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <Chip key={d} on={durationSec === d} onClick={() => setDurationSec(d)}>{d}s</Chip>
                ))}
              </div>
            </FieldRow>
            <FieldRow label="Aspect">
              <div className="flex flex-wrap gap-2">
                {ASPECTS.map((a) => (
                  <Chip key={a.id} on={aspectRatio === a.id} onClick={() => setAspectRatio(a.id)}>{a.id}</Chip>
                ))}
              </div>
            </FieldRow>
          </div>

          <div className="flex justify-end">
            <Btn variant="primary" size="lg" onClick={generateScript} disabled={planMutation.isPending || !canBrief}>
              {planMutation.isPending ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Writing the script…</span> : 'Write the script →'}
            </Btn>
          </div>
        </section>
      )}

      {screen === 'script' && plan && (
        <section className="flex flex-col gap-5">
          <div className="rounded-xl border border-ds-subtle bg-surface-raised p-4">
            <Mono size="8" className="text-ds-muted">THE VIDEO</Mono>
            <p className="mt-1 text-ds-secondary">{plan.message}</p>
          </div>

          <div className="flex flex-col gap-3">
            {scenes.map((scene) => (
              <div key={scene.index} className="rounded-xl border border-ds-subtle bg-surface-raised p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Mono size="8" className="text-gold">SCENE {scene.index + 1}</Mono>
                  <span className="text-xs text-ds-faint">{scene.form} · {scene.durationSec}s</span>
                </div>
                <p className="mb-2 text-xs text-ds-muted">{scene.title}</p>
                <textarea
                  className="w-full rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
                  value={scene.narration}
                  onChange={(e) => updateScene(scene.index, e.target.value)}
                  placeholder="What the voiceover says in this scene…"
                  rows={2}
                />
              </div>
            ))}
          </div>

          <FieldRow label="Voice" hint="The narration voice.">
            <select
              className="w-full rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            >
              {VO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label} · {v.accent} — {v.description}</option>
              ))}
            </select>
          </FieldRow>

          <div className="rounded-xl border border-ds-subtle bg-surface-raised p-4">
            <Mono size="8" className="text-gold">EDIT WITH CHAT</Mono>
            <p className="mt-1 mb-3 text-xs text-ds-muted">Change the script, the look, the voice, or pacing — e.g. “punchier hook”, “make scene 2 bolder”, “use a British voice”. Look/voice changes apply when you render.</p>
            {chatReply && <p className="mb-3 rounded-md border border-ds-subtle bg-surface-well px-3 py-2 text-sm text-ds-secondary">{chatReply}</p>}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !chatEdit.isPending) sendChatEdit(); }}
                placeholder="Describe the change…"
                disabled={chatEdit.isPending}
              />
              <Btn variant="ghost" onClick={() => sendChatEdit()} disabled={chatEdit.isPending || !chatInput.trim()}>
                {chatEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
              </Btn>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Btn variant="ghost" onClick={generateScript} disabled={planMutation.isPending}>
              {planMutation.isPending ? 'Regenerating…' : '↻ Regenerate script'}
            </Btn>
            <Btn variant="primary" size="lg" onClick={() => renderVideo()} disabled={finalizeMutation.isPending}>
              {finalizeMutation.isPending ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Starting…</span> : 'Render video →'}
            </Btn>
          </div>
        </section>
      )}

      {screen === 'render' && (
        <section className="flex flex-col items-center gap-5 rounded-xl border border-ds-subtle bg-surface-raised p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
          <div>
            <p className="font-medium text-ds-primary">{renderStageLabel(s?.status, s?.progress ?? 0)}</p>
            <p className="mt-1 text-sm text-ds-muted">The craft agent is designing each scene, then rendering with voiceover. This takes a few minutes.</p>
          </div>
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-well">
            <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${Math.round((s?.progress ?? 0.02) * 100)}%` }} />
          </div>
          {s?.status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-status-danger">{s.error || 'The render failed.'}</p>
              <Btn variant="ghost" onClick={() => setScreen('script')}>← Back to script</Btn>
            </div>
          )}
        </section>
      )}

      {screen === 'result' && (
        <section className="flex flex-col gap-4">
          {s?.outputUrl ? (
            <video src={s.outputUrl} controls className="w-full rounded-xl border border-ds-subtle bg-black" />
          ) : (
            <div className="rounded-xl border border-ds-subtle bg-surface-raised p-10 text-center text-ds-muted">Preparing your video…</div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-ds-faint">{typeof s?.costUsd === 'number' ? `Render cost ≈ $${s.costUsd.toFixed(3)}` : ''}</span>
            <div className="flex gap-2">
              {s?.outputUrl && (
                <a href={s.outputUrl} download>
                  <Btn variant="ghost">Download</Btn>
                </a>
              )}
              <Btn variant="primary" onClick={startOver}>Make another</Btn>
            </div>
          </div>

          <div className="rounded-xl border border-ds-subtle bg-surface-raised p-4">
            <Mono size="8" className="text-gold">EDIT THIS VIDEO WITH CHAT</Mono>
            <p className="mt-1 mb-3 text-xs text-ds-muted">Change the words, the look, the voice, or the pacing — e.g. “make scene 2 bolder”, “punchier hook”, “use a British voice”. Visual and voice changes re-render the video.</p>
            {chatReply && <p className="mb-3 rounded-md border border-ds-subtle bg-surface-well px-3 py-2 text-sm text-ds-secondary">{chatReply}</p>}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !chatEdit.isPending && !finalizeMutation.isPending) sendChatEdit(true); }}
                placeholder="Describe the change…"
                disabled={chatEdit.isPending || finalizeMutation.isPending}
              />
              <Btn variant="ghost" onClick={() => sendChatEdit(true)} disabled={chatEdit.isPending || finalizeMutation.isPending || !chatInput.trim()}>
                {chatEdit.isPending || finalizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
              </Btn>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StepRail({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="hidden items-center gap-2 sm:flex">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <span className={`text-xs ${i === stepIndex ? 'text-gold' : i < stepIndex ? 'text-ds-secondary' : 'text-ds-faint'}`}>{step.label}</span>
          {i < STEPS.length - 1 && <span className="text-ds-faint">·</span>}
        </div>
      ))}
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ds-secondary">{label}</span>
      {children}
      {hint && <span className="text-xs text-ds-faint">{hint}</span>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      className="w-full rounded-md border border-ds-emphasis bg-surface-well px-3 py-2 text-ds-primary"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${on ? 'border-gold bg-gold/10 text-gold' : 'border-ds-emphasis bg-surface-well text-ds-secondary hover:text-ds-primary'}`}
    >
      {children}
    </button>
  );
}

function renderStageLabel(statusValue: string | undefined, progress: number): string {
  if (statusValue === 'queued') return 'Queued — waiting for a render slot…';
  if (statusValue === 'error') return 'Render failed';
  if (statusValue === 'done') return 'Done';
  if (progress >= 0.5) return `Rendering on the cloud… ${Math.round(progress * 100)}%`;
  return 'Crafting each scene…';
}
