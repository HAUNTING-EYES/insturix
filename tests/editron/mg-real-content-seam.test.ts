/**
 * MG LIVE SEAM — REAL CONTENT (guardrail; async contract, updated 2026-07-22).
 *
 * WHY THIS EXISTS: `mg-live-codegen-seam.test.ts` proves the seam with PERFECT input — `value: '47%'`
 * (percentage → bounded-stat → 'bounded-proportion' license) AND explicit `signals.salience: 0.9` (clears the
 * 0.66 gate). Both escape hatches at once, so the ledger's behaviour on ORDINARY speech was never exercised,
 * and across 124 projects in `editron_prev` zero real videos ever produced a motion graphic from the director.
 *
 * This file exercises the content the system actually receives, both traced from Robert (proj_mEdsl_OvLXc4):
 *   1. a plain spoken CURRENCY ("this is thirty-five US" → value '35', title 'US Dollars', NO explicit salience)
 *      — must license as magnitude-stat via the derived quantityKind, not die as weak-stat.
 *   2. a FACTLESS narrative beat (P3.5 door) — must be licensed by the DESIGNER within the density budget.
 *
 * ASYNC CONTRACT (Codex c27d689e "run sequence renders outside director"): the director no longer renders MG
 * inline (a real render is 145-273s inside an 800s function — a wedge lost a whole edit). It ENQUEUES a durable
 * render job and returns; the mg-render worker renders + attaches the overlay afterwards. So the OUTPUT this
 * guardrail asserts is now "real content survives the ledger and is dispatched to render with the right
 * license", plus "the director does NOT block (0 overlays created inline)". The other half — a dispatched job's
 * delivery actually attaching an MG_SEQUENCE overlay via $push — is owned by mg-render-job-runner.test.ts
 * ("lets the worker claim, render, deliver..."). Together the two files are the end-to-end guardrail.
 *
 * DO NOT relax these assertions to get green. A currency stat that does not reach enqueue as `magnitude-stat`,
 * or a narrative beat that does not reach enqueue as `narrative`, means real content is being thrown away again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assetsFindOne: vi.fn(async () => null),
  assetsUpdateOne: vi.fn(async () => ({ upsertedCount: 1 })),
  projectsFindOne: vi.fn(async () => ({ projectId: 'mg-real-project', orgId: 'org-1' })),
  projectsUpdateOne: vi.fn(async () => ({ matchedCount: 1 })),
  enqueueDurableMgRenderJob: vi.fn(),
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

// Async contract: the executor dispatches via enqueueDurableMgRenderJob (never runs the sandbox in-caller).
vi.mock('@/lib/editron/motion-graphics/codegen/mg-render-job-runner', () => ({
  resolveMgRenderAppCommit: vi.fn(() => '350b04ccb037ce3ae018627a1b6df0d3f959e2b8'),
  enqueueDurableMgRenderJob: mocks.enqueueDurableMgRenderJob,
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
// mock REMOVED, the narrative test must fail again (no plan → plan-or-skip discipline → nothing dispatched).
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
 *  The `signals` snapshot models what live `enrichDecisionSignals` attaches from the video's own analysis —
 *  traced from Robert's run logs (word_importance 0.52 = "Moment weights avg=0.52"; emotional_arousal 0.13 =
 *  "avg emotion: 0.13"). Deliberately MID-RANGE; the lab fixture's salience 0.9 has no basis in this video. */
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
  // Dummy key satisfies the prepass availability guard; the designer model call is MOCKED (design-session).
  process.env.GEMINI_API_KEY = 'test-designer-key';
  vi.clearAllMocks();
  mocks.assetsFindOne.mockResolvedValue(null);
  mocks.assetsUpdateOne.mockResolvedValue({ upsertedCount: 1 });
  mocks.projectsFindOne.mockResolvedValue({ projectId: 'mg-real-project', orgId: 'org-1' });
  mocks.projectsUpdateOne.mockResolvedValue({ matchedCount: 1 });
  mocks.captureMgVisualEvidence.mockResolvedValue(VISUAL_EVIDENCE);
  // Dispatch-and-return: the job is queued for the isolated worker, no inline render, no overlay yet.
  mocks.enqueueDurableMgRenderJob.mockResolvedValue({
    jobId: 'mgr_00000000000000000000000000000001',
    status: 'queued',
    messageId: 'msg_test',
  });
});

afterEach(() => {
  delete process.env.MG_CODEGEN_ENABLED;
  delete process.env.GEMINI_API_KEY;
});

interface SeamRun {
  createdInline: number;
  mgOverlaysInline: number;
  enqueued: ReturnType<typeof vi.fn>;
}

async function runSeam(edl: EditDecisionList): Promise<SeamRun> {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const overlays = sourceOverlays();
  const result = await executeEDL(edl, 'mg-real-project', 'user-1', overlays, { width: 1920, height: 1080 });
  const mgOverlaysInline = overlays.filter(
    (o) => o.type === OverlayType.MG_SEQUENCE || o.type === OverlayType.MOTION_GRAPHIC,
  ).length;
  return { createdInline: result.overlaysCreated, mgOverlaysInline, enqueued: mocks.enqueueDurableMgRenderJob };
}

/** The candidate factKind on the first enqueued render job (input.candidate.factKind). */
function enqueuedFactKind(enqueued: ReturnType<typeof vi.fn>): string | undefined {
  const call = enqueued.mock.calls[0]?.[0] as { input?: { candidate?: { factKind?: string } } } | undefined;
  return call?.input?.candidate?.factKind;
}

describe('live MG seam — REAL content is licensed and DISPATCHED (async contract)', () => {
  it('licenses a plain spoken currency as magnitude-stat and dispatches a render job', async () => {
    const { createdInline, mgOverlaysInline, enqueued } = await runSeam(plainCurrencyEdl());

    // The whole point: '35' + 'US Dollars' → derived quantityKind 'currency' → magnitude-stat (licensed),
    // NOT weak-stat (blocked by the 0.66 salience gate). If this regresses, the currency is thrown away.
    expect(enqueued, 'a spoken currency amount must reach the render dispatcher').toHaveBeenCalledTimes(1);
    expect(enqueuedFactKind(enqueued)).toBe('magnitude-stat');
    // Async: the director dispatches and returns — it must NOT render inline (that wedge lost a whole edit).
    expect(createdInline).toBe(0);
    expect(mgOverlaysInline).toBe(0);
  });

  it('licenses a factless narrative beat via the designer and dispatches a render job', async () => {
    const { createdInline, mgOverlaysInline, enqueued } = await runSeam(narrativeBeatEdl());

    // P3.5: the designer licensed the factless beat (mocked design session), so it must reach dispatch as
    // factKind 'narrative'. If this regresses, the narrative lane is dead again.
    expect(enqueued, 'a designer-licensed narrative beat must reach the render dispatcher').toHaveBeenCalledTimes(1);
    expect(enqueuedFactKind(enqueued)).toBe('narrative');
    expect(createdInline).toBe(0);
    expect(mgOverlaysInline).toBe(0);
  });
});
