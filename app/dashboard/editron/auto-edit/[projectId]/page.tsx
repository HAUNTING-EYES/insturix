'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AutoEditProcessing,
  missingFootageBeatsFromScriptCoverage,
  type MissingFootageBeat,
} from '@/components/editron/project/auto-edit/auto-edit-processing';
import { uploadMediaFiles } from '@/components/editron/editor/version-7.0.0/utils/media-upload';
import {
  statusToStageIndex,
  stagePercent,
  isTerminalStatus,
  directingDescToStageIndex,
  TOTAL_STAGES,
} from '@/components/editron/project/auto-edit/auto-edit-stages';
import { canRescueToDirectorMode } from '@/lib/editron/services/assist-lane-predicates';

const DIRECTOR_MODE_ENABLED = process.env.NEXT_PUBLIC_DIRECTOR_MODE_ENABLED === 'true'
  || process.env.NEXT_PUBLIC_DIRECTOR_MODE_ENABLED === '1';

/* Full-screen auto-edit processing route. Polls the project's coarse
   autoEditStatus and drives the AutoEditProcessing screen from it, then
   opens the editor when the edit is ready.

   // TODO(backend): the status is coarse (`directing` covers cut/punch/
   caption/music/transition/graphics). When the director emits per-stage
   { stage, percent, logLine }, feed those here instead of statusToStageIndex. */

