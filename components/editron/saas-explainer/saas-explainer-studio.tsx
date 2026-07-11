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
import {
  Loader2, Sparkles, Film, FileText, Upload, Link2, Wand2, Download,
  RotateCcw, ArrowRight, Check, Mic, X,
} from 'lucide-react';
import { useActiveBrand } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';
import { useToast } from '@/hooks/editron/use-toast';
import { Btn, Mono, inputClass, textareaClass } from '@/components/primitives';
import { cn } from '@/lib/utils';
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
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
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
  const [staged, setStaged] = useState(false); // result-screen edits stacked but not yet rendered
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
          setStaged(false);
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
          if (res.voice) setVoice(res.voice);
          setChatReply(res.reply);
          setChatInput('');
          // Edits STACK — we do NOT render each one. On the result screen, mark the shown video stale; the
          // user renders ONCE (the "Render changes" button) after all their edits have landed.
          if (fromResult && res.op !== 'refuse' && res.op !== 'unknown') setStaged(true);
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
    setStaged(false);
    clearDoc();
    clearReference();
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6 text-ds-primary sm:p-8">
      <header className="flex flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 text-gold">
            <Sparkles size={16} />
          </span>
          <div>
            <Mono size="8" className="text-gold">SaaS explainer · Studio</Mono>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">Make a brand-faithful explainer</h1>
          </div>
        </div>
        <Stepper stepIndex={stepIndex} />
      </header>

      {screen === 'brief' && (
        <div className="flex flex-col gap-5">
          <Card>
            <SectionHead icon={<FileText size={14} />} title="Your brief" hint="What the video is about." />
            <div className="flex flex-col gap-4">
              <Field label="Brand" hint="Colors, logo, and voice pull from Brand Vault.">
                <select className={inputClass} value={activeBrandId ?? ''} onChange={(e) => setActiveBrandId(e.target.value || null)} disabled={brandsLoading}>
                  <option value="">No brand — describe manually</option>
                  {brands.map((b) => <option key={b.brandId} value={b.brandId}>{b.name}</option>)}
                </select>
                {activeBrand?.name && <p className="text-[11px] text-ds-muted">Using {activeBrand.name}.</p>}
              </Field>

              <Field label="Product name" hint="Optional — falls back to the brand.">
                <input className={inputClass} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Insturix" />
              </Field>

              <Field label="Goal of the video" hint="What should a viewer understand or do?">
                <textarea className={cn(textareaClass, 'min-h-[84px]')} value={outcome} onChange={(e) => setOutcome(e.target.value)}
                  placeholder="Show how the product turns a week of content work into one on-brand workflow." />
              </Field>
            </div>
          </Card>

          <Card subtle>
            <SectionHead icon={<Film size={14} />} title="References" tag="Optional"
              hint={<>A video sets the <span className="text-ds-secondary">look</span>, a doc sets the <span className="text-ds-secondary">topic</span>.</>} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reference video" hint="Match a video's style.">
                {referenceLabel ? (
                  <Pill icon={<Film size={13} className="text-gold" />} label={`${referenceLabel} · ${referenceImageUrls.length} frame(s)`} onRemove={clearReference} />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input className={cn(inputClass, 'flex-1')} value={referenceUrlInput} onChange={(e) => setReferenceUrlInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !ingestReference.isPending) fetchReferenceUrl(); }} placeholder="Paste a video link…" disabled={ingestReference.isPending} />
                      <Btn variant="ghost" onClick={fetchReferenceUrl} disabled={ingestReference.isPending || !referenceUrlInput.trim()}>
                        {ingestReference.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 size={14} />}
                      </Btn>
                    </div>
                    <DropZone busy={ingestReference.isPending} icon={<Upload size={14} />} label="or upload mp4 / mov / webm"
                      accept=".mp4,.mov,.webm,.m4v" onFile={(f) => uploadReferenceVideo(f)} />
                  </div>
                )}
              </Field>

              <Field label="Source document" hint="What it's about.">
                {sourceDocName ? (
                  <Pill icon={<FileText size={13} className="text-gold" />} label={`${sourceDocName} · ${sourceMaterial.length.toLocaleString()} chars`} onRemove={clearDoc} />
                ) : (
                  <DropZone busy={ingestDoc.isPending} icon={<Upload size={14} />} label="Upload PDF, DOCX, PPTX, or TXT"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md" onFile={(f) => uploadDoc(f)} tall />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
              <Field label="Audience" hint="Optional.">
                <input className={inputClass} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="SaaS founders, agencies" />
              </Field>
              <Field label="Length" group>
                <Seg options={DURATIONS.map((d) => ({ id: String(d), label: `${d}s` }))} value={String(durationSec)} onPick={(v) => setDurationSec(Number(v))} />
              </Field>
              <Field label="Aspect" group>
                <Seg options={ASPECTS.map((a) => ({ id: a.id, label: a.label }))} value={aspectRatio} onPick={(v) => setAspectRatio(v as Aspect)} />
              </Field>
            </div>
          </Card>

          <div className="flex justify-end">
            <Btn variant="primary" size="lg" onClick={generateScript} disabled={planMutation.isPending || !canBrief}>
              {planMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing the script…</> : <>Write the script <ArrowRight size={15} /></>}
            </Btn>
          </div>
        </div>
      )}

      {screen === 'script' && plan && (
        <div className="flex flex-col gap-5">
          <div className="rounded-card border border-ds-subtle bg-surface-raised p-4">
            <Mono size="8" className="text-ds-muted">The video</Mono>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ds-secondary">{plan.message}</p>
          </div>

          <div className="flex flex-col gap-3">
            {scenes.map((scene) => (
              <div key={scene.index} className="rounded-card border border-ds-subtle bg-surface-raised p-4 transition-colors hover:border-ds-emphasis">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-mono text-[10px] font-bold text-gold">{scene.index + 1}</span>
                  <span className="text-[13px] font-semibold text-ds-primary">{scene.title}</span>
                  <span className="ml-auto rounded-full border border-ds-subtle px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ds-muted">{scene.form} · {scene.durationSec}s</span>
                </div>
                <textarea className={textareaClass} value={scene.narration} onChange={(e) => updateScene(scene.index, e.target.value)}
                  placeholder="What the voiceover says in this scene…" rows={2} />
              </div>
            ))}
          </div>

          <Field label="Voice">
            <div className="flex items-center gap-2">
              <Mic size={14} className="shrink-0 text-ds-muted" />
              <select className={inputClass} value={voice} onChange={(e) => setVoice(e.target.value)}>
                {VO_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.accent} — {v.description}</option>)}
              </select>
            </div>
          </Field>

          <ChatEdit
            reply={chatReply}
            input={chatInput}
            setInput={setChatInput}
            pending={chatEdit.isPending}
            onSend={() => sendChatEdit()}
            hint="Change the script, look, voice, or pacing — e.g. “punchier hook”, “make scene 2 bolder”, “use a British voice”. Look/voice changes apply when you render."
          />

          <div className="flex items-center justify-between">
            <Btn variant="ghost" onClick={generateScript} disabled={planMutation.isPending}>
              {planMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Regenerating…</> : <><RotateCcw size={14} /> Regenerate</>}
            </Btn>
            <Btn variant="primary" size="lg" onClick={() => renderVideo()} disabled={finalizeMutation.isPending}>
              {finalizeMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <>Render video <ArrowRight size={15} /></>}
            </Btn>
          </div>
        </div>
      )}

      {screen === 'render' && (
        <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-card border border-ds-subtle bg-surface-raised p-12 text-center">
          <span className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[120px] font-extrabold tracking-tighter text-white/[0.02]">
            {s?.status === 'queued' ? 'QUEUED' : 'CRAFTING'}
          </span>
          <div className="relative flex flex-col items-center gap-6">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
            <div>
              <p className="text-[15px] font-semibold text-ds-primary">{renderStageLabel(s?.status, s?.progress ?? 0)}</p>
              <p className="mt-1 max-w-sm text-[13px] text-ds-muted">The craft agent designs each scene, then renders with voiceover. This takes a few minutes.</p>
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
          </div>
        </div>
      )}

      {screen === 'result' && (
        <div className="flex flex-col gap-4">
          {s?.outputUrl ? (
            <video src={s.outputUrl} controls className="w-full rounded-card border border-ds-subtle bg-black shadow-[0_20px_60px_rgba(0,0,0,0.4)]" />
          ) : (
            <div className="rounded-card border border-ds-subtle bg-surface-raised p-12 text-center text-ds-muted">Preparing your video…</div>
          )}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ds-faint">{typeof s?.costUsd === 'number' ? `Render cost ≈ $${s.costUsd.toFixed(3)}` : ''}</span>
            <div className="flex gap-2">
              {s?.outputUrl && <a href={s.outputUrl} download><Btn variant="ghost"><Download size={14} /> Download</Btn></a>}
              <Btn variant="primary" onClick={startOver}><Sparkles size={14} /> Make another</Btn>
            </div>
          </div>

          <ChatEdit
            reply={chatReply}
            input={chatInput}
            setInput={setChatInput}
            pending={chatEdit.isPending}
            onSend={() => sendChatEdit(true)}
            title="Edit this video with chat"
            hint="Stack up your changes — “make scene 2 bolder”, “punchier hook”, “use a British voice” — then render once when you're done."
            footer={staged ? (
              <div className="mt-3 flex items-center justify-between rounded-md border border-gold/40 bg-gold/10 px-3 py-2">
                <span className="text-[13px] text-ds-secondary">Changes staged — render to see them.</span>
                <Btn variant="primary" size="sm" onClick={() => renderVideo()} disabled={finalizeMutation.isPending}>
                  {finalizeMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Rendering…</> : <>Render changes <ArrowRight size={14} /></>}
                </Btn>
              </div>
            ) : null}
          />
        </div>
      )}
    </div>
  );
}

