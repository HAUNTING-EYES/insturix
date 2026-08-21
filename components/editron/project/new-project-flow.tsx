'use client';

/**
 * New Project Flow — Editron "start screen".
 *
 * Faithful React port of the founder-finalized design (editron-prompt-flow.html). A state machine:
 *   idle → { upload | generate → { script | saas } } → onair(commit)
 * Studio-console language (warm-dark, gold-only accent, JetBrains Mono labels, watermark + status LED).
 * All CSS is SCOPED under `.enp` so the design's generic class names can't collide with global styles.
 *
 * Wiring (this is the Editron dashboard landing):
 *   - SCRIPT → real create endpoint, navigate to the new project.
 *   - SAAS   → real saas-explainer generate endpoint (inline), navigate to the returned project.
 *   - UPLOAD → hands off to the existing footage uploader at /dashboard/editron/upload.
 *              (Phase 2b will inline the auto-edit uploader here.)
 *   - "Projects" (top-right) → the same route to reopen existing projects.
 * Backend endpoints are reused as-is (UI only).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveBrandIdFromStorage } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';
import { useAcceptedBrandVaultBrands } from '@/components/dashboard/BrandVault/useBrandVault';
import { useFootageAutoEdit } from '@/hooks/editron/use-footage-auto-edit';
import { collectFootageFiles } from '@/components/editron/project/footage-selection';
import { AutoEditDialog, type AutoEditOptions } from '@/components/editron/project/auto-edit-dialog';
import { FootageBatchIntakeDialog } from '@/components/editron/project/footage-batch-intake-dialog';
import { AutoEditProcessing } from '@/components/editron/project/auto-edit/auto-edit-processing';
import { isAssistLaneVisible } from '@/lib/editron/services/assist-lane-flag';

type Screen = 'idle' | 'upload' | 'generate' | 'script' | 'onair';

const META: Record<Screen, { h: string; sub: string; bc: string; wm: string; st: string; air: boolean }> = {
  idle: { h: 'What are we<br/><span>making?</span>', sub: '', bc: 'Editron / New project', wm: 'MAKE', st: 'STANDBY', air: false },
  upload: { h: 'Drop your<br/><span>footage.</span>', sub: 'Editron auto-edits your raw clips into a first cut.', bc: 'New project / <b>Upload</b>', wm: 'REEL', st: 'STANDBY', air: false },
  generate: { h: 'What are we<br/><span>generating?</span>', sub: '', bc: 'New project / <b>Generate</b>', wm: 'GEN', st: 'STANDBY', air: false },
  script: { h: 'Paste your<br/><span>script.</span>', sub: 'Bring the words — Editron cuts the video to them.', bc: 'New project / Generate / <b>Script &#8594; video</b>', wm: 'SCRIPT', st: 'STANDBY', air: false },
  onair: { h: '', sub: '', bc: 'Editron / <b>On air</b>', wm: '', st: 'ON AIR', air: true },
};
const BACK: Record<Screen, Screen> = { idle: 'idle', upload: 'idle', generate: 'idle', script: 'generate', onair: 'idle' };

const CSS = `
.enp{--bg:#0B0B0A;--surface:#0F0F0E;--raised:#131312;--well:#1B1A18;--border:#1C1B19;--bs:#282724;
  --text:#ECE9E1;--soft:#B5B2A8;--muted:#7A776E;--dim:#5F5E5A;--faint:#454340;--gold:#D4A652;--goldH:#C49840;--green:#5EC97E;--red:#E05252;
  --film:cubic-bezier(0.16,1,0.3,1);--tact:cubic-bezier(0.34,1.6,0.5,1);
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--text);line-height:1.5}
.enp *,.enp *::before,.enp *::after{margin:0;padding:0;box-sizing:border-box}
.enp .m{font-family:'JetBrains Mono',monospace}
.enp input,.enp select,.enp textarea,.enp button{font-family:inherit}
.enp .screen{max-width:1120px;margin:0 auto;height:600px;border:1px solid var(--border);border-radius:16px;background:var(--bg);position:relative;overflow:hidden}
.enp .wm{position:absolute;pointer-events:none;font-weight:800;line-height:.7;letter-spacing:-.06em;right:-3%;bottom:-24%;font-size:46vh;color:rgba(236,233,225,.035);transition:opacity .5s var(--film),transform .6s var(--film)}
.enp .top{position:absolute;top:22px;left:26px;right:26px;display:flex;justify-content:space-between;align-items:center;z-index:6}
.enp .bc{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);display:flex;gap:8px;align-items:center}
.enp .bc b{color:var(--gold);font-weight:500}
.enp .topr{display:flex;align-items:center;gap:12px}
.enp .projlink{background:transparent;border:1px solid var(--border);border-radius:5px;padding:4px 10px;color:var(--soft);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:border-color .2s,color .2s}
.enp .projlink:hover{border-color:rgba(212,166,82,.4);color:var(--text)}
.enp .status{display:inline-flex;align-items:center;gap:7px;padding:4px 9px;border:1px solid var(--border);border-radius:5px}
.enp .status .led{width:6px;height:6px;border-radius:50%;background:var(--gold)}
.enp .status.air{border-color:var(--red)}.enp .status.air .led{background:var(--red);animation:enpPl 1.4s infinite}
.enp .beta{display:inline-flex;align-items:center;padding:4px 10px;border:1px solid var(--gold);border-radius:999px;background:rgba(212,166,82,.10);color:var(--gold);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;line-height:1}
.enp .betabar{max-width:1120px;margin:0 auto 12px;display:flex;align-items:center;gap:10px;padding:9px 16px;border:1px solid rgba(212,166,82,.22);border-radius:10px;background:rgba(212,166,82,.07)}
.enp .betabar .tag{flex:0 0 auto;display:inline-flex;align-items:center;padding:2px 8px;border:1px solid var(--gold);border-radius:999px;color:var(--gold);font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;line-height:1}
.enp .betabar .msg{font-size:12px;color:var(--soft);line-height:1.4}
.enp .betabar .x{margin-left:auto;flex:0 0 auto;background:transparent;border:none;color:var(--muted);font-size:16px;line-height:1;cursor:pointer;padding:0 2px;transition:color .2s}
.enp .betabar .x:hover{color:var(--text)}
@keyframes enpPl{0%,100%{opacity:1}50%{opacity:.3}}
.enp .body{position:absolute;inset:0;padding:74px 40px 40px;display:flex;flex-direction:column;z-index:4}
.enp .hero{flex:0 0 auto}
.enp .hero .h{font-weight:800;font-size:clamp(38px,6.4vw,76px);letter-spacing:-.045em;line-height:.94;transition:opacity .4s var(--film)}
.enp .hero .h span{color:var(--gold)}
.enp .hero .sub{color:var(--soft);font-size:15px;margin-top:14px;max-width:52ch;opacity:0;height:0;transition:opacity .4s var(--film)}
.enp .screen[data-s="upload"] .hero .sub,.enp .screen[data-s="script"] .hero .sub{opacity:1;height:auto}
.enp .panels{flex:1;position:relative;margin-top:26px;min-height:0}
.enp .panel{position:absolute;inset:0;opacity:0;pointer-events:none;transform:translateY(14px);transition:opacity .35s var(--film),transform .4s var(--film)}
.enp .panel.on{opacity:1;pointer-events:auto;transform:none}
.enp .back{position:absolute;bottom:40px;left:40px;z-index:7;cursor:pointer;background:transparent;border:1px solid var(--border);border-radius:6px;padding:7px 12px;color:var(--soft);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;opacity:0;pointer-events:none;transition:opacity .3s}
.enp .screen:not([data-s="idle"]) .back{opacity:1;pointer-events:auto}
.enp .doors{position:absolute;left:0;right:0;bottom:0;display:flex;border:1px solid var(--bs);border-radius:13px;overflow:hidden;height:120px}
.enp .door{flex:1;position:relative;display:flex;align-items:center;gap:18px;padding:0 28px;cursor:pointer;transition:flex .45s var(--tact),background .3s var(--film);background:transparent;border:none;text-align:left;color:inherit}
.enp .door.g{border-left:1.5px solid var(--gold)}
.enp .door::before{content:'';position:absolute;inset:0;opacity:.5;pointer-events:none}
.enp .door.u::before{background-image:radial-gradient(circle,var(--bs) 1px,transparent 1px);background-size:16px 16px;-webkit-mask-image:linear-gradient(90deg,transparent,#000);mask-image:linear-gradient(90deg,transparent,#000)}
.enp .door.g::before{background-image:radial-gradient(circle,rgba(212,166,82,.18) 1px,transparent 1px);background-size:22px 22px;opacity:.3}
.enp .door .mo{font-size:26px;color:var(--dim);position:relative}
.enp .door.g .mo{color:var(--gold)}
.enp .door .tx{position:relative}
.enp .door .nm{font-weight:800;font-size:26px;letter-spacing:-.025em}
.enp .door.g .nm{color:var(--gold)}
.enp .door .dl{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:3px}
.enp .door .go{position:absolute;right:26px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);opacity:0;transform:translateX(-6px);transition:all .3s var(--film)}
.enp .door:hover{flex:1.5;background:var(--surface)}
.enp .door:hover .go{opacity:1;transform:none}
.enp .doors:hover .door:not(:hover){opacity:.55}
.enp .recent{position:absolute;top:0;left:0;right:0}
.enp .recent .rhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.enp .recent .rlabel{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.enp .recent .rall{background:transparent;border:none;color:var(--gold);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.enp .recent .rall:hover{color:var(--goldH)}
.enp .recent .rrow{display:flex;flex-wrap:wrap;gap:10px}
.enp .recent .rcard{display:flex;align-items:center;gap:9px;padding:7px 12px 7px 7px;border:1px solid var(--border);border-radius:8px;background:var(--raised);cursor:pointer;color:inherit;transition:border-color .2s var(--film)}
.enp .recent .rcard:hover{border-color:rgba(212,166,82,.35)}
.enp .recent .rthumb{width:34px;height:22px;border-radius:4px;background:#050505 center/cover no-repeat;border:1px solid var(--border);flex-shrink:0}
.enp .recent .rname{font-size:12px;color:var(--text);max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.enp .panel.up{display:flex;flex-direction:column}
.enp .drop{position:relative;flex:1;min-height:0;border:2px dashed var(--bs);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;cursor:pointer;transition:border-color .3s;background:transparent;color:inherit;width:100%}
.enp .drop:hover{border-color:var(--gold)}
.enp .drop .ar{width:48px;height:48px;border-radius:11px;border:1px solid var(--gold);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:22px}
.enp .drop .t{font-weight:700;font-size:19px}
.enp .drop .s{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.enp .types{display:flex;flex-direction:column;border-top:1px solid var(--border)}
.enp .type{display:flex;align-items:center;gap:20px;padding:20px 6px;border-bottom:1px solid var(--border);cursor:pointer;transition:padding-left .3s var(--tact),background .2s;background:transparent;border-left:none;border-right:none;border-top:none;width:100%;text-align:left;color:inherit}
.enp .type:hover{padding-left:16px}
.enp .type .ix{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--dim);width:24px}
.enp .type .nm{font-weight:800;font-size:clamp(26px,3.6vw,40px);letter-spacing:-.035em;color:var(--soft);transition:color .25s}
.enp .type .ds{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;color:var(--muted);margin-left:auto}
.enp .type:hover .nm{color:var(--gold)}.enp .type:hover .ix{color:var(--gold)}
.enp .type.soon{opacity:.4;cursor:not-allowed}.enp .type.soon:hover{padding-left:6px}
.enp .type.soon .ds{color:var(--faint)}
.enp .form{display:flex;flex-direction:column;gap:12px;max-width:640px}
.enp .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.enp .fld{display:block}
.enp .fld .l{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px}
.enp .in{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;color:var(--text);font-size:13.5px;outline:none}
.enp .in:focus{border-color:var(--gold)}
.enp .seg{display:flex;gap:4px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:3px}
/* border reserved on the base rule so selecting a mode never shifts layout by 1px */
.enp .seg b{flex:1;text-align:center;padding:7px 4px;border:1px solid transparent;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.06em;color:var(--soft);cursor:pointer;font-weight:400;transition:color .2s,border-color .2s,background .2s}
.enp .seg b:hover{color:var(--text);border-color:var(--bs)}
/* gold here follows the console's language (border + text + 10% tint, as .beta/.drop .ar)
   — a solid gold fill outshouted the drop zone, which is the actual primary action */
