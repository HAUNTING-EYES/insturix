'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mic, Square, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onUploaded: (url: string) => void;
  disabled?: boolean;
  /** Used in the spoken-consent line so the recording carries verbal consent. */
  subjectName?: string;
}

type QualityLevel = 'good' | 'warn' | 'bad';

interface SampleQuality {
  durationSec: number;
  snrDb: number;
  rmsDb: number;
  peak: number;
  level: QualityLevel;
  notes: string[];
}

function consentScript(subjectName?: string): string {
  const who = subjectName?.trim() || '[your name]';
  return `I, ${who}, consent to having my voice cloned and used to generate avatar videos. `
    + `I'm speaking clearly, at a natural pace, in a quiet room.`;
}

// Record a voice sample in the browser, check it's actually usable, capture spoken +
// explicit consent, then upload. The stored URL becomes audio.voiceReferenceUrl —
// the voice Chatterbox clones from.
export function VoiceRecorder({ onUploaded, disabled, subjectName }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<SampleQuality | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);

  async function start() {
    setError(null);
    reset();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot record audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        blobRef.current = blob;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        void runAnalysis(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Microphone access was blocked. Allow mic permission and try again.');
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function runAnalysis(blob: Blob) {
    setAnalyzing(true);
    try {
      setQuality(await analyzeVoiceSample(blob));
    } catch {
      // If analysis fails (e.g., codec the browser can't decode), don't block — let the user upload.
      setQuality(null);
    } finally {
      setAnalyzing(false);
    }
  }

  async function useRecording() {
    const blob = blobRef.current;
    if (!blob) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', blob, `recording.${extForType(blob.type)}`);
      const response = await fetch('/api/avatar-vault/voice-uploads', { method: 'POST', credentials: 'include', body: form });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; asset: { url: string } }
        | { ok: false; error?: { message?: string } }
        | null;
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && payload.ok === false ? payload.error?.message : undefined;
        throw new Error(message ?? `Voice upload failed (${response.status}).`);
      }
      onUploaded(payload.asset.url);
    } catch (uploadErr) {
      setError(uploadErr instanceof Error ? uploadErr.message : 'Voice upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    blobRef.current = null;
    setQuality(null);
    setConsent(false);
    setError(null);
  }

  const busy = disabled || uploading;
  const blocked = quality?.level === 'bad';
  const canUse = Boolean(previewUrl) && !analyzing && !blocked && consent && !uploading;

  return (
    <div className="rounded-lg border border-[#293034] bg-[#0F1213] px-3 py-2.5">
      {/* read-aloud script */}
      <div className="rounded-md border border-[#293034] bg-[#0B0E0F] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6C7570]">Read this aloud</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#D7D2C4]">“{consentScript(subjectName)}”</p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#74D6C6] px-3 text-xs font-semibold text-[#E7FFFB] hover:bg-[#12302B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mic size={14} /> {previewUrl ? 'Re-record' : 'Record'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#73453F] bg-[#211312] px-3 text-xs font-semibold text-[#F0B3AC] hover:bg-[#2A1917]"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#F0B3AC]" />
            <Square size={13} /> Stop
          </button>
        )}
        {analyzing && (
          <span className="inline-flex items-center gap-1 text-xs text-[#9EA7A4]"><Loader2 size={12} className="animate-spin" /> Checking…</span>
        )}
        {previewUrl && !recording && (
          <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#293034] px-2 text-xs text-[#9EA7A4] hover:text-[#D7D2C4]">
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {previewUrl && <audio className="mt-2 w-full" controls src={previewUrl} />}

      {quality && (
        <div className={`mt-2 rounded-md border px-2.5 py-2 ${quality.level === 'good' ? 'border-[#2E5A3E] bg-[#0E1A12]' : quality.level === 'warn' ? 'border-[#7C6735] bg-[#1A150B]' : 'border-[#73453F] bg-[#1A100E]'}`}>
          <div className="flex items-center gap-1.5">
            {quality.level === 'good'
              ? <CheckCircle2 size={13} className="text-[#7FD69A]" />
              : <AlertTriangle size={13} className={quality.level === 'warn' ? 'text-[#EDD494]' : 'text-[#F0B3AC]'} />}
            <span className={`text-xs font-semibold ${quality.level === 'good' ? 'text-[#7FD69A]' : quality.level === 'warn' ? 'text-[#EDD494]' : 'text-[#F0B3AC]'}`}>
              {quality.level === 'good' ? 'Good sample' : quality.level === 'warn' ? 'Usable — could be better' : 'Please re-record'}
            </span>
            <span className="ml-auto text-[10px] text-[#6C7570]">{quality.durationSec.toFixed(1)}s · SNR {Math.round(quality.snrDb)}dB</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {quality.notes.map((note) => <li key={note} className="text-[11px] leading-snug text-[#9EA7A4]">{note}</li>)}
          </ul>
        </div>
      )}

      {previewUrl && !blocked && (
        <label className="mt-2 flex items-start gap-2 text-[11.5px] leading-snug text-[#C7C2B4]">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#74D6C6]" />
          <span>I read the statement above and I own this voice (or am authorized to clone it).</span>
        </label>
      )}

      {previewUrl && (
        <button
          type="button"
          disabled={!canUse}
          onClick={useRecording}
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#74D6C6] text-xs font-semibold text-[#081211] hover:bg-[#8BE0D3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : 'Use this recording'}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-[#F0B3AC]">{error}</p>}
    </div>
  );
}

// Client-side sample quality. Heuristic thresholds (tunable): ideal clone sample is
// ~15-30s, well above the noise floor, without clipping.
async function analyzeVoiceSample(blob: Blob): Promise<SampleQuality> {
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('no AudioContext');
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buffer.getChannelData(0);
    const n = data.length;

    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
      sumSq += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(n, 1)) || 1e-9;

    // Windowed RMS → estimate speech vs noise floor for a rough SNR.
    const win = Math.max(1, Math.floor(buffer.sampleRate * 0.05));
    const windows: number[] = [];
    for (let i = 0; i < n; i += win) {
      let s = 0;
      let c = 0;
      for (let j = i; j < Math.min(i + win, n); j++) { s += data[j] * data[j]; c++; }
      windows.push(Math.sqrt(s / Math.max(c, 1)));
    }
    windows.sort((a, b) => a - b);
    const pct = (p: number) => windows[Math.min(windows.length - 1, Math.max(0, Math.floor(p * windows.length)))] || 1e-9;
    const noise = pct(0.1);
    const speech = pct(0.9);
    const snrDb = 20 * Math.log10(Math.max(speech, 1e-9) / Math.max(noise, 1e-9));
    const rmsDb = 20 * Math.log10(rms);

    const notes: string[] = [];
    let level: QualityLevel = 'good';
    if (buffer.duration < 6) { notes.push('Too short — aim for ~15 seconds.'); level = 'bad'; }
    else if (buffer.duration < 12) notes.push('A little short — ~15s clones better.');
    if (buffer.duration > 45) notes.push('Longer than needed — 15-30s is plenty.');
    if (rmsDb < -40) { notes.push('Too quiet — move closer or speak up.'); level = 'bad'; }
    if (peak >= 0.99) { notes.push('Clipping — pull back from the mic a little.'); if (level !== 'bad') level = 'warn'; }
    if (snrDb < 12) { notes.push('Noisy background — try a quieter room.'); if (level !== 'bad') level = 'warn'; }
    if (notes.length === 0) notes.push('Clear and well-leveled.');

    return { durationSec: buffer.duration, snrDb, rmsDb, peak, level, notes };
  } finally {
    void ctx.close?.();
  }
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  for (const candidate of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

function extForType(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  return 'webm';
}