/* ── presentation helpers ─────────────────────────────────────────── */

function Stepper({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <div key={step.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-colors',
                active ? 'border-gold bg-gold text-[#241B08]' : done ? 'border-gold/50 bg-gold/10 text-gold' : 'border-ds-subtle bg-surface-deeper text-ds-dim')}>
                {done ? <Check size={12} /> : i + 1}
              </span>
              <span className={cn('text-[12px] font-semibold', active ? 'text-ds-primary' : done ? 'text-ds-secondary' : 'text-ds-faint')}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <span className={cn('mx-3 h-px flex-1', done ? 'bg-gold/40' : 'bg-ds-subtle')} />}
          </div>
        );
      })}
    </div>
  );
}

function Card({ children, subtle }: { children: React.ReactNode; subtle?: boolean }) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-card border p-5', subtle ? 'border-ds-subtle bg-surface-canvas' : 'border-ds-subtle bg-surface-raised')}>
      {children}
    </section>
  );
}

function SectionHead({ icon, title, tag, hint }: { icon: React.ReactNode; title: string; tag?: string; hint?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-gold">{icon}</span>
        <Mono size="9" className="text-ds-secondary">{title}</Mono>
        {tag && <span className="rounded-full border border-ds-subtle px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-ds-dim">{tag}</span>}
      </div>
      {hint && <p className="mt-1 text-[12px] text-ds-muted">{hint}</p>}
    </div>
  );
}

