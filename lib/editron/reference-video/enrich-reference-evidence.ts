/**
 * R2/R3 worker enrichment — measured evidence + soundtrack identity for a
 * canonical reference.
 *
 * The video-analysis worker materializes a direct remote reference into a
 * canonical asset (R1-C) and this step enriches that reference with:
 *
 *   - R3 soundtrack identity (AudD, env-gated on AUDD_API_TOKEN)
 *   - R2 audio evidence: beats/BPM + silence, measured from the demuxed audio
 *
 * Slices are honest: it measures AUDIO evidence (beats/silence/identity) from
 * the demuxed audio artifact; VIDEO cuts are measured by the separate R0
 * ffmpeg path which has the local video bytes. This step never re-downloads the
 * source video for cut detection (R36: no duplicate measurement pipelines).
 *
 * Fail-soft at the boundary (evidence survives a recognizer outage), fail-loud
 * inside the recognizer itself (warnings[]).
 */

import type { CanonicalizeReferenceOutput } from './canonicalize-reference';

export interface ReferenceEnrichmentInput {
  userId: string;
  referenceAssetId: string;
  /** Demuxed audio artifact returned by R1-C canonicalization. */
  audioArtifact: { key: string; contentType: string } | null;
}

export interface ReferenceEnrichmentOutput {
  soundtrackIdentity?: unknown;
  audioEvidence?: unknown;
  /** R4 canonical EditFingerprint unified from the measured evidence + identity. */
  canonicalFingerprint?: unknown;
  /** R5 adaptive reference plan normalized from the fingerprint. */
  adaptivePlan?: unknown;
  warnings: Array<{ code: string; source: 'section' | 'soundtrack' | 'fetch'; message: string }>;
}