.enp .seg b.on{background:rgba(212,166,82,.10);border-color:var(--gold);color:var(--gold);font-weight:500}
.enp .fld .s{display:block;font-size:12px;line-height:1.5;color:var(--soft);margin-top:7px}
.enp .ctx{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.enp .ctx .sw{display:flex;gap:5px}.enp .ctx .sw i{width:22px;height:22px;border-radius:4px;border:1px solid var(--border)}
.enp .err{color:var(--red);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.04em}
.enp .row-act{display:flex;align-items:center;gap:12px;margin-top:4px}
.enp .gen-btn{display:inline-flex;align-items:center;gap:9px;padding:13px 24px;border-radius:8px;border:1px solid var(--gold);background:var(--gold);color:var(--bg);font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;cursor:pointer;transition:background .2s}
.enp .gen-btn:hover{background:var(--goldH)}
.enp .gen-btn:disabled{opacity:.55;cursor:wait}
.enp .gen-btn .d{width:9px;height:9px;border-radius:50%;background:var(--red)}
.enp .onair{position:absolute;inset:0;display:flex;flex-direction:column;gap:14px}
.enp .nowbar{display:flex;justify-content:space-between;align-items:center;padding:11px 15px;border:1px solid var(--bs);border-radius:8px;background:var(--raised)}
.enp .nowbar .l{display:flex;gap:12px;align-items:center;min-width:0}
.enp .monitor{flex:1;border:2px solid var(--bs);border-radius:10px;position:relative;overflow:hidden;background:var(--bg);box-shadow:inset 0 0 70px rgba(0,0,0,.6)}
.enp .monitor .tl{position:absolute;left:18px;right:18px;bottom:22px}
.enp .monitor .clips{display:flex;gap:4px;margin-bottom:9px}
.enp .monitor .clips i{height:38px;border-radius:3px;background:var(--well);border:1px solid var(--border)}
.enp .monitor .rec{position:absolute;top:14px;left:16px;display:inline-flex;gap:6px;align-items:center}
.enp .monitor .ph{position:relative;height:2px;background:var(--border)}.enp .monitor .ph i{position:absolute;left:36%;top:-6px;width:2px;height:14px;background:var(--gold)}
.enp .monitor .core{position:absolute;left:20px;right:20px;top:44px;bottom:74px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center}
.enp .monitor .core .ring{width:38px;height:38px;border-radius:50%;border:2px solid var(--bs);border-top-color:var(--gold);animation:enpSpin .9s linear infinite}
.enp .monitor .core .pt{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.03em;color:var(--text);max-width:88%;line-height:1.4}
.enp .monitor .core .sub{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.enp .monitor .clips i{position:relative;overflow:hidden}
.enp .monitor .clips.live i::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(212,166,82,.16),transparent);transform:translateX(-100%);animation:enpSweep 1.5s ease-in-out infinite}
@keyframes enpSpin{to{transform:rotate(360deg)}}
@keyframes enpSweep{100%{transform:translateX(100%)}}
@media(max-width:640px){.enp .body{padding:70px 22px 30px}.enp .grid2{grid-template-columns:1fr}.enp .doors{flex-direction:column;height:auto}.enp .door{padding:18px 22px}.enp .door.g{border-left:none;border-top:1.5px solid var(--gold)}}
`;

function Seg({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <b key={o} className={value === o ? 'on' : undefined} onClick={() => onChange(o)}>{o}</b>
      ))}
    </div>
  );
}

const DUR_SEC: Record<string, number> = { '15s': 15, '30s': 30, '60s': 60 };

export default function NewProjectFlow() {
  const router = useRouter();
  const brandsQuery = useAcceptedBrandVaultBrands();
  const brands = brandsQuery.data ?? [];
  const footage = useFootageAutoEdit();
  const fileRef = useRef<HTMLInputElement>(null);

  const [screen, setScreen] = useState<Screen>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Director Mode (assist lane): the toggle renders only when the deploy flag is
  // on. The intake routes enforce the same flag server-side — hiding the toggle
  // alone is never the gate.
  const assistAvailable = isAssistLaneVisible();
  const [laneMode, setLaneMode] = useState<'auto' | 'assist'>('auto');

  // Beta notice — dismissible, remembered per browser. Starts hidden until the
  // effect confirms it wasn't dismissed (SSR-safe: no localStorage read on render).
  const [betaBar, setBetaBar] = useState(false);
  useEffect(() => {
    try { setBetaBar(localStorage.getItem('editron_beta_dismissed') !== '1'); }
    catch { setBetaBar(true); }
  }, []);
  const dismissBeta = useCallback(() => {
    setBetaBar(false);
    try { localStorage.setItem('editron_beta_dismissed', '1'); } catch { /* ignore */ }
  }, []);

  // Footage auto-edit failed → drop back to the upload panel with the error.
  useEffect(() => {
    if (footage.error) { setScreen('upload'); setError(footage.error); }
  }, [footage.error]);

  // Recent projects — shown on the idle screen so existing work is reachable from the front door.
  const [recent, setRecent] = useState<{ projectId: string; name: string; thumbnail?: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/services/editron/projects/list')
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => { if (!cancelled) setRecent(Array.isArray(d?.projects) ? d.projects : []); })
      .catch(() => { /* list unavailable — hide the recent strip */ });
    return () => { cancelled = true; };
  }, []);

  // intake state
  const [scriptText, setScriptText] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [scriptAspect, setScriptAspect] = useState('16:9');
  const [brandId, setBrandId] = useState('');

  const [projName, setProjName] = useState('untitled');
  const [pendingFootageFiles, setPendingFootageFiles] = useState<File[]>([]);

  const go = useCallback((s: Screen) => { setError(null); setScreen(s); }, []);

  // SCRIPT → real create endpoint, then navigate to the project.
  const commitScript = useCallback(async () => {
    if (busy) return;
    const name = scriptName.trim() || 'untitled_script';
    setBusy(true); setError(null);
    setProjName(name); setScreen('onair');
    try {
      const res = await fetch('/api/services/editron/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // scriptText + scriptAspect were collected by this form and then
        // silently dropped from this POST — the door's whole promise.
        body: JSON.stringify({
          name,
          brandId: getActiveBrandIdFromStorage(),
          aspectRatio: scriptAspect,
          initialScript: scriptText.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('Could not create the project.');
      const data = await res.json();
      router.push(`/dashboard/editron/project/${data.projectId}`);
    } catch (e) {
      setBusy(false); setScreen('script');
      setError(e instanceof Error ? e.message : 'Could not create the project.');
    }
  }, [busy, scriptName, scriptText, scriptAspect, router]);


  // UPLOAD → inline footage auto-edit. Reopen existing projects → the dashboard/upload route.
  const goProjects = useCallback(() => router.push('/dashboard/editron/projects'), [router]);
  const startFootageFiles = useCallback((files: File[], options: AutoEditOptions = {}) => {
    if (footage.running || files.length === 0) return;
    setPendingFootageFiles([]);
    setError(null);
    setProjName(files.length === 1 ? files[0].name : `${files.length} files`);
    setScreen('onair');
    footage.startMany(files, {
      ...options,
      ...(assistAvailable && laneMode === 'assist' ? { editMode: 'assist' as const } : {}),
    });
  }, [footage, assistAvailable, laneMode]);
  const cancelPendingFootage = useCallback(() => {
    setPendingFootageFiles([]);
    setScreen('upload');
  }, []);
  const onSingleFootageConfirm = useCallback((file: File, options: AutoEditOptions) => {
    startFootageFiles([file], options);
  }, [startFootageFiles]);
  const onBatchFootageConfirm = useCallback((options: AutoEditOptions) => {
    startFootageFiles(pendingFootageFiles, options);
  }, [pendingFootageFiles, startFootageFiles]);
  const onFootageFiles = useCallback((selection: FileList | File[] | null | undefined) => {
    if (footage.running) return;
    const { files, rejected } = collectFootageFiles(selection);
    if (files.length === 0) {
      setError(rejected.length > 0 ? 'Select video or image footage.' : null);
      return;
    }
    setError(null);
    setPendingFootageFiles(files);
    setScreen('upload');
  }, [footage.running]);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    onFootageFiles(e.dataTransfer.files);
  }, [onFootageFiles]);

  const m = META[screen];
  // Director lane changes what happens AFTER the scan, so every promise on the upload
  // screen has to change with it — otherwise the headline and the drop zone keep
  // advertising an automatic first cut that Director mode deliberately does not make.
  const directorLane = assistAvailable && laneMode === 'assist';
  const heroSub =
    screen === 'upload' && directorLane
      ? 'Editron scans every clip, then hands you the timeline to direct.'
      : m.sub;
  const pendingSingleVideo =
    pendingFootageFiles.length === 1 && pendingFootageFiles[0]?.type.startsWith('video/')
      ? pendingFootageFiles[0]
      : null;
  const pendingBatchFiles = pendingSingleVideo ? [] : pendingFootageFiles;

  // When the edit is on air, THIS screen is the auto-edit processing view — render it as
  // the page (same as /dashboard/editron/auto-edit/[projectId] does), NOT as a fixed overlay
  // on top of the console. Overlaying failed at the root: <body> is `position:relative` +
  // `overflow-x:clip`, so a portaled `fixed inset-0` never anchored to the viewport and the
  // console bled through underneath. One screen, normal flow — no overlap, no flash.
  if (screen === 'onair') {
    return (
      <AutoEditProcessing
        filename={projName}
        stageIndex={0}
        percent={/(analy|edit)/i.test(footage.progress) ? 20 : /regist/i.test(footage.progress) ? 14 : /upload/i.test(footage.progress) ? 8 : 4}
        done={false}
        logLines={footage.progress ? [footage.progress] : []}
        onSkip={goProjects}
      />
    );
  }

  return (
    <div className="enp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {betaBar && (
        <div className="betabar" role="status">
          <span className="tag">Beta</span>
          <span className="msg">Editron is in beta — output quality is still improving. Tell us what breaks.</span>
          <button type="button" className="x" aria-label="Dismiss beta notice" onClick={dismissBeta}>&times;</button>
        </div>
      )}
      <div className="screen" data-s={screen}>
        <div className="wm" style={{ opacity: m.wm ? undefined : 0 }}>{m.wm}</div>

        <div className="top">
          <div className="bc" dangerouslySetInnerHTML={{ __html: m.bc }} />
          <div className="topr">
            <button type="button" className="projlink" onClick={goProjects}>Projects</button>
            <span className="beta" title="Editron is in beta — output quality is still improving.">Beta</span>
            <div className={m.air ? 'status air' : 'status'}>
              <span className="led" />
              <span className="m" style={{ fontSize: 9, letterSpacing: '.1em', color: m.air ? 'var(--red)' : 'var(--gold)' }}>{m.st}</span>
            </div>
          </div>
        </div>

        <div className="body">
          <div className="hero">
            {m.h ? <div className="h" dangerouslySetInnerHTML={{ __html: m.h }} /> : null}
            <div className="sub">{heroSub}</div>
          </div>

          <div className="panels">
            {/* idle — recent projects + the two doors */}
            <div className={screen === 'idle' ? 'panel on' : 'panel'}>
              {recent.length > 0 && (
                <div className="recent">
                  <div className="rhead">
                    <span className="rlabel">Recent</span>
                    <button type="button" className="rall" onClick={goProjects}>View all &#8594;</button>
                  </div>
                  <div className="rrow">
                    {recent.slice(0, 6).map((p) => (
                      <button
                        key={p.projectId}
                        type="button"
                        className="rcard"
                        onClick={() => router.push(`/dashboard/editron/project/${p.projectId}`)}
                      >
                        <span className="rthumb" style={p.thumbnail ? { backgroundImage: `url(${p.thumbnail})` } : undefined} />
                        <span className="rname">{p.name || 'Untitled'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="doors">
                <button type="button" className="door u" onClick={() => go('upload')}>
                  <span className="mo">&#8615;</span>
                  <span className="tx"><span className="nm">Upload</span><span className="dl">01 &#183; bring footage</span></span>
                  <span className="go">Drop or browse &#8595;</span>
                </button>
                <button type="button" className="door g" onClick={() => go('generate')}>
                  <span className="mo">&#10022;</span>
                  <span className="tx"><span className="nm">Generate</span><span className="dl">02 &#183; from an idea</span></span>
                  <span className="go">Choose a type &#8594;</span>
                </button>
              </div>
            </div>

            {/* upload — inline footage auto-edit */}
            <div className={screen === 'upload' ? 'panel up on' : 'panel up'}>
              {assistAvailable ? (
                <label className="fld" style={{ marginBottom: 10 }}>
                  <span className="l">Editing mode</span>
                  <Seg
                    options={['Auto edit', 'Director']}
                    value={laneMode === 'assist' ? 'Director' : 'Auto edit'}
                    onChange={(v) => setLaneMode(v === 'Director' ? 'assist' : 'auto')}
                  />
                  {/* Shown for BOTH modes: the lanes differ only in what happens after the
                      scan, and the user has to be able to compare them BEFORE uploading. */}
                  <span className="s">
                    {directorLane
                      ? 'Scans everything, edits nothing. When the scan finishes you get the timeline plus a chat, and you direct every cut.'
                      : 'Scans everything, then cuts it into a first pass you can refine.'}
                  </span>
                </label>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="video/*,image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { onFootageFiles(e.target.files); e.target.value = ''; }}
              />
              <button
                type="button"
                className="drop"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
              >
                <span className="ar">&#8613;</span>
                <span className="t">Drop footage or browse</span>
                <span className="s">
                  {directorLane ? 'Editron scans your clips — you direct the cuts' : 'Editron cuts your raw clips automatically'}
                </span>
                {screen === 'upload' && error ? <span className="err" style={{ marginTop: 4 }}>{error}</span> : null}
              </button>
            </div>

            {/* generate — type list */}
            <div className={screen === 'generate' ? 'panel on' : 'panel'}>
              <div className="types">
                <button type="button" className="type" onClick={() => go('script')}>
                  <span className="ix">01</span><span className="nm">Script &#8594; video</span><span className="ds">you have a script</span>
                </button>
                <button type="button" className="type" onClick={() => router.push('/dashboard/editron/saas-explainer/studio')}>
                  <span className="ix">02</span><span className="nm">SaaS explainer</span><span className="ds">brand-driven explainer</span>
                </button>
                <div className="type soon"><span className="ix">03</span><span className="nm">Ad</span><span className="ds">soon</span></div>
                <div className="type soon"><span className="ix">04</span><span className="nm">UGC</span><span className="ds">soon</span></div>
                <div className="type soon"><span className="ix">05</span><span className="nm">Product demo</span><span className="ds">soon</span></div>
              </div>
            </div>

            {/* script intake */}
            <div className={screen === 'script' ? 'panel on' : 'panel'}>
              <div className="form">
                <label className="fld"><span className="l">Your script</span>
                  <textarea className="in" rows={4} placeholder="Paste or write your script&#8230;" value={scriptText} onChange={(e) => setScriptText(e.target.value)} />
                </label>
                <div className="grid2">
                  <label className="fld"><span className="l">Project name</span>
                    <input className="in" placeholder="untitled_script" value={scriptName} onChange={(e) => setScriptName(e.target.value)} />
                  </label>
                  <label className="fld"><span className="l">Aspect</span>
                    <Seg options={['16:9', '9:16', '1:1']} value={scriptAspect} onChange={setScriptAspect} />
                  </label>
                </div>
                {screen === 'script' && error ? <div className="err">{error}</div> : null}
                <div className="row-act">
                  <button type="button" className="gen-btn" onClick={commitScript} disabled={busy}>Create</button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {screen !== 'idle' ? (
          <button type="button" className="back" onClick={() => go(BACK[screen])}>&#9666; Back</button>
        ) : null}
      </div>
      <AutoEditDialog
        file={pendingSingleVideo}
        onConfirm={onSingleFootageConfirm}
        onCancel={cancelPendingFootage}
      />
      <FootageBatchIntakeDialog
        files={pendingBatchFiles}
        open={pendingBatchFiles.length > 0}
        onConfirm={onBatchFootageConfirm}
        onCancel={cancelPendingFootage}
      />
    </div>
  );
}