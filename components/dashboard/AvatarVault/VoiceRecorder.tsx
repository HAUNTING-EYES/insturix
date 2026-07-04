'use client';

import { useRef, useState } from 'react';
import { Loader2, Mic, Square, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onUploaded: (url: string) => void;
  disabled?: boolean;
}

// Record a voice sample in the browser (native MediaRecorder), upload it, and
// hand back the stored URL. That URL becomes audio.voiceReferenceUrl — the voice
// Chatterbox clones from. No external share links, no Google-Drive interstitials.
export function VoiceRecorder({ onUploaded, disabled }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
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
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        void upload(blob);
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

  async function upload(blob: Blob) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', blob, `recording.${extForType(blob.type)}`);
      const response = await fetch('/api/avatar-vault/voice-uploads', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
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

  function clear() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }

  const busy = disabled || uploading;

  return (
    <div className="rounded-lg border border-[#293034] bg-[#0F1213] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#74D6C6] px-3 text-xs font-semibold text-[#E7FFFB] hover:bg-[#12302B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mic size={14} /> {previewUrl ? 'Re-record' : 'Record voice'}
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
        {uploading && (
          <span className="inline-flex items-center gap-1 text-xs text-[#9EA7A4]">
            <Loader2 size={12} className="animate-spin" /> Uploading…
          </span>
        )}
        {previewUrl && !uploading && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#293034] px-2 text-xs text-[#9EA7A4] hover:text-[#D7D2C4]"
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>
      {previewUrl && <audio className="mt-2 w-full" controls src={previewUrl} />}
      {error && <p className="mt-2 text-xs text-[#F0B3AC]">{error}</p>}
      <p className="mt-2 text-[11px] leading-snug text-[#6C7570]">
        Record 10-30s of clear speech. We clone this voice, then make it speak your script.
      </p>
    </div>
  );
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