async function fetchBytesFromArtifact(audioArtifact: { key: string; contentType: string }): Promise<Uint8Array> {
  const { getR2PresignedReadUrl } = await import('@/lib/editron/services/r2-service');
  const url = await getR2PresignedReadUrl(audioArtifact.key, 3600);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`fetch audio artifact failed (HTTP ${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function defaultRecognizer() {
  // Lazy + env-gated: no token -> create returns null-recognizing client.
  return async (audioBytes: Uint8Array) => {
    const { isAuddConfigured, createAuddRecognizer } = await import('./audd-recognizer');
    if (!isAuddConfigured()) return null;
    const recognize = createAuddRecognizer();
    return recognize(audioBytes);
  };
}

export async function enrichReferenceWithMeasuredEvidence(
  input: ReferenceEnrichmentInput,
  deps: {
    fetchAudioBytes?: typeof fetchBytesFromArtifact;
    recognize?: (audioBytes: Uint8Array) => Promise<import('./soundtrack-identity').RecognizedTrack | null>;
    /** Decode audio bytes to PCM (defaults to audio-decode). Injectable for tests. */
    decodeAudio?: (bytes: Uint8Array) => Promise<{
      channelData?: Float32Array[];
      sampleRate?: number;
    }>;
    now?: () => Date;
  } = {},
): Promise<ReferenceEnrichmentOutput> {
  const warnings: ReferenceEnrichmentOutput['warnings'] = [];
  const out: ReferenceEnrichmentOutput = { warnings };

  if (!input.audioArtifact) {
    return out; // no demuxed audio (no audio track / import path) -> nothing to recognize
  }

  // 1. Fetch demuxed audio bytes.
  let audioBytes: Uint8Array;
  try {
    audioBytes = await (deps.fetchAudioBytes ?? fetchBytesFromArtifact)(input.audioArtifact);
  } catch (error) {
    warnings.push({ code: 'audio_fetch_failed', source: 'fetch', message: error instanceof Error ? error.message : String(error) });
    return out;
  }
  if (audioBytes.byteLength === 0) {
    return out;
  }

  // 2. R3 soundtrack identity (env-gated AudD).
  try {
    const { resolveSoundtrackIdentity, identityToFingerprintRecognition } = await import('./soundtrack-identity');
    const recognize = deps.recognize ?? defaultRecognizer();
    const identity = await resolveSoundtrackIdentity(input.referenceAssetId, audioBytes, {
      recognize,
      now: deps.now,
    });
    if (identity) {
      out.soundtrackIdentity = identityToFingerprintRecognition(identity);
      out.audioEvidence = out.audioEvidence ?? {};
      (out.audioEvidence as Record<string, unknown>).identity = identity;
    }
  } catch (error) {
    warnings.push({ code: 'recognizer_failed', source: 'soundtrack', message: error instanceof Error ? error.message : String(error) });
  }

  // 3. R2 audio evidence: beats + silence from the demuxed audio. The full
  //    orchestrator requires video bytes (cuts live in the separate R0 path),
  //    so this composes the same exported measurement primitives for audio only.
  try {
    const decodeAudio = deps.decodeAudio ?? (async (bytes: Uint8Array) => {
      const decode = (await import('audio-decode')).default as (b: ArrayBuffer) => Promise<{
        channelData?: Float32Array[];
        sampleRate?: number;
      }>;
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return decode(arrayBuffer);
    });
    const decoded = await decodeAudio(audioBytes);
    const primary = decoded.channelData?.[0];
    if (primary && decoded.sampleRate) {
      const { analyzeBeatsFull } = await import('@/lib/editron/services/media/beat-detection-service');
      const { measureSilence } = await import('./measure-silence');
      const beats = await analyzeBeatsFull({
        sampleRate: decoded.sampleRate,
        length: primary.length,
        numberOfChannels: decoded.channelData?.length ?? 1,
        getChannelData: (ch: number) => decoded.channelData?.[ch] ?? primary,
        duration: primary.length / decoded.sampleRate,
      });
      const silence = measureSilence(primary, decoded.sampleRate);
      out.audioEvidence = {
        ...(out.audioEvidence as Record<string, unknown>),
        beats: { bpm: beats.bpm, bpmConfidence: beats.bpmConfidence, beats: beats.beats },
        silence,
      };

      // R2/R5: derive structural sections from the measured signals so the plan
      // is not section-less (the Essentia/Modal provider is not wired here; this
      // deterministic sectionizer is the honest stopgap — confidence 0.6).
      const { deriveReferenceSections } = await import('./derive-reference-sections');
      const derivedSections = deriveReferenceSections({
        durationMs: Math.round((primary.length / decoded.sampleRate) * 1000),
        beats: beats.beats,
        dropsMs: [],
        silenceWindows: silence.windows.map((w) => ({ startMs: w.startMs, endMs: w.endMs })),
      });

      // R4: unify the available measured audio evidence + identity into the
      // canonical EditFingerprint. Cuts are intentionally empty here — they
      // come from the separate R0 video-cut path (this enrichment never
      // re-downloads the source for cut detection).
      try {
        const { buildCanonicalFingerprintFromEvidence } = await import('./build-canonic-fingerprint');
        const { MEASURED_EVIDENCE_VERSION } = await import('./measure-reference-evidence');
        const identityFull = (out.audioEvidence as { identity?: unknown }).identity as
          | import('./soundtrack-identity').SoundtrackIdentity
          | undefined;
        const measured: import('./measure-reference-evidence').MeasuredReferenceEvidence = {
          version: MEASURED_EVIDENCE_VERSION,
          referenceAssetId: input.referenceAssetId,
          durationMs: Math.round((primary.length / decoded.sampleRate) * 1000),
          cuts: [],
          beats,
          silence,
          sections: derivedSections,
          soundtrackIdentity: identityFull ?? null,
          warnings: [],
          rhythm: { avgCutsPerMinute: 0, avgClipDurationMs: 0, bpm: beats.bpm || 0 },
        };
        out.canonicalFingerprint = buildCanonicalFingerprintFromEvidence(
          input.referenceAssetId,
          measured,
          identityFull ?? null,
          { extractedAt: new Date().toISOString() },
        );

        // R5: normalize the fingerprint into the adaptive reference plan.
        const { buildAdaptiveReferencePlan } = await import('./adaptive-reference-plan');
        out.adaptivePlan = buildAdaptiveReferencePlan(
          out.canonicalFingerprint as Parameters<typeof buildAdaptiveReferencePlan>[0],
          { silenceWindows: silence.windows },
        );
      } catch (error) {
        warnings.push({ code: 'fingerprint_build_failed', source: 'section', message: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    warnings.push({ code: 'audio_measure_failed', source: 'section', message: error instanceof Error ? error.message : String(error) });
  }

  return out;
}