function Field({ label, hint, children, group }: { label: string; hint?: React.ReactNode; children: React.ReactNode; group?: boolean }) {
  const inner = (
    <>
      <span className="text-[12px] font-semibold text-ds-secondary">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ds-faint">{hint}</span>}
    </>
  );
  // A <label> forwards clicks to its first control — which breaks a group of
  // buttons (Seg). Use a plain div for those; keep <label> for single inputs.
  return group
    ? <div className="flex flex-col items-start gap-1.5">{inner}</div>
    : <label className="flex flex-col gap-1.5">{inner}</label>;
}

function Seg({ options, value, onPick }: { options: Array<{ id: string; label: string }>; value: string; onPick: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-button border border-ds-subtle bg-surface-deeper p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onPick(o.id)}
          className={cn('rounded-[5px] px-2.5 py-1.5 font-mono text-[11px] transition-colors focus-visible:outline-hidden',
            value === o.id ? 'bg-gold font-bold text-[#241B08]' : 'text-ds-muted hover:text-ds-secondary')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Pill({ icon, label, onRemove }: { icon: React.ReactNode; label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-ds-emphasis bg-surface-well px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 truncate text-[13px] text-ds-secondary">{icon}<span className="truncate">{label}</span></span>
      <button type="button" onClick={onRemove} className="shrink-0 text-ds-muted hover:text-status-danger" aria-label="Remove"><X size={14} /></button>
    </div>
  );
}

function DropZone({ busy, icon, label, accept, onFile, tall }: { busy: boolean; icon: React.ReactNode; label: string; accept: string; onFile: (f: File | undefined) => void; tall?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-ds-emphasis bg-surface-well text-[12.5px] text-ds-muted transition-colors hover:border-gold/40 hover:text-ds-secondary',
      tall ? 'px-3 py-4' : 'px-3 py-2.5', busy && 'opacity-60')}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {busy ? 'Reading…' : label}
      <input type="file" accept={accept} className="hidden" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

function ChatEdit({ reply, input, setInput, pending, onSend, title = 'Edit with chat', hint, footer }: {
  reply: string | null; input: string; setInput: (v: string) => void; pending: boolean; onSend: () => void; title?: string; hint: string; footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-ds-subtle bg-surface-raised p-4">
      <div className="flex items-center gap-2"><Wand2 size={14} className="text-gold" /><Mono size="8" className="text-gold">{title}</Mono></div>
      <p className="mt-1.5 mb-3 text-[12px] text-ds-muted">{hint}</p>
      {reply && <p className="mb-3 rounded-md border border-ds-subtle bg-surface-well px-3 py-2 text-[13px] text-ds-secondary">{reply}</p>}
      <div className="flex gap-2">
        <input className={cn(inputClass, 'flex-1')} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !pending) onSend(); }} placeholder="Describe the change…" disabled={pending} />
        <Btn variant="ghost" onClick={onSend} disabled={pending || !input.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
        </Btn>
      </div>
      {footer}
    </div>
  );
}

function renderStageLabel(statusValue: string | undefined, progress: number): string {
  if (statusValue === 'queued') return 'Queued — waiting for a render slot…';
  if (statusValue === 'error') return 'Render failed';
  if (statusValue === 'done') return 'Done';
  if (progress >= 0.5) return `Rendering on the cloud… ${Math.round(progress * 100)}%`;
  return 'Crafting each scene…';
}
