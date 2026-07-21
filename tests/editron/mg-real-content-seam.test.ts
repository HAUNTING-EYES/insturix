/**
 * MG LIVE SEAM — REAL CONTENT (Phase 0 guardrail, 2026-07-21).
 *
 * WHY THIS EXISTS: `mg-live-codegen-seam.test.ts` proves executeEDL can drive a graphic decision into a durable
 * sequence — but it feeds PERFECT input: `value: '47%'` (a percentage → bounded-stat → carries the
 * 'bounded-proportion' license) AND an explicit `signals.salience: 0.9` (clears the 0.66 gate outright). Both
 * escape hatches are hit at once, so the ledger's real behaviour on ordinary speech was never exercised.
 *
 * Production sends neither. Across 124 projects in `editron_prev`, ZERO ever produced a motion-graphic overlay
 * from the live director, and `intelligence.mgCodegenRun` is 0 on every one. Robert (proj_mEdsl_OvLXc4) is the
 * reference failure: the Creative Brief emitted a correct, grounded stat-counter for "this is thirty-five US"
 * (value '35', title 'US Dollars', confidence 0.95) and it never became an overlay.
 *
 * These two cases are the content the system actually receives:
 *   1. a plain spoken QUANTITY that is not a percentage (currency/count) — the commonest stat in real speech
 *   2. a FACTLESS narrative beat — the P3.5 door (KIT e1.8): "licensed by the DESIGNER within the density
 *      budget, never by this ledger". Most moments in a talking-head video are this.
 *
 * BOTH ARE EXPECTED TO FAIL until the narrative-beat producer + quantity-kind mapping land. That is the point:
 * this file is the regression gate that turns "MG works" from a claim into a measurement. Do NOT relax these
 * assertions or delete the file to get green — every MG test in this repo asserts on an intermediate stage
 * (plan valid / code compiles / frame renders); this is the only one that asserts on the OUTPUT.
 *
 * Inputs are traced, not invented: '35' / 'US Dollars' / 0.95 / the contextPhrase are verbatim from Robert's
 * stored decision. Salience is deliberately OMITTED so it defaults to 0.5 (semantic-mg-candidates.ts:489),
 * exactly as it does in production — the existing seam test hardcodes 0.9 and hides this.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assetsFindOne: vi.fn(async () => null),
  assetsUpdateOne: vi.fn(async () => ({ upsertedCount: 1 })),
  projectsFindOne: vi.fn(async () => ({ projectId: 'mg-real-project', orgId: 'org-1' })),
  projectsUpdateOne: vi.fn(async () => ({ matchedCount: 1 })),
  runDurableMgRenderJob: vi.fn(),
  captureMgVisualEvidence: vi.fn(),
  recordStorageUsage: vi.fn(async () => undefined),
  deleteR2Prefix: vi.fn(async () => 0),
}));

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  audioDescriptionToSearchQuery: vi.fn((description: string) => description),
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: vi.fn(async () => ({
    collection: (name: string) => name === 'projects'
      ? { findOne: mocks.projectsFindOne, updateOne: mocks.projectsUpdateOne }
      : { findOne: mocks.assetsFindOne, updateOne: mocks.assetsUpdateOne },
  })),
}));

vi.mock('@/lib/editron/motion-graphics/codegen/mg-render-job-runner', () => ({
  resolveMgRenderAppCommit: vi.fn(() => '350b04ccb037ce3ae018627a1b6df0d3f959e2b8'),
  runDurableMgRenderJob: mocks.runDurableMgRenderJob,
}));

vi.mock('@/lib/editron/motion-graphics/codegen/visual-evidence', () => ({
  captureMgVisualEvidence: mocks.captureMgVisualEvidence,
  // Designer footage frames are best-effort (absent → text-only design session); empty keeps the test hermetic.
  captureMgDesignerFootageFrames: vi.fn(async () => ({})),
}));

vi.mock('@/lib/services/storage-quota-service', () => ({
  resolveStorageOwner: vi.fn((userId: string, orgId?: string) => (
    orgId ? { id: orgId, type: 'org' } : { id: userId, type: 'user' }
  )),
  recordStorageUsage: mocks.recordStorageUsage,
}));

vi.mock('@/lib/editron/services/r2-service', () => ({
  deleteR2Prefix: mocks.deleteR2Prefix,
  uploadToR2: vi.fn(),
}));

// The DESIGNER model boundary (same treatment as the render worker): the video-level design session approves
// every offered beat, echoing the prepass momentIds. This is what licenses a narrative beat (P3.5) — with this
// mock REMOVED, the narrative test must fail again (no plan → plan-or-skip discipline → 0 overlays).
vi.mock('@/lib/editron/motion-graphics/codegen/design/design-session', () => ({
  runVideoDesignSession: vi.fn(async (input: { designer: { moments: Array<{ momentId: string }> } }) => ({
    attempts: 1,
    plan: {
      brief: { concept: 'test-brief', arc: 'steady', palette: 'brand' },
      moments: input.designer.moments.map((m) => ({ momentId: m.momentId })),
      declined: [],
    },
  })),
}));

import { OverlayType, type Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { executeEDL } from '@/lib/editron/services/edl-executor';
import type { EditDecisionList } from '@/lib/editron/services/reactive-edit-engine';

const RECEIPT = {
  momentId: 'm1',
  promptHash: 'prompt-hash',
  attempts: 1,
  scans: [{ passed: true }],
  compiled: true,
  judgeScore: 9,
  judgeIssues: [],
  outcome: 'generated' as const,
};

const VISUAL_EVIDENCE = {
  space: 'edited-canvas' as const,
  canvas: { width: 1920, height: 1080 },
  frames: [
    {
      role: 'context-before' as const,
      coordinate: { kind: 'edited-timeline' as const, timelineFrame: 30 },
      imageDataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQiirUo/+BiOh/AAA=',
    },
  ],
};

function sourceOverlays(): Overlay[] {
  return [{
    id: 1,
    type: OverlayType.VIDEO,
    from: 0,
    durationInFrames: 300,
    row: 0,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    assetId: 'source-1',
    content: 'https://example.com/source.mp4',
    src: 'https://example.com/source.mp4',
    styles: { opacity: 1 },
  } as Overlay];
}

function edlWith(params: Record<string, unknown>, signal: string, reason: string): EditDecisionList {
  return {
    projectId: 'mg-real-project',
    generatedAt: new Date('2026-07-21T00:00:00.000Z'),
    totalDecisions: 1,
    decisions: [{
      type: 'graphic',
      frame: 30,
      durationFrames: 90,
      priority: 3,
      source: 'creative-brief:test',
      signal,
      reason,
      confidence: 0.95,
      params,
    }],
    stats: {
      cutsPerMinute: 0,
      transitionCount: 0,
      graphicCount: 1,
      zoomCount: 0,
      speedChangeCount: 0,
      averageConfidence: 0.95,
    },
  } as EditDecisionList;
}

/** Robert's REAL decision (DB editron_prev/proj_mEdsl_OvLXc4). Currency, not a percentage. No salience set.
 *
 *  The `signals` snapshot models what live `enrichDecisionSignals` (edl-executor:981) attaches from the video's
 *  own analysis before applyGraphic runs — values traced to Robert's ACTUAL run logs, not invented:
 *    word_importance 0.52 ← "[Director] Path D: Moment weights Phase 2, 15 segments, avg=0.52"
 *    speech_energy   0.5  ← genre params energy_baseline ≈ 0.5 (mid-energy talking head)
 *    emotional_arousal 0.13 ← "[Wav2VecService] avg emotion: 0.13"
 *  Deliberately MID-RANGE (the lab fixture's salience 0.9 has no basis in this video). The pre-fix kill was at
 *  the bundle-time LEDGER gate, which reads raw params and no signals at all — so this test isolates the
 *  quantity-kind licensing fix; the signals only make the downstream authority gate see a realistically
 *  enriched decision instead of a signal-less one (which models "video with no analysis data", a different case). */
