/**
 * DEV PROBE (not committed) — 360° holistic R0→R6 end-to-end simulation.
 *
 * Mimics a user invoking the whole reference pipeline against a REAL video,
 * plus adversarial inputs at every stage. Verifies the full chain produces the
 * intended contract at each hop and fails loudly where it should.
 *
 * Run: npx tsx scripts/holistic-r0-r6.ts <video.mp4>
 * Env AUDD_API_TOKEN optional (identity hops are gated without it).
 */

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileP = promisify(execFile);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function demuxAudio(video: string, ffmpeg: string): Promise<{ bytes: Buffer; wavPath: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hol-'));
  const wav = path.join(dir, 'a.wav');
  await execFileP(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-t', '60', '-c:a', 'pcm_s16le', wav]);
  const bytes = await readFile(wav);
  return { bytes, wavPath: wav };
}

async function main() {
  const video = process.argv[2];
  if (!video) throw new Error('usage: npx tsx scripts/holistic-r0-r6.ts <video.mp4>');
  const s = await stat(video).catch(() => null);
  if (!s) throw new Error(`video not found: ${video}`);
  require = createRequire(import.meta.url);
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string;

  console.log(`\n=== 360° holistic R0→R6 on ${path.basename(video)} ===`);

  // ── R0/R1-A: real demux + cut detection ──────────────────────────────
  console.log('\n[R0/R1-A] real demux + shipped cut detector');
  const dir = await mkdtemp(path.join(tmpdir(), 'holo-'));
  const pcm = path.join(dir, 'pcm.raw');
  await execFileP(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vn', '-f', 'f32le', '-ac', '1', '-ar', '16000', '-t', '60', pcm]);
  const pcmBuf = await readFile(pcm);
  const samples = new Float32Array(pcmBuf.buffer.slice(0, pcmBuf.byteLength));
  const { detectCutsFfmpeg } = await import('../lib/editron/reference-video/detect-cuts-ffmpeg');
  const detection = await detectCutsFfmpeg(video, { runFfmpeg: async (args) => {
    try { const o = await execFileP(ffmpeg, args); return { code: 0, stdout: o.stdout, stderr: o.stderr }; }
    catch (e: any) { return { code: e?.code ?? 1, stdout: e?.stdout ?? '', stderr: e?.stderr ?? String(e) }; }
  } });
  check('ffmpeg cut detector runs on real video', detection.cuts.length > 0, `${detection.cuts.length} cuts in ${detection.durationMs}ms`);
  const rawCuts = detection.cuts;

  // ── R0: adaptive score-aware merge lessens phantom weak clusters ─────
  const { mergeCloseCuts } = await import('../lib/editron/reference-video/adaptive-cut-postprocess');
  const merged = mergeCloseCuts(rawCuts);
  check('adaptive merge keeps total cut count', merged.after > 0, `${merged.before} -> ${merged.after}, ${merged.merges} weak clusters collapsed`);

  // ── R1-A (demux) + R2 (beats/silence on real PCM) ────────────────────
  console.log('\n[R2] measured evidence on real demuxed audio');
  const { analyzeBeatsFull } = await import('../lib/editron/services/media/beat-detection-service');
  const { measureSilence } = await import('../lib/editron/reference-video/measure-silence');
  const beats = await analyzeBeatsFull({ sampleRate: 16000, length: samples.length, numberOfChannels: 1, getChannelData: () => samples, duration: samples.length / 16000 });
  const silence = measureSilence(samples, 16000);
  check('beat analysis yields bpm+beats', beats.bpm > 0 && beats.beats.length > 0, `bpm=${beats.bpm} beats=${beats.beats.length}`);
  check('silence measurement returns a v1 result', silence.version === 'editron-r2-silence-v1');

  // ── R3 identity (gated) + R4 fingerprint + R5 plan via real evidence ──
  console.log('\n[R3/R4/R5] identity -> fingerprint -> adaptive plan');
  const { measureReferenceEvidence } = await import('../lib/editron/reference-video/measure-reference-evidence');
  const { buildCanonicalFingerprintFromEvidence } = await import('../lib/editron/reference-video/build-canonic-fingerprint');
  const { buildAdaptiveReferencePlan } = await import('../lib/editron/reference-video/adaptive-reference-plan');

  const audioU8 = new Uint8Array(pcmBuf.length);
  audioU8.set(pcmBuf);
  const evidence = await measureReferenceEvidence('ref_live', Buffer.from('x'), audioU8, {
    detectCuts: async () => ({ cuts: rawCuts, durationMs: detection.durationMs }),
    decodeAudio: async () => ({ sampleRate: 16000, length: samples.length, numberOfChannels: 1, getChannelData: () => samples, duration: samples.length / 16000 }),
    soundtrackRecognizer: (process.env.AUDD_API_TOKEN)
      ? async () => { const { createAuddRecognizer } = await import('../lib/editron/reference-video/audd-recognizer'); return createAuddRecognizer()(audioU8); }
      : undefined,
  });
  check('measureReferenceEvidence composes cuts+beats+silence', evidence.cuts.length > 0 && evidence.beats.bpm > 0);

  // Mirror the worker enrichment wiring: derive structural sections from the
  // measured audio so R5 plans are not section-less (R6 needs anchors).
  const { deriveReferenceSections } = await import('../lib/editron/reference-video/derive-reference-sections');
  const derivedSections = deriveReferenceSections({
    durationMs: Math.round((samples.length / 16000) * 1000),
    beats: beats.beats,
    dropsMs: [],
    silenceWindows: silence.windows.map((w) => ({ startMs: w.startMs, endMs: w.endMs })),
  });

  const fp = buildCanonicalFingerprintFromEvidence('ref_live', evidence, evidence.soundtrackIdentity, { extractedAt: 't' });
  fp.audio.sections = derivedSections;
  fp.structure = { slots: derivedSections.map((s) => ({ role: s.label, startMs: s.startMs, endMs: s.endMs })) };
  check('fingerprint: audio layer has bpm + beats', fp.audio.bpm === evidence.beats.bpm && fp.audio.beats.length === evidence.beats.beats.length);
  check('fingerprint: decisionStream == cuts', fp.decisionStream.length === evidence.cuts.length);
  check('fingerprint: audio metadata carries R4 provenance', !!fp.layerConfidence.audio?.algorithmVersion && !!fp.layerConfidence.audio?.coordinateSpace);
  check('fingerprint: soundClass honest', fp.audio.soundClass === (evidence.soundtrackIdentity ? 'catalog-track' : 'unknown'));

  const plan = buildAdaptiveReferencePlan(fp, { silenceWindows: evidence.silence.windows });
  check('plan: version v1 + reference', plan.version === 'editron-r5-adaptive-plan-v1' && plan.referenceId === 'ref_live');
  check('plan: beat grid from fingerprint', plan.rhythm.bpm === fp.audio.bpm);
  check('plan: slots derived', plan.slots.length > 0, `${plan.slots.length} slots (roles: ${[...new Set(plan.slots.map((x) => x.role))].join(',')})`);
  const target = buildAdaptiveReferencePlan(fp, { silenceWindows: evidence.silence.windows, targetDurationMs: 30_000 });
  check('plan: target remap bounds', target.target ? target.target.slots.every((x) => x.startMs >= 0 && x.endMs <= 30000 && x.endMs > x.startMs) : false, `-> ${target.target?.requestedDurationMs}ms`);

  // ── R6 verification: faithful = target-space cut pattern, then adversarial ──
  console.log('\n[R6] rendered verification (faithful then adversarial)');
  const { verifyRenderedReference } = await import('../lib/editron/reference-video/verify-rendered-reference');
  // Faithful render: reproduces the plan's OWN target-space cut pattern AND its
  // structural anchors (hook/outro boundaries) — what a delivered render that
  // followed the plan would contain.
  const STRUCT_FAITHFUL = new Set(['drop', 'build', 'hook', 'outro', 'pre-drop', 'break']);
  const anchorCuts = (target.target?.slots ?? [])
    .filter((s) => STRUCT_FAITHFUL.has(s.role))
    .map((s) => s.startMs);
  const faithfulCuts = [...new Set([...(target.target?.cutMs ?? []), ...anchorCuts])].sort((a, b) => a - b);
  const faithfulSilences = (target.target?.slots ?? [])
    .filter((s) => s.role === 'protected-silence')
    .map((s) => ({ startMs: s.startMs, endMs: s.endMs }));
  const faithful = verifyRenderedReference(target, { cutMs: faithfulCuts, silenceWindows: faithfulSilences, durationMs: 30000 });
  check('R6: faithful render matches plan', faithful.matchAchieved === true, `score=${faithful.overall.score}`);
  const broken = verifyRenderedReference(target, { cutMs: [500, 15000, 25000], silenceWindows: [], durationMs: 30000 });
  check('R6: broken render fails visibly', broken.matchAchieved === false && broken.failures.length > 0, `${broken.failures.length} failure(s)`);

  // ── Adversarial stage tests ───────────────────────────────────────────
  console.log('\n[adversarial] failure paths');
  const { resolveSoundtrackIdentity } = await import('../lib/editron/reference-video/soundtrack-identity');
  const noAudio = await resolveSoundtrackIdentity('r', null, {}).then(() => 'no-throw').catch((e: any) => e.code);
  check('identity: null audio throws', noAudio === 'no_audio');
  const { SoundtrackIdentityError } = await import('../lib/editron/reference-video/soundtrack-identity');
  const emptyRec = await resolveSoundtrackIdentity('r', new Uint8Array([1, 2]), { recognize: async () => ({ recordingId: ' ', title: 'T', artists: ['A'], confidence: 1, providerName: 'x', providerReceipt: 'r' }) }).then(() => 'ok').catch((e: any) => e instanceof SoundtrackIdentityError ? e.code : 'other');
  check('identity: empty recordingId refused', emptyRec === 'recognizer_failed');
  const bigAudio = await resolveSoundtrackIdentity('r', new Uint8Array(200 * 1024 * 1024), { maxRecognitionBytes: 1024 }).then(() => 'ok').catch((e: any) => e.code);
  check('identity: oversized audio refused', bigAudio === 'audio_too_large');

  const { measureReferenceEvidence: mre2 } = await import('../lib/editron/reference-video/measure-reference-evidence');
  const noVideo = await mre2('r', new Uint8Array(0), null, {}).then(() => 'ok').catch((e: any) => e.code);
  check('evidence: empty video refuses', noVideo === 'no_video_evidence');
  const badDecode = await mre2('r', Buffer.from('v'), new Uint8Array([9]), {
    detectCuts: async () => ({ cuts: [{ tMs: 100 }], durationMs: 1000 }),
    decodeAudio: async () => { throw new Error('bad'); },
  }).then(() => 'ok').catch((e: any) => e.code);
  check('evidence: undecodable audio -> audio_decode_failed', badDecode === 'audio_decode_failed');
  const outageEv = await mre2('r', Buffer.from('v'), new Uint8Array([9]), { decodeAudio: async () => ({ sampleRate: 16000, length: 16000, numberOfChannels: 1, getChannelData: () => new Float32Array(16000), duration: 1 }), soundtrackRecognizer: async () => { throw new Error('audd down'); }, detectCuts: async () => ({ cuts: [{ tMs: 100 }], durationMs: 1000 }), measureSilenceFn: () => silence }).catch(() => null);
  check('evidence: recognizer outage still yields evidence', !!outageEv && Array.isArray(outageEv.warnings) && (outageEv.warnings as unknown[]).some((w: any) => w.code === 'recognizer_failed'), `warnings=${(outageEv?.warnings ?? []).length}`);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? 1 : 0;
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

let require: ReturnType<typeof createRequire>;
const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
