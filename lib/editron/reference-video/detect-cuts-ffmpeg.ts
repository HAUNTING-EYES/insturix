/**
 * Deterministic cut detector (Master v1.1 §7.2 L2) — the OBJECTIVE half of the EditFingerprint.
 *
 * WHY THIS EXISTS: the LLM extractor (extract-visual-fingerprint.ts) cannot time cuts. Measured on
 * 9 real shorts against this very oracle, Gemini scored F1 0.66 and fabricated a ~1 cut/second grid
 * on fast edits — it destroys the cadence, which IS the fingerprint. The codebase used Gemini for
 * shot detection only because "PySceneDetect [is] not available on Vercel" (five-track-analysis.ts:476)
 * — but EditFingerprint extraction is an OFFLINE worker step, not a per-request serverless call, so a
 * worker can run ffmpeg. This module is that worker-side deterministic replacement (Playbook §7:
 * "deterministic checks for objective contracts").
 *
 * Input is a LOCAL file path (fetching a reference is a separate concern — upload passthrough or a
 * worker download). Output is the cut decisionStream in Editron's decision-family vocabulary. The
 * ffmpeg run and the two pure parsers are separated so the parsing is unit-tested without a binary.
 *
 * confidence is 1.0 (a frame either crossed the scene threshold or it did not — this is not a
 * probabilistic guess). The raw magnitude of the visual change is carried honestly in
 * params.sceneScore, NOT mis-encoded as confidence.
 */

import { spawn } from 'node:child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FingerprintDecision } from '@/lib/editron/types/edit-fingerprint';

/** ffmpeg's conventional hard-cut scene threshold. Hard cuts reliably exceed it (validated 0.41–0.73
 *  on a 16-cut short); single-take shorts produce zero crossings. Lower = more sensitive (more false
 *  positives on fast motion), higher = misses soft cuts. */
export const DEFAULT_SCENE_THRESHOLD = 0.3;

export interface FfmpegCut {
  tMs: number;
  /** Raw ffmpeg scene score (0..1) — the magnitude of the visual change at this boundary. */
  sceneScore?: number;
}

export interface FfmpegCutDetection {
  cuts: FfmpegCut[];
  durationMs: number;
  sceneThreshold: number;
}

/** Injected so the detector is testable without a video file; defaults to the real ffmpeg binary. */
export type RunFfmpeg = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface DetectCutsOptions {
  sceneThreshold?: number;
  runFfmpeg?: RunFfmpeg;
}

// ─── Pure parsers (the testable core) ────────────────────────────────────────

/**
 * Parse `metadata=print` stdout. Real format is line pairs:
 *   frame:0    pts:28160   pts_time:1.83333
 *   lavfi.scene_score=0.726533
 * A pts_time whose score line is missing is still recorded (scoreless) rather than dropped.
 */
export function parseSceneCuts(stdout: string): FfmpegCut[] {
  const cuts: FfmpegCut[] = [];
  let pendingMs: number | null = null;
  const flush = () => {
    if (pendingMs !== null) {
      cuts.push({ tMs: pendingMs });
      pendingMs = null;
    }
  };
  for (const line of stdout.split('\n')) {
    const pts = line.match(/pts_time:([0-9.]+)/);
    if (pts) {
      flush(); // a new frame arrived before the previous one's score — keep it, scoreless
      pendingMs = Math.round(Number(pts[1]) * 1000);
      continue;
    }
    const score = line.match(/lavfi\.scene_score=([0-9.]+)/);
    if (score && pendingMs !== null) {
      cuts.push({ tMs: pendingMs, sceneScore: Number(score[1]) });
      pendingMs = null;
    }
  }
  flush();
  return cuts.filter((c) => Number.isFinite(c.tMs)).sort((a, b) => a.tMs - b.tMs);
}

/** Parse `Duration: HH:MM:SS.ss` from ffmpeg's stderr header. */
export function parseDurationMs(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
  if (!m) return null;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}

/** Cut times → the transition_hard_cut decisionStream. ffmpeg can't reliably tell cut TYPE, and the
 *  dominant short-form transition is the hard cut, so every scene boundary maps to transition_hard_cut;
 *  the TYPE refinement (dissolve/whip) can stay with the LLM layer. anchor.kind is 'none' (beat
 *  anchoring is applied later by the assembler once the audio grid is known). */
export function cutsToDecisionStream(cuts: FfmpegCut[]): FingerprintDecision[] {
  return cuts.map((c): FingerprintDecision => ({
    family: 'transition_hard_cut',
    anchor: { kind: 'none', tMs: c.tMs },
    params: c.sceneScore !== undefined ? { sceneScore: c.sceneScore } : {},
    confidence: 1, // deterministic threshold-crossing, not a probabilistic guess
  }));
}

// ─── ffmpeg runner ───────────────────────────────────────────────────────────

function realRunFfmpeg(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(ffmpegInstaller.path, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += String(d)));
    proc.stderr.on('data', (d) => (stderr += String(d)));
    proc.on('error', reject);
    proc.on('close', (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * Run ffmpeg scene detection on a local video file and return objective cut times + duration.
 * Fail-loud (R18N): throws on a non-zero exit or an unparseable duration rather than returning [].
 * metadata=print writes scores to stdout; scene detection + the Duration header go to stderr.
 */
export async function detectCutsFfmpeg(videoPath: string, opts: DetectCutsOptions = {}): Promise<FfmpegCutDetection> {
  const sceneThreshold = opts.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;
  const run = opts.runFfmpeg ?? realRunFfmpeg;

  const { code, stdout, stderr } = await run([
    '-i', videoPath,
    '-filter:v', `select='gt(scene,${sceneThreshold})',metadata=print:file=-`,
    '-an', '-f', 'null', '-',
  ]);
  if (code !== 0) {
    throw new Error(`ffmpeg scene detection failed (exit ${code}) for ${videoPath}: ${stderr.slice(-300)}`);
  }
  const durationMs = parseDurationMs(stderr);
  if (durationMs === null) {
    throw new Error(`ffmpeg produced no parseable Duration for ${videoPath} — cannot trust the cut list`);
  }
  return { cuts: parseSceneCuts(stdout), durationMs, sceneThreshold };
}