function plainCurrencyEdl(): EditDecisionList {
  return edlWith({
    graphicType: 'stat-counter',
    value: '35',
    title: 'US Dollars',
    contextPhrase: 'biggest investment today is this, this is thirty-five US, and I think everybody in the world can',
    contextStartMs: 20433,
    contextEndMs: 26167,
    targetWord: 'thirty-five',
    sourceSpan: { text: 'this is thirty-five US', startMs: 22233, endMs: 22867 },
    signals: { word_importance: 0.52, speech_energy: 0.5, emotional_arousal: 0.13 },
  }, 'number_mentioned', 'number_mentioned');
}

/** A factless transcript beat — the P3.5 narrative door. Carries only its verbatim spoken line. */
function narrativeBeatEdl(): EditDecisionList {
  return edlWith({
    graphicType: 'narrative',
    line: "How come they don't teach us money at school?",
    sourceSpan: { text: "How come they don't teach us money at school?", startMs: 54367, endMs: 58633 },
  }, 'narrative_beat', 'emphasis_word');
}

beforeEach(() => {
  process.env.MG_CODEGEN_ENABLED = 'true';
  // Dummy key satisfies the prepass availability guard; the actual designer model call is MOCKED above
  // (design-session), so nothing leaves the process. Without a key the prepass bails pre-mock → no design
  // session → the narrative plan-or-skip discipline correctly yields 0 (that scenario = "designer unavailable").
  process.env.GEMINI_API_KEY = 'test-designer-key';
  vi.clearAllMocks();
  mocks.assetsFindOne.mockResolvedValue(null);
  mocks.assetsUpdateOne.mockResolvedValue({ upsertedCount: 1 });
  mocks.projectsFindOne.mockResolvedValue({ projectId: 'mg-real-project', orgId: 'org-1' });
  mocks.projectsUpdateOne.mockResolvedValue({ matchedCount: 1 });
  mocks.captureMgVisualEvidence.mockResolvedValue(VISUAL_EVIDENCE);
  mocks.runDurableMgRenderJob.mockResolvedValue({
    status: 'generated',
    sequence: {
      address: { sequenceId: 'tenant-seq-1', frameCount: 90, cdnBaseUrl: 'https://cdn.example.com' },
      r2Prefix: 'mgseq_tenant-seq-1_',
      fps: 30,
      width: 1920,
      height: 1080,
      frameFormat: 'webp',
      transparent: true,
      sizeBytes: 1200,
      renderMs: 45,
    },
    receipt: RECEIPT,
  });
});