export default function AutoEditProcessingPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  const router = useRouter();

  const [status, setStatus] = useState<string | null>(null);
  const [filename, setFilename] = useState('your video');
  const [done, setDone] = useState(false);
  const [stageDesc, setStageDesc] = useState<string | null>(null);
  const [stagePct, setStagePct] = useState<number | null>(null);
  const [sourceUploadBatchId, setSourceUploadBatchId] = useState<string | null>(null);
  const [needsInput, setNeedsInput] = useState<{
    beats: MissingFootageBeat[];
    error?: string | null;
    busy?: boolean;
    actionMessage?: string | null;
  } | null>(null);
  const [pollGeneration, setPollGeneration] = useState(0);
  const stopped = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Director Mode rescue: a failed auto-edit that kept its scans + timeline can be
  // reopened in Director Mode for free instead of dead-ending.
  const [rescuable, setRescuable] = useState(false);
  const [rescuing, setRescuing] = useState(false);
  const [rescueError, setRescueError] = useState<string | null>(null);
  const rescueToDirectorMode = async () => {
    if (!projectId || rescuing) return;
    setRescuing(true);
    setRescueError(null);
    try {
      const res = await fetch('/api/services/editron/auto-edit/rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        router.push(`/dashboard/editron/project/${projectId}`);
        return; // keep the button in "Opening…" while the editor route loads
      }
      // Surface WHY the reopen failed instead of silently resetting the button. A
      // 409 (no longer rescuable / lost race), 403 (feature off) or 5xx must tell
      // the user, not strand them clicking a dead primary CTA.
      setRescueError(
        res.status === 409 ? 'This project can no longer be reopened in Director Mode.'
          : res.status === 403 ? 'Director Mode is not available right now.'
          : (typeof data?.error === 'string' && data.error) ? data.error
          : 'Could not reopen in Director Mode. Please try again.',
      );
      setRescuing(false);
    } catch {
      setRescueError('Network error. Could not reach the server. Please try again.');
      setRescuing(false);
    }
  };

  // Director Mode (assist lane): scans are cancellable with a refund of any charge.
  const [assistLane, setAssistLane] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelScan = async () => {
    if (!projectId || cancelling) return;
    if (!window.confirm('Cancel this scan? Any charge is refunded and the project closes.')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/services/editron/auto-edit/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        stopped.current = true;
        setStatus('scan_failed');
      } else if (res.status === 409 || data?.code === 'already_ready') {
        // The scan finished a beat before cancel landed — it's ready, not cancelled.
        // Let the poll open the editor instead of silently doing nothing.
        setStatus('ready_for_chat');
      }
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped.current) return;
      try {
        const res = await fetch(`/api/services/editron/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          const proj = data.project ?? data;
          if (proj?.title) setFilename(proj.title);
          if (typeof proj?.sourceUploadBatchId === 'string') setSourceUploadBatchId(proj.sourceUploadBatchId);
          const s: string | null = proj?.autoEditStatus ?? null;
          if (s) setStatus(s);
          if (proj?.editMode === 'assist') setAssistLane(true);
          setStageDesc(typeof proj?.autoEditStageDesc === 'string' ? proj.autoEditStageDesc : null);
          setStagePct(typeof proj?.autoEditStagePercent === 'number' ? proj.autoEditStagePercent : null);
          if (s === 'needs_input') {
            setNeedsInput({
              beats: missingFootageBeatsFromScriptCoverage(proj?.storylinePlan?.scriptCoverage),
              error: typeof proj?.autoEditError === 'string' ? proj.autoEditError : null,
            });
            setDone(false);
            stopped.current = true;
            return;
          }
          if (s === 'scan_failed') {
            // Director Mode: the scan failed and the charge was refunded. This
            // project never opens — render the refunded dead-end card below.
            setDone(false);
            stopped.current = true;
            return;
          }
          if (s === 'failed' && DIRECTOR_MODE_ENABLED && canRescueToDirectorMode(proj)) {
            // The auto edit failed but kept its scans + timeline — offer a free
            // reopen in Director Mode instead of dropping into a broken edit. Keep
            // polling (do NOT stop) so a later transition — a redelivery completing
            // the edit, or the project becoming non-rescuable — is reflected instead
            // of stranding the user on a stale rescue screen.
            setRescuable(true);
            setDone(false);
            timer = setTimeout(poll, 4000);
            return;
          }
          if (s === 'failed' && DIRECTOR_MODE_ENABLED) {
            // Failed and NOT rescuable (no usable substrate) — show an honest failure
            // card instead of dropping into an empty/half-broken editor. Flag off keeps
            // the legacy terminal push below, unchanged for production.
            setRescuable(false);
            setDone(false);
            stopped.current = true;
            return;
          }
          if (s && isTerminalStatus(s)) {
            setDone(true);
            stopped.current = true;
            timer = setTimeout(() => router.push(`/dashboard/editron/project/${projectId}`), 1400);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      timer = setTimeout(poll, 4000);
    };

    poll();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [pollGeneration, projectId, router]);

  // During `directing`, use the director's live per-step signal (real % + the
  // current action mapped to a fine stage). Otherwise the coarse status map.
  const directing = status === 'directing';
  const stageIndex = done
    ? TOTAL_STAGES - 1
    : directing && stageDesc
      ? directingDescToStageIndex(stageDesc)
      : statusToStageIndex(status);
  const percent = done ? 100 : directing && stagePct !== null ? stagePct : stagePercent(stageIndex, false);
  const logLines = directing && stageDesc ? [stageDesc] : [];
  const openEditor = () => projectId && router.push(`/dashboard/editron/project/${projectId}`);

  const setNeedsInputFeedback = (patch: Partial<NonNullable<typeof needsInput>>) => {
    setNeedsInput((current) => current ? { ...current, ...patch } : current);
  };

  const uploadAdditionalFootage = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (!projectId || !sourceUploadBatchId) {
      setNeedsInputFeedback({ error: 'This project is missing its upload batch reference. Reload and try again.' });
      return;
    }

    setNeedsInputFeedback({ busy: true, error: null, actionMessage: null });
    try {
      const upload = await uploadMediaFiles(files, { uploadBatchId: sourceUploadBatchId, projectId });
      if (upload.uploaded.length === 0) {
        const details = upload.failed.map((failure) => `${failure.filename}: ${failure.error}`).join('; ');
        throw new Error(details || 'No footage was uploaded.');
      }

      const response = await fetch('/api/services/editron/auto-edit/from-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadBatchId: sourceUploadBatchId, resumeCoverage: true }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; projectId?: string; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Could not resume the edit (HTTP ${response.status}).`);
      }
      if (payload.projectId !== projectId) {
        throw new Error('Coverage recovery returned a different project. The edit was not resumed.');
      }

      setNeedsInput(null);
      setStatus('analyzing');
      setStageDesc(`Analyzing ${upload.uploaded.length} new ${upload.uploaded.length === 1 ? 'asset' : 'assets'}`);
      setStagePct(null);
      stopped.current = true;
      setPollGeneration((generation) => generation + 1);
    } catch (error) {
      setNeedsInputFeedback({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setNeedsInputFeedback({ busy: false });
    }
  };

  const copyBeatText = async (beat: MissingFootageBeat, kind: 'film' | 'generate') => {
    const text = kind === 'film'
      ? [
          'Film or upload a shot for this script beat:',
          beat.scriptText && `Script: ${beat.scriptText}`,
          beat.visualIntent && `Required visual evidence: ${beat.visualIntent}`,
          'Keep the required action or subject clearly visible for the full usable shot.',
        ].filter(Boolean).join('\n')
      : [
          'Generate one clean video shot that can visibly support this script beat.',
          beat.scriptText && `Script context: ${beat.scriptText}`,
          beat.visualIntent && `The shot must visibly show: ${beat.visualIntent}`,
          'Do not add captions, logos, watermarks, or baked-in text. Keep the main action readable and temporally continuous.',
        ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setNeedsInputFeedback({
        error: null,
        actionMessage: kind === 'film'
          ? 'Film brief copied. Upload the captured shot here when ready.'
          : 'Generation prompt copied. Upload the generated shot here when ready.',
      });
    } catch {
      setNeedsInputFeedback({ error: 'Clipboard access failed. Please allow clipboard access and try again.' });
    }
  };

  if (status === 'scan_failed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <span className="text-xs uppercase tracking-widest text-red-400">Scan failed</span>
        <h1 className="max-w-md text-xl font-semibold text-white">
          We couldn&apos;t scan this footage — your credits were refunded.
        </h1>
        <p className="max-w-md text-sm text-neutral-400">
          This project can&apos;t be opened. Start a new project to try the footage again — nothing was charged.
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/editron')}
          className="mt-3 rounded-full border border-neutral-700 px-5 py-2 text-sm text-white hover:bg-neutral-900"
        >
          Back to Editron
        </button>
      </div>
    );
  }

  if (rescuable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <span className="text-xs uppercase tracking-widest text-amber-400">Auto-edit didn&apos;t finish</span>
        <h1 className="max-w-md text-xl font-semibold text-white">
          The automatic edit hit a snag — but everything was scanned.
        </h1>
        <p className="max-w-md text-sm text-neutral-400">
          Open it in Director Mode and direct the edit yourself in chat. Your footage is already laid out and analyzed — no extra charge.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void rescueToDirectorMode()}
            disabled={rescuing}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {rescuing ? 'Opening…' : 'Open in Director Mode'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard/editron')}
            className="rounded-full border border-neutral-700 px-5 py-2 text-sm text-white hover:bg-neutral-900"
          >
            Back to Editron
          </button>
        </div>
        {rescueError ? (
          <p className="mt-2 max-w-md text-sm text-red-400" role="alert">{rescueError}</p>
        ) : null}
      </div>
    );
  }

  if (status === 'failed' && DIRECTOR_MODE_ENABLED) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <span className="text-xs uppercase tracking-widest text-red-400">Edit failed</span>
        <h1 className="max-w-md text-xl font-semibold text-white">
          We couldn&apos;t finish this automatic edit.
        </h1>
        <p className="max-w-md text-sm text-neutral-400">
          Something went wrong while building your edit. Start a new project to try again.
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/editron')}
          className="mt-3 rounded-full border border-neutral-700 px-5 py-2 text-sm text-white hover:bg-neutral-900"
        >
          Back to Editron
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        className="hidden"
        onChange={uploadAdditionalFootage}
      />
      <AutoEditProcessing
        filename={filename}
        stageIndex={stageIndex}
        percent={percent}
        done={done}
        logLines={logLines}
        onSkip={openEditor}
        onOpenEditor={openEditor}
        needsInput={needsInput ?? undefined}
        onUploadFootage={() => fileInputRef.current?.click()}
        onCopyFilmBrief={(beat) => void copyBeatText(beat, 'film')}
        onCopyGenerationPrompt={(beat) => void copyBeatText(beat, 'generate')}
      />
      {assistLane && !done && !needsInput ? (
        <button
          type="button"
          onClick={() => void cancelScan()}
          disabled={cancelling}
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-neutral-700 bg-black/70 px-4 py-1.5 text-xs text-neutral-300 backdrop-blur hover:bg-neutral-900 disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel scan (refunds any charge)'}
        </button>
      ) : null}
    </>
  );
}
