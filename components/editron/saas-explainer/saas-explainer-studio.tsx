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
 *
 * Visual language — "The Treatment": a persistent editorial masthead (mono eyebrow + big Plus-Jakarta headline +
 * brand chip + step breadcrumb) over numbered bands. Reads like a film treatment that becomes a video. Single gold
 * accent, JetBrains-mono micro-labels, hairline structure — all via design tokens, no inline colors.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Loader2, Sparkles, Film, FileText, Upload, Link2, Wand2, Download,
  RotateCcw, ArrowRight, Mic, X, ChevronDown, Check,
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

const SUBTITLE: Record<Screen, string> = {
  brief: 'A treatment',
  script: 'Draft script',
  render: 'Rendering',
  result: 'Final cut',
};

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
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-16 pt-10 text-ds-primary sm:px-8">
      <Masthead subtitle={SUBTITLE[screen]} brandName={activeBrand?.name} productName={productName} stepIndex={stepIndex} />

      {screen === 'brief' && (
        <div className="flex flex-col">
          <Band n="01" title="Brand & goal" active
            desc="One line the whole film inherits from. Pick a Brand Vault brand for its colors, logo, and voice — or describe it by hand.">
            <div className="flex flex-col gap-6">
              {/* Goal is the hero line of the brief — everything downstream inherits from it. */}
              <Field label="Goal of the video" hint="What should a viewer understand or do?">
                <textarea className={cn(textareaClass, 'min-h-[92px] text-[15px] leading-relaxed')} value={outcome} onChange={(e) => setOutcome(e.target.value)}
                  placeholder="Show how the product turns a week of content work into one on-brand workflow." />
              </Field>
              {/* Brand + product + audience are the quieter, secondary inputs. */}
              <div className="grid gap-x-5 gap-y-5 border-t border-ds-subtle pt-5 sm:grid-cols-2">
                <Field label="Brand" hint={activeBrand?.name ? `Colors, logo, and voice from ${activeBrand.name}.` : 'Colors, logo, and voice pull from Brand Vault.'}>
                  <Dropdown value={activeBrandId ?? ''} onChange={(v) => setActiveBrandId(v || null)} disabled={brandsLoading}
                    placeholder="Select a brand…"
                    options={[{ value: '', label: 'No brand — describe manually' }, ...brands.map((b) => ({ value: b.brandId, label: b.name }))]} />
                </Field>
                <Field label="Product name" hint="Optional — falls back to the brand.">
                  <input className={inputClass} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Insturix" />
                </Field>
                <Field label="Audience" hint="Optional.">
                  <input className={inputClass} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="SaaS founders, agencies" />
                </Field>
              </div>
            </div>
          </Band>

          <Band n="02" title="References" tag="Optional"
            desc="A clip for the look, a doc for the truth. We match the pacing of the first and explain from the second.">
            <div className="grid gap-3 sm:grid-cols-2">
              <RefCard kicker="Look" title="Reference video" blurb="Drop a clip whose pacing & feel we should match.">
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
              </RefCard>

              <RefCard kicker="Topic" title="Source doc" blurb="Paste a PDF, page, or notes we should explain from.">
                {sourceDocName ? (
                  <Pill icon={<FileText size={13} className="text-gold" />} label={`${sourceDocName} · ${sourceMaterial.length.toLocaleString()} chars`} onRemove={clearDoc} />
                ) : (
                  <DropZone busy={ingestDoc.isPending} icon={<Upload size={14} />} label="Upload PDF, DOCX, PPTX, or TXT"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md" onFile={(f) => uploadDoc(f)} tall />
                )}
              </RefCard>
            </div>
          </Band>

          <Band n="03" title="Shape"
            desc="The frame it lives in. Length is bounded to your source; aspect follows the platform you're posting to.">
            <div className="flex flex-wrap gap-x-10 gap-y-5">
              <Field label="Length" group>
                <Seg options={DURATIONS.map((d) => ({ id: String(d), label: `${d}s` }))} value={String(durationSec)} onPick={(v) => setDurationSec(Number(v))} />
              </Field>
              <Field label="Aspect" group>
                <Seg options={ASPECTS.map((a) => ({ id: a.id, label: a.label }))} value={aspectRatio} onPick={(v) => setAspectRatio(v as Aspect)} />
              </Field>
            </div>
          </Band>

          <div className="mt-2 flex items-center gap-4 border-t border-ds-subtle pt-7">
            <Btn variant="primary" size="lg" onClick={generateScript} disabled={planMutation.isPending || !canBrief}>
              {planMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing the script…</> : <>Write the script <ArrowRight size={15} /></>}
            </Btn>
            <div className="ml-auto text-right">
              <p className="text-[13px] text-ds-muted">Script draft · <span className="font-semibold text-gold">1 credit</span></p>
              <Mono size="8" className="mt-1 block text-ds-faint">Render billed at step 03</Mono>
            </div>
          </div>
        </div>
      )}

      {screen === 'script' && plan && (
        <div className="flex flex-col">
          <div className="mb-2 rounded-card border border-ds-subtle bg-surface-raised p-4">
            <Mono size="8" className="text-ds-muted">The video</Mono>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ds-secondary">{plan.message}</p>
          </div>

          {scenes.map((scene) => {
            // A music beat is a deliberate voice-silent scene (music + visuals carry it). Show it as such so the
            // empty box reads as intentional, not broken — typing a line turns it back into a spoken scene.
            const silent = scene.audioTreatment === 'music_beat' && !scene.narration.trim();
            return (
              <Band key={scene.index} n={String(scene.index + 1).padStart(2, '0')} title={scene.title} active
                tag={`${scene.form} · ${scene.durationSec}s${silent ? ' · ♪ MUSIC BEAT' : ''}`}>
                <textarea className={textareaClass} value={scene.narration} onChange={(e) => updateScene(scene.index, e.target.value)}
                  placeholder={silent
                    ? 'Music beat — visuals + music carry this scene. Type to add a voiceover…'
                    : 'What the voiceover says in this scene…'} rows={2} />
              </Band>
            );
          })}

          <div className="border-t border-ds-subtle pt-7">
            <Field label="Voice">
              <div className="flex items-center gap-2">
                <Mic size={14} className="shrink-0 text-ds-muted" />
                <div className="min-w-0 flex-1">
                  <Dropdown value={voice} onChange={setVoice}
                    options={VO_VOICES.map((v) => ({ value: v.id, label: `${v.label} · ${v.accent}`, sublabel: v.description }))} />
                </div>
              </div>
            </Field>
          </div>

          <div className="mt-5">
            <ChatEdit
              reply={chatReply}
              input={chatInput}
              setInput={setChatInput}
              pending={chatEdit.isPending}
              onSend={() => sendChatEdit()}
              hint="Change the script, look, voice, or pacing — e.g. “punchier hook”, “make scene 2 bolder”, “use a British voice”. Look/voice changes apply when you render."
            />
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-ds-subtle pt-7">
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
        <div className="flex flex-col items-center gap-6 rounded-card border border-ds-subtle bg-surface-raised px-8 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
          <div>
            <Mono size="8" className="text-gold">{s?.status === 'queued' ? 'Queued' : 'Crafting'}</Mono>
            <p className="mt-2 text-[17px] font-bold tracking-tight text-ds-primary">{renderStageLabel(s?.status, s?.progress ?? 0)}</p>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ds-muted">The craft agent designs each scene, then renders with voiceover. This takes a few minutes.</p>
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
      )}

      {screen === 'result' && (
        <div className="flex flex-col gap-4">
          {s?.outputUrl ? (
            <video src={s.outputUrl} controls className="w-full rounded-card border border-ds-subtle bg-black shadow-[0_20px_60px_rgba(0,0,0,0.4)]" />
          ) : (
            <div className="rounded-card border border-ds-subtle bg-surface-raised p-12 text-center text-ds-muted">Preparing your video…</div>
          )}
          <div className="flex items-center justify-between">
            <Mono size="8" className="text-ds-faint">{typeof s?.costUsd === 'number' ? `Render cost ≈ $${s.costUsd.toFixed(3)}` : ''}</Mono>
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

function Masthead({ subtitle, brandName, productName, stepIndex }: { subtitle: string; brandName?: string; productName: string; stepIndex: number }) {
  const headlineBrand = (brandName || productName).trim();
  return (
    <header className="mb-9 border-b border-ds-emphasis pb-7">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-[#D4A652] shadow-[0_0_10px_2px_rgba(212,166,82,0.55)]" />
        <Mono size="9" className="text-[#E0B86A]">Explainer Studio · {subtitle}</Mono>
      </div>
      <h1 className="max-w-[15ch] text-[38px] font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-[50px]">
        An explainer{headlineBrand ? <> for <span className="text-[#E0B86A] [text-shadow:0_0_28px_rgba(212,166,82,0.35)]">{headlineBrand}</span></> : ' for your product'}, in your brand’s voice.
      </h1>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <BrandChip name={brandName} />
        <div className="flex items-center gap-2.5">
          {STEPS.map((step, i) => (
            <span key={step.id} className="flex items-center gap-2.5">
              {i > 0 && <span className="font-mono text-[10px] text-ds-faint">/</span>}
              <span className={cn('font-mono text-[10px] uppercase tracking-[0.12em]',
                i === stepIndex ? 'text-gold' : i < stepIndex ? 'text-ds-secondary' : 'text-ds-dim')}>{step.label}</span>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function BrandChip({ name }: { name?: string }) {
  const letter = (name || '·').trim().charAt(0).toUpperCase() || '·';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ds-emphasis bg-surface-raised py-1 pl-1 pr-3 text-[12.5px] text-ds-secondary">
      <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-gold/15 text-[10px] font-bold text-gold">{letter}</span>
      {name || 'No brand'}
    </span>
  );
}

function Band({ n, title, tag, desc, active, children }: {
  n: string; title: string; tag?: string; desc?: React.ReactNode; active?: boolean; children: React.ReactNode;
}) {
  return (
    <section className="relative grid grid-cols-[44px_1fr] border-t border-ds-subtle py-8 first:border-t-0">
      {active && <span className="absolute left-0 top-8 h-6 w-[2px] rounded-full bg-[#D4A652] shadow-[0_0_8px_rgba(212,166,82,0.5)]" />}
      <div className={cn('pt-0.5 font-mono', active ? 'text-[14px] font-bold text-[#E0B86A]' : 'text-[12px] text-ds-faint')}>{n}</div>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[23px] font-bold leading-tight tracking-[-0.025em]">{title}</h2>
          {tag && <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-ds-muted">{tag}</span>}
        </div>
        {desc && <p className="mb-5 mt-2 max-w-[52ch] text-[14px] leading-relaxed text-ds-secondary">{desc}</p>}
        {!desc && <div className="mt-4" />}
        {children}
      </div>
    </section>
  );
}

function RefCard({ kicker, title, blurb, children }: { kicker: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-ds-subtle bg-surface-canvas p-4">
      <div>
        <Mono size="8" className="text-gold">{kicker}</Mono>
        <p className="mt-1.5 text-[13.5px] font-semibold text-ds-primary">{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ds-faint">{blurb}</p>
      </div>
      {children}
    </div>
  );
}

/** Token-styled dark dropdown — replaces the native <select> (whose OS option list renders white and
 *  breaks the dark theme). Warm-dark surfaces, gold-marked selection, outside-click + Esc to close. */
function Dropdown({ value, onChange, options, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; sublabel?: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={cn('flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-surface-well px-3.5 text-left text-[14px] transition-colors focus-visible:outline-hidden',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          open ? 'border-gold' : 'border-ds-subtle hover:border-ds-emphasis')}>
        <span className={cn('truncate', selected ? 'text-ds-primary' : 'text-ds-dim')}>{selected?.label ?? placeholder ?? 'Select…'}</span>
        <ChevronDown size={15} className={cn('shrink-0 transition-transform', open ? 'rotate-180 text-gold' : 'text-ds-muted')} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-lg border border-ds-emphasis bg-surface-raised p-1 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.75)]">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors',
                  on ? 'bg-gold/10 text-gold' : 'text-ds-secondary hover:bg-surface-well hover:text-ds-primary')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{o.label}</span>
                  {o.sublabel && <span className="mt-0.5 block truncate text-[11px] text-ds-faint">{o.sublabel}</span>}
                </span>
                {on && <Check size={14} className="shrink-0 text-gold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children, group }: { label: string; hint?: React.ReactNode; children: React.ReactNode; group?: boolean }) {
  const inner = (
    <>
      <Mono size="9" className="text-ds-secondary">{label}</Mono>
      {children}
      {hint && <span className="text-[11px] text-ds-faint">{hint}</span>}
    </>
  );
  // A <label> forwards clicks to its first control — which breaks a group of
  // buttons (Seg). Use a plain div for those; keep <label> for single inputs.
  return group
    ? <div className="flex flex-col items-start gap-2">{inner}</div>
    : <label className="flex flex-col gap-2">{inner}</label>;
}

function Seg({ options, value, onPick }: { options: Array<{ id: string; label: string }>; value: string; onPick: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-button border border-ds-emphasis bg-surface-deeper p-1">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onPick(o.id)}
          className={cn('rounded-[6px] px-3 py-1.5 font-mono text-[11px] tracking-wide transition-all focus-visible:outline-hidden',
            value === o.id
              ? 'bg-[#D4A652] font-bold text-[#120f09] shadow-[0_1px_12px_rgba(212,166,82,0.4)]'
              : 'text-ds-secondary hover:bg-surface-well hover:text-ds-primary')}>
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
      <p className="mb-3 mt-1.5 text-[12px] text-ds-muted">{hint}</p>
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