afterEach(() => {
  delete process.env.MG_CODEGEN_ENABLED;
  delete process.env.GEMINI_API_KEY;
});

async function runAndCountMg(edl: EditDecisionList): Promise<{ created: number; mgOverlays: number }> {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const overlays = sourceOverlays();
  const result = await executeEDL(edl, 'mg-real-project', 'user-1', overlays, { width: 1920, height: 1080 });
  const mgOverlays = overlays.filter(
    (o) => o.type === OverlayType.MG_SEQUENCE || o.type === OverlayType.MOTION_GRAPHIC,
  ).length;
  return { created: result.overlaysCreated, mgOverlays };
}

describe('live MG seam — REAL content (not lab-perfect fixtures)', () => {
  it('renders a graphic for a plain spoken currency amount ("this is thirty-five US")', async () => {
    const { created, mgOverlays } = await runAndCountMg(plainCurrencyEdl());

    // A spoken dollar figure is a CKG-endorsed stat-graphic anchor (technique:graphic.stat_counter format
    // `currency ($49)`), and signal:entity.number calls an unreinforced number a MISSED OPPORTUNITY.
    // Today this yields 0: '35' is not a percentage → not bounded, has no quantityKind/unit → not magnitude
    // → factKind 'weak-stat', and salience defaults to 0.5 (< 0.66) → gateBlocks pushes
    // 'weak-stat-needs-salience-or-relation' → the candidate is suppressed → no overlay.
    expect(mgOverlays, 'a spoken currency amount must produce a motion graphic').toBeGreaterThan(0);
    expect(created).toBeGreaterThan(0);
  });

  it('renders a graphic for a factless narrative beat (P3.5 door)', async () => {
    const { created, mgOverlays } = await runAndCountMg(narrativeBeatEdl());

    // The P3.5 door (KIT e1.8) says a plain transcript beat with no extracted fact is "licensed by the DESIGNER
    // within the density budget, never by this ledger". Today nothing constructs a narrative beat (no factKind
    // 'narrative' is ever assigned in lib/) and worker-contract.ts:56 omits it from its enum, so a factless beat
    // yields 0 ledger candidates and never reaches the designer.
    expect(mgOverlays, 'a factless transcript beat must be offered to the designer and can become a graphic').toBeGreaterThan(0);
    expect(created).toBeGreaterThan(0);
  });
});
