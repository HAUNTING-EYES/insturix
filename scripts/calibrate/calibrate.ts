/**
 * YouTube Reference Video Calibration Pipeline
 *
 * Downloads YouTube videos, runs the full analysis stack (5-Track + Wav2Vec +
 * V-JEPA + Essentia + transcript), computes signals, scores overlays, and
 * feeds the Thompson Sampling bandits with calibration data.
 *
 * Usage:
 *   npx tsx scripts/calibrate/calibrate.ts                    # all videos in reference-videos.json
 *   npx tsx scripts/calibrate/calibrate.ts --url <yt-url>     # single video
 *   npx tsx scripts/calibrate/calibrate.ts --skip-download     # re-analyze already-downloaded videos
 *   npx tsx scripts/calibrate/calibrate.ts --dry-run           # score but don't update bandits
 *
 * Env vars required: MONGODB_URI, GOOGLE_CLOUD_CREDENTIALS, GCS_BUCKET_NAME,
 *   MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, GEMINI_API_KEY (or GOOGLE_API_KEY),
 *   FAL_AI_API_KEY (or FAL_KEY), XAI_API_KEY (optional, for Grok STT)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
  console.log('[Calibrate] Loaded env from .env.local');
}

// ── Stage 1: Download ──────────────────────────────────────────────

interface DownloadResult {
  localPath: string;
  gcsUri: string;
  signedUrl: string;
  durationMs: number;
  title: string;
}

async function downloadVideo(url: string, tempDir: string): Promise<DownloadResult> {
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

  console.log(`[Calibrate] Downloading: ${url}`);

  const infoJson = execSync(
    `yt-dlp --dump-json --no-download "${url}"`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
  );
  const info = JSON.parse(infoJson);
  const title = (info.title || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const durationMs = Math.round((info.duration || 0) * 1000);

  const outPath = join(tempDir, `${title}.mp4`);
  if (!existsSync(outPath)) {
    execSync(
      `yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best" --merge-output-format mp4 -o "${outPath}" "${url}"`,
      { stdio: 'inherit', maxBuffer: 50 * 1024 * 1024 },
    );
  } else {
    console.log(`[Calibrate] Already downloaded: ${outPath}`);
  }

  console.log(`[Calibrate] Uploading to GCS...`);
  const { streamUrlToGCS } = await import('../../lib/alyzitron/extraction/streamToGCS');
  const gcsPath = `calibration/${title}.mp4`;

  const fs = await import('fs');
  const { Readable } = await import('stream');
  const fileBuffer = fs.readFileSync(outPath);

  const { uploadToGCS, refreshSignedUrl } = await import('../../lib/editron/services/gcs-service');
  const gcsResult = await uploadToGCS(
    fileBuffer,
    'calibration',
    `${title}.mp4`,
    'video/mp4',
  );

  const signed = await refreshSignedUrl(gcsResult.gcsPath);

  console.log(`[Calibrate] Uploaded: ${gcsResult.gcsPath} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

  return {
    localPath: outPath,
    gcsUri: `gs://${process.env.GCS_BUCKET_NAME}/${gcsResult.gcsPath}`,
    signedUrl: signed.url,
    durationMs,
    title,
  };
}

// ── Stage 2: Analyze ───────────────────────────────────────────────

interface AnalysisResult {
  fiveTrack: any;
  wav2vec: any;
  vjepa: any;
  essentia: any;
  transcript: { words: Array<{ word: string; startMs: number; endMs: number }>; transcript: string };
}

async function analyzeVideo(
  signedUrl: string,
  durationMs: number,
  title: string,
): Promise<AnalysisResult> {
  console.log(`\n[Calibrate] ═══ Analyzing: ${title} (${(durationMs / 1000).toFixed(0)}s) ═══`);

  const segmentDuration = 5000;
  const segmentCount = Math.ceil(durationMs / segmentDuration);
  const segments = Array.from({ length: segmentCount }, (_, i) => ({
    startMs: i * segmentDuration,
    endMs: Math.min((i + 1) * segmentDuration, durationMs),
  }));

  console.log(`[Calibrate] ${segments.length} segments (${segmentDuration / 1000}s each)`);

  // Run Modal endpoints in parallel
  const [wav2vec, vjepa, essentia] = await Promise.all([
    (async () => {
      console.log('[Calibrate] → Wav2Vec (vocal emotion)...');
      const { analyzeAudioWithWav2Vec } = await import('../../lib/editron/services/wav2vec-service');
      const result = await analyzeAudioWithWav2Vec(signedUrl, segments);
      console.log(`[Calibrate] ✓ Wav2Vec: ${result?.segments?.length || 0} segments`);
      return result;
    })(),
    (async () => {
      console.log('[Calibrate] → V-JEPA (visual significance)...');
      const { analyzeVideoWithVjepa } = await import('../../lib/editron/services/vjepa-service');
      const result = await analyzeVideoWithVjepa(signedUrl, segments);
      console.log(`[Calibrate] ✓ V-JEPA: ${result?.segments?.length || 0} segments`);
      return result;
    })(),
    (async () => {
      console.log('[Calibrate] → Essentia (music analysis)...');
      const { analyzeMusicContent } = await import('../../lib/editron/services/music-analysis-service');
      const result = await analyzeMusicContent(signedUrl);
      console.log(`[Calibrate] ✓ Essentia: bpm=${result?.bpm || 'N/A'}, beats=${result?.beats?.length || 0}`);
      return result;
    })(),
  ]);

  // 5-Track via Gemini Vision (sequential — rate limited)
  console.log('[Calibrate] → 5-Track (Gemini Vision)...');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const fiveTrackResult = await model.generateContent([
    { text: `Analyze this video for editing. Return JSON with: { "shots": [{"startMs": N, "endMs": N, "shotType": "...", "motionIntensity": 0-1}], "naturalCutPoints": [{"timestampMs": N, "reason": "..."}], "transitionTypes": [{"timestampMs": N, "type": "hard-cut|dissolve|whip-pan|fade"}] }. Video duration: ${durationMs}ms. Analyze the ACTUAL editing decisions — where cuts happen, what transitions are used, pacing patterns.` },
  ]);

  let fiveTrack: any = {};
  try {
    let text = fiveTrackResult.response.text()?.trim() || '{}';
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    fiveTrack = JSON.parse(text);
    console.log(`[Calibrate] ✓ 5-Track: ${fiveTrack.shots?.length || 0} shots, ${fiveTrack.naturalCutPoints?.length || 0} cuts, ${fiveTrack.transitionTypes?.length || 0} transitions`);
  } catch (e) {
    console.warn(`[Calibrate] ✗ 5-Track parse failed, using empty`);
  }

  // Transcription via Whisper
  console.log('[Calibrate] → Transcription (Whisper)...');
  let transcript = { words: [] as Array<{ word: string; startMs: number; endMs: number }>, transcript: '' };
  try {
    const { fal } = await import('@fal-ai/client');
    const falKey = process.env.FAL_AI_API_KEY || process.env.FAL_KEY;
    if (falKey) fal.config({ credentials: falKey });
    const whisperResult = await Promise.race([
      fal.subscribe('fal-ai/wizper', {
        input: { audio_url: signedUrl, task: 'transcribe', chunk_level: 'segment' },
        logs: false,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 90_000)),
    ]);
    const data = whisperResult.data as any;
    if (data?.chunks?.length) {
      const words: typeof transcript.words = [];
      for (const chunk of data.chunks) {
        const segText = (chunk.text || '').trim();
        const segStart = (chunk.timestamp?.[0] || 0) * 1000;
        const segEnd = (chunk.timestamp?.[1] || 0) * 1000;
        const segWords = segText.split(/\s+/).filter(Boolean);
        if (segWords.length === 0) continue;
        const totalChars = segWords.reduce((s: number, w: string) => s + w.length, 0);
        let cursor = segStart;
        for (const w of segWords) {
          const dur = (w.length / totalChars) * (segEnd - segStart);
          words.push({ word: w, startMs: Math.round(cursor), endMs: Math.round(cursor + dur) });
          cursor += dur;
        }
      }
      transcript = { words, transcript: data.text || words.map(w => w.word).join(' ') };
    }
    console.log(`[Calibrate] ✓ Transcript: ${transcript.words.length} words`);
  } catch (e: any) {
    console.warn(`[Calibrate] ✗ Transcription failed: ${e.message}`);
  }

  return { fiveTrack, wav2vec, vjepa, essentia, transcript };
}

// ── Stage 3: Score ─────────────────────────────────────────────────

interface ScoringResult {
  signals: Record<string, number>;
  systemDecisions: Array<{ overlayId: string; score: number; category: string; outputValues: Record<string, any> }>;
  referencePatterns: {
    cutCount: number;
    cutsPerMinute: number;
    transitionTypes: Record<string, number>;
    avgShotDurationMs: number;
  };
}

async function scoreVideo(
  analysis: AnalysisResult,
  durationMs: number,
): Promise<ScoringResult> {
  console.log(`\n[Calibrate] ═══ Scoring ═══`);

  const { buildSignalTimeline } = await import('../../lib/editron/services/signal-registry');
  const { scoreAllOverlays } = await import('../../lib/editron/engine/utility-scorer');
  const defs = (await import('../../lib/editron/engine/overlay-definitions.json')).default;
  const { OverlayDefinition } = await import('../../lib/editron/engine/utility-types') as any;

  const rawFootage = {
    transcription: {
      segments: analysis.transcript.words.length > 0 ? [{
        text: analysis.transcript.transcript,
        startMs: analysis.transcript.words[0]?.startMs ?? 0,
        endMs: analysis.transcript.words[analysis.transcript.words.length - 1]?.endMs ?? durationMs,
        words: analysis.transcript.words,
      }] : [],
      words: analysis.transcript.words,
    },
    originalDurationMs: durationMs,
    silenceGaps: [],
    contentTypeDetection: { contentType: 'unknown', confidence: 0.5 },
  };

  const mockAnalyses = [{
    assetId: 'calibration',
    motionSegments: (analysis.fiveTrack.shots || []).map((s: any) => ({
      startMs: s.startMs,
      endMs: s.endMs,
      motionIntensity: s.motionIntensity ?? 0.5,
      cameraMotion: { type: 'static' },
    })),
    keyframeAnalyses: (analysis.fiveTrack.shots || []).map((s: any) => ({
      timestampMs: s.startMs,
      shotType: s.shotType || 'medium',
      brightness: 0.5,
      colorDiversity: 0.5,
      energy: s.motionIntensity ?? 0.5,
    })),
    subjectTracks: [],
    speechSegments: analysis.transcript.words.length > 0 ? [{
      startMs: analysis.transcript.words[0].startMs,
      endMs: analysis.transcript.words[analysis.transcript.words.length - 1].endMs,
      text: analysis.transcript.transcript,
    }] : [],
    musicStructure: analysis.essentia ? {
      bpm: analysis.essentia.bpm,
      beats: analysis.essentia.beats || [],
      sections: analysis.essentia.sections || [],
      energyCurve: analysis.essentia.energyCurve || [],
    } : undefined,
  }];

  const fps = 30;
  const timeline = buildSignalTimeline(
    mockAnalyses as any,
    rawFootage as any,
    [],
    fps,
    analysis.vjepa,
    analysis.wav2vec,
    analysis.essentia,
  );

  // Build averaged global signal snapshot (same as Director does)
  const gridFrames = Array.from(timeline.gridSignals.keys());
  const avgSignals: Record<string, number> = {};
  const avgCounts: Record<string, number> = {};
  for (const f of gridFrames) {
    const snap = timeline.gridSignals.get(f)!;
    for (const [k, v] of Object.entries(snap)) {
      if (typeof v === 'number' && isFinite(v)) {
        avgSignals[k] = (avgSignals[k] ?? 0) + v;
        avgCounts[k] = (avgCounts[k] ?? 0) + 1;
      }
    }
  }
  for (const k of Object.keys(avgSignals)) avgSignals[k] /= avgCounts[k];
  for (const [k, v] of Object.entries(timeline.globalSignals)) {
    if (typeof v === 'number' && isFinite(v)) avgSignals[k] = v;
  }
  // Bridge personality namespace
  if (avgSignals['content.formality'] !== undefined) avgSignals['formality'] = avgSignals['content.formality'];
  if (avgSignals['personality.enthusiasm'] !== undefined) avgSignals['enthusiasm'] = avgSignals['personality.enthusiasm'];
  if (avgSignals['personality.warmth'] !== undefined) avgSignals['warmth'] = avgSignals['personality.warmth'];
  if (avgSignals['personality.emotional_arousal'] !== undefined) avgSignals['emotional_arousal'] = avgSignals['personality.emotional_arousal'];
  if (avgSignals['personality.pacing_velocity'] !== undefined) avgSignals['pacing_velocity'] = avgSignals['personality.pacing_velocity'];
  if (avgSignals['personality.visceral_impact'] !== undefined) avgSignals['visceral_impact'] = avgSignals['personality.visceral_impact'];
  if (avgSignals['personality.visual_dependency'] !== undefined) avgSignals['visual_dependency'] = avgSignals['personality.visual_dependency'];
  if (avgSignals['personality.humor'] !== undefined) avgSignals['humor'] = avgSignals['personality.humor'];

  console.log('[Calibrate] Signals computed:');
  for (const key of ['formality', 'enthusiasm', 'warmth', 'emotional_arousal', 'pacing_velocity', 'visceral_impact', 'visual_dependency', 'humor']) {
    console.log(`  ${key}: ${(avgSignals[key] ?? 0).toFixed(3)}`);
  }

  // Score all overlays
  const allResults = scoreAllOverlays(defs as any, avgSignals);
  const systemDecisions = allResults.map(r => ({
    overlayId: r.overlayId,
    score: r.totalScore,
    category: r.category,
    outputValues: r.outputValues,
  }));
  console.log(`[Calibrate] Overlay decisions: ${systemDecisions.length} above minScore`);

  // Extract reference editing patterns from 5-Track
  const cuts = analysis.fiveTrack.naturalCutPoints || [];
  const transitions = analysis.fiveTrack.transitionTypes || [];
  const shots = analysis.fiveTrack.shots || [];
  const transitionCounts: Record<string, number> = {};
  for (const t of transitions) {
    transitionCounts[t.type] = (transitionCounts[t.type] || 0) + 1;
  }

  const referencePatterns = {
    cutCount: cuts.length,
    cutsPerMinute: cuts.length / (durationMs / 60000),
    transitionTypes: transitionCounts,
    avgShotDurationMs: shots.length > 0
      ? shots.reduce((s: number, sh: any) => s + (sh.endMs - sh.startMs), 0) / shots.length
      : 0,
  };

  console.log(`[Calibrate] Reference patterns: ${referencePatterns.cutCount} cuts, ${referencePatterns.cutsPerMinute.toFixed(1)} cuts/min, avg shot ${(referencePatterns.avgShotDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Transitions: ${JSON.stringify(referencePatterns.transitionTypes)}`);

  return { signals: avgSignals, systemDecisions, referencePatterns };
}

// ── Stage 4: Feed Bandits ──────────────────────────────────────────

async function feedBandits(
  scoring: ScoringResult,
  label: string,
  dryRun: boolean,
): Promise<void> {
  console.log(`\n[Calibrate] ═══ Feeding Bandits ${dryRun ? '(DRY RUN)' : ''} ═══`);

  const { THRESHOLD_REGISTRY } = await import('../../lib/editron/data/threshold-registry');

  // Compare system decisions against reference patterns
  const outcomes: Array<{ technique: string; reason: string; outcome: 'kept' | 'removed'; thresholdIds: string[] }> = [];

  // Pacing calibration: compare system's pacing signals against reference cuts/min
  const refCPM = scoring.referencePatterns.cutsPerMinute;
  const systemPacing = scoring.signals['pacing_velocity'] ?? 0.5;
  const pacingAligned = (refCPM > 8 && systemPacing > 0.6) || (refCPM < 4 && systemPacing < 0.4) || (refCPM >= 4 && refCPM <= 8 && systemPacing >= 0.3 && systemPacing <= 0.7);
  outcomes.push({
    technique: 'pacing',
    reason: 'energy_peak',
    outcome: pacingAligned ? 'kept' : 'removed',
    thresholdIds: ['speech-coverage-threshold', 'time-since-cut-density-threshold'],
  });

  // Transition calibration: does system pick the right transition types?
  const refTransitions = scoring.referencePatterns.transitionTypes;
  const systemTransitions = scoring.systemDecisions.filter(d => d.category === 'transition');
  const hasDissolves = (refTransitions['dissolve'] || 0) > 0;
  const systemPicksDissolve = systemTransitions.some(d => d.overlayId.includes('dissolve'));
  outcomes.push({
    technique: 'transition',
    reason: 'visual_peak',
    outcome: (hasDissolves === systemPicksDissolve) ? 'kept' : 'removed',
    thresholdIds: ['visual-change-threshold', 'low-motion-visual-threshold'],
  });

  // Music sync calibration: if reference has music, do signals detect it?
  const hasRefMusic = scoring.signals['audio.music_beat'] !== undefined;
  const essentiaDetected = (scoring.signals['audio.bpm'] ?? 0) > 0;
  if (hasRefMusic || essentiaDetected) {
    outcomes.push({
      technique: 'beat-sync',
      reason: 'music_beat',
      outcome: essentiaDetected ? 'kept' : 'removed',
      thresholdIds: ['min-beat-density-bpm', 'sparse-rhythm-bpm'],
    });
  }

  // MG property calibration: do overlay scores produce reasonable output?
  const mgDecisions = scoring.systemDecisions.filter(d => d.category === 'mg-property');
  const fontSize = mgDecisions.find(d => d.overlayId === 'mg.typography.font_size')?.outputValues?.fontSize as number;
  if (fontSize) {
    const reasonable = fontSize >= 48 && fontSize <= 160;
    outcomes.push({
      technique: 'graphic',
      reason: 'energy_peak',
      outcome: reasonable ? 'kept' : 'removed',
      thresholdIds: ['mg-element-count-limit', 'content-shape-significance'],
    });
  }

  // Animation calibration: does the system pick appropriate entrance for this content?
  const entranceWinner = scoring.systemDecisions
    .filter(d => d.overlayId.startsWith('mg.animation.entrance_') && d.overlayId !== 'mg.animation.entrance_speed')
    .sort((a, b) => b.score - a.score)[0];
  if (entranceWinner) {
    const formalContent = (scoring.signals['formality'] ?? 0) > 0.6;
    const isPop = entranceWinner.overlayId.includes('pop');
    const animAppropriate = !(formalContent && isPop);
    outcomes.push({
      technique: 'graphic',
      reason: 'vocal_emphasis',
      outcome: animAppropriate ? 'kept' : 'removed',
      thresholdIds: ['enthusiasm-scale-pulse-trigger', 'warmth-breathe-trigger'],
    });
  }

  console.log(`[Calibrate] Outcomes: ${outcomes.filter(o => o.outcome === 'kept').length} kept, ${outcomes.filter(o => o.outcome === 'removed').length} removed`);
  for (const o of outcomes) {
    console.log(`  ${o.outcome === 'kept' ? '✓' : '✗'} ${o.technique}/${o.reason} → ${o.outcome} (thresholds: ${o.thresholdIds.join(', ')})`);
  }

  if (dryRun) {
    console.log('[Calibrate] DRY RUN — skipping bandit update');
    return;
  }

  // Feed to threshold bandit
  try {
    const { loadThresholdBanditState, updateThresholdBandit, saveThresholdBanditState } = await import('../../lib/editron/services/threshold-bandit');

    const userId = `calibration-${label}`;
    let state = await loadThresholdBanditState(userId);
    if (!state) {
      state = { userId, totalOutcomes: 0, arms: {} };
    }

    const speechCov = scoring.signals['content.speech_coverage'] ?? scoring.signals['speech.coverage'] ?? 0;
    const durationS = scoring.signals['video.duration_s'] ?? 60;
    const context = {
      contentType: label,
      speechCoverageBucket: speechCov > 0.6 ? 'high' : speechCov > 0.3 ? 'medium' : 'low',
      durationBucket: durationS > 300 ? 'long' : durationS > 60 ? 'medium' : 'short',
      platform: 'youtube',
    };

    const banditOutcomes = outcomes.map(o => ({
      technique: o.technique,
      reason: o.reason,
      outcome: o.outcome as 'kept' | 'modified' | 'removed',
    }));

    state = updateThresholdBandit(state, banditOutcomes, context);
    await saveThresholdBanditState(state);
    console.log(`[Calibrate] Bandit updated: ${state.totalOutcomes} total outcomes for ${userId}`);
  } catch (banditErr: any) {
    console.error(`[Calibrate] Bandit update failed: ${banditErr.message}`);
  }
}

// ── Orchestrator ───────────────────────────────────────────────────

async function calibrateVideo(
  url: string,
  label: string,
  options: { skipDownload?: boolean; dryRun?: boolean; tempDir?: string },
): Promise<void> {
  const tempDir = options.tempDir || join(process.cwd(), '.calibration-temp');
  const startTime = Date.now();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[Calibrate] Video: ${label}`);
  console.log(`[Calibrate] URL: ${url}`);
  console.log(`${'═'.repeat(60)}`);

  // Stage 1: Download
  let download: DownloadResult;
  if (options.skipDownload) {
    console.log('[Calibrate] Skipping download (--skip-download)');
    download = { localPath: '', gcsUri: '', signedUrl: url, durationMs: 0, title: label };
  } else {
    download = await downloadVideo(url, tempDir);
  }

  // Stage 2: Analyze
  const analysis = await analyzeVideo(download.signedUrl, download.durationMs, download.title || label);

  // Stage 3: Score
  const scoring = await scoreVideo(analysis, download.durationMs);

  // Stage 4: Feed Bandits
  await feedBandits(scoring, label, options.dryRun || false);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n[Calibrate] ✓ Complete: ${label} in ${elapsed}s`);
}

// ── CLI Entry Point ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipDownload = args.includes('--skip-download');
  const urlIdx = args.indexOf('--url');
  const singleUrl = urlIdx >= 0 ? args[urlIdx + 1] : null;

  if (singleUrl) {
    const label = args[args.indexOf('--label') + 1] || 'manual';
    await calibrateVideo(singleUrl, label, { dryRun, skipDownload });
    return;
  }

  const configPath = join(__dirname, 'reference-videos.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const videos = config.videos.filter((v: any) => v.url && v.url.length > 0);

  if (videos.length === 0) {
    console.error('[Calibrate] No videos configured. Fill in URLs in scripts/calibrate/reference-videos.json');
    process.exit(1);
  }

  console.log(`[Calibrate] Processing ${videos.length} reference videos (dryRun=${dryRun}, skipDownload=${skipDownload})`);

  for (const video of videos) {
    try {
      await calibrateVideo(video.url, video.label, { dryRun, skipDownload });
    } catch (err: any) {
      console.error(`[Calibrate] FAILED: ${video.label} — ${err.message}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[Calibrate] All done. ${videos.length} videos processed.`);
}

main().catch(err => {
  console.error('[Calibrate] Fatal:', err);
  process.exit(1);
});
