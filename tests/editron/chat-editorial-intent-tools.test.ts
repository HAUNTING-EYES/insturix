import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  applyGroundedEditorialIntent,
  buildTargetedSignalDecisions,
  compileGroundedEditorialIntent,
  filterChatShadowAuthorityTools,
  type ChatEditorialIntentDependencies,
  type GroundedEditorialIntent,
} from '@/lib/editron/agent/chat-editorial-intent-tools';
import {
  CHAT_EVIDENCE_RANKING_POLICY,
  type CanonicalChatEvidenceCandidate,
} from '@/lib/editron/services/chat-multimodal-evidence';
import { planUnifiedDecisionBundleFromCandidates } from '@/lib/editron/services/unified-decision-bundle';

function candidate(overrides: Partial<CanonicalChatEvidenceCandidate> = {}): CanonicalChatEvidenceCandidate {
  return {
    evidenceId: 'evidence-1',
    assetId: 'asset-1',
    overlayId: 'video-1',
    overlayType: 'video',
    sourceStartMs: 3_000,
    sourceEndMs: 5_000,
    startFrame: 120,
    endFrame: 180,
    text: 'Revenue grew from 10 to 20 because retention improved',
    transcriptText: 'Revenue grew from 10 to 20 because retention improved',
    visualText: 'presenter points to a rising revenue chart',
    boundingBox: { x: 0.58, y: 0.12, width: 0.31, height: 0.7, units: 'normalized' },
    score: 0.91,
    accepted: true,
    safeForAutomaticMutation: true,
    matchType: 'semantic-corroborated',
    scores: {
      exactPhrase: 0,
      lexical: 0.44,
      textSemantic: 0.9,
      imageSemantic: 0.86,
      importance: 0.84,
      combined: 0.91,
    },
    modalityPresence: {
      transcript: true,
      visualFacts: true,
      ocr: true,
      spatial: true,
      motion: true,
      vocal: true,
      music: false,
      sourceToCutMapping: true,
      textEmbedding: true,
      imageEmbedding: true,
    },
    missingModalities: ['music'],
    rejectionReasons: [],
    sourcePaths: ['editron_asset_analyses.asset-1.segmentAnalysis.segments.0'],
    ...overrides,
  };
}

function project() {
  return {
    projectId: 'project-1',
    fps: 30,
    durationInFrames: 600,
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    overlays: [
      { id: 'video-1', type: 'video', from: 0, durationInFrames: 150, assetId: 'asset-1' },
      { id: 'video-2', type: 'video', from: 150, durationInFrames: 450, assetId: 'asset-2' },
    ],
  };
}

function dependencies(overrides: Partial<ChatEditorialIntentDependencies> = {}): ChatEditorialIntentDependencies {
  return {
    loadProject: vi.fn(async () => project()),
    searchEvidence: vi.fn(async () => ({
      auditId: 'audit-1',
      candidates: [candidate()],
      analyzedDocumentCount: 4,
      embeddedDocumentCount: 4,
      rankingPolicy: CHAT_EVIDENCE_RANKING_POLICY,
    })),
    executeProjectIntent: vi.fn(async () => ({
      owner: 'director-unified-planner' as const,
      status: 'executed' as const,
      mutated: true,
      executedDecisions: 2,
      reasons: [],
    })),
    executeTargetedIntent: vi.fn(async () => ({
      owner: 'targeted-unified-planner' as const,
      status: 'executed' as const,
      mutated: true,
      executedDecisions: 1,
      reasons: [],
    })),
    dispatchScriptIntent: vi.fn(async () => ({
      owner: 'phase2-script-planner' as const,
      status: 'queued' as const,
      mutated: false,
      reasons: [],
    })),
    persistAudit: vi.fn(async () => undefined),
    now: vi.fn(() => new Date('2026-07-16T00:00:00.000Z')),
    ...overrides,
  };
}

describe('chat semantic editorial intent', () => {
  it('captures the full intent contract without introducing renderer forms', () => {
    const compiled = compileGroundedEditorialIntent({
      goal: 'Make the proof land harder without making the edit noisy',
      scope: { kind: 'moment', startFrame: 100, endFrame: 220, overlayIds: ['video-1'] },
      targetReference: 'when revenue doubles',
      constraints: ['Keep the speaker visible', 'Do not cover the chart'],
      strength: 0.72,
      uncertainty: 0.08,
      families: {
        motionGraphics: { mode: 'prefer', frequency: 0.45, intensity: 0.72 },
        transitions: { mode: 'off' },
      },
      notes: 'Use the client brand language',
    });

    expect(compiled).toMatchObject({
      goal: 'Make the proof land harder without making the edit noisy',
      scope: { kind: 'moment', startFrame: 100, endFrame: 220, overlayIds: ['video-1'] },
      targetReference: 'when revenue doubles',
      constraints: ['Keep the speaker visible', 'Do not cover the chart'],
      strength: 0.72,
      uncertainty: 0.08,
      editorialPreferences: {
        families: {
          motionGraphics: { mode: 'prefer', frequency: 0.45, intensity: 0.72 },
          transitions: { mode: 'off' },
        },
      },
    });
    const serialized = JSON.stringify(compiled);
    expect(serialized).not.toContain('graphicType');
    expect(serialized).not.toContain('transitionType');
    expect(serialized).not.toContain('sfxType');
    expect(serialized).not.toContain('captionStyle');
  });

  it('removes only chat shadow-authority tools and keeps deterministic/editor owners available elsewhere', () => {
    const tools = [
      { name: 'read_project_file' },
      { name: 'add_motion_graphic' },
      { name: 'auto_motion_graphics' },
      { name: 'add_transition' },
      { name: 'auto_edit_from_script' },
      { name: 'cut_section' },
    ];
    expect(filterChatShadowAuthorityTools(tools).map((entry) => entry.name)).toEqual([
      'read_project_file',
      'cut_section',
    ]);
    expect(tools).toHaveLength(6);
  });

  it('routes project-wide outcomes to Director with canonical retrieval recorded', async () => {
    const deps = dependencies();
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Make the edit feel more engaging but still restrained',
        scope: { kind: 'project' },
        constraints: [],
        strength: 0.55,
        uncertainty: 0.12,
      },
    }, deps);

    expect(result.status).toBe('success');
    expect(result.dispatch.owner).toBe('director-unified-planner');
    expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
    expect(deps.searchEvidence).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Make the edit feel more engaging but still restrained',
    }));
    expect(deps.persistAudit).toHaveBeenCalledOnce();
  });

  it('keeps weak or ambiguous targeted evidence advisory and never mutates', async () => {
    const deps = dependencies({
      searchEvidence: vi.fn(async () => ({
        auditId: 'audit-weak',
        candidates: [candidate({
          score: 0.49,
          accepted: false,
          safeForAutomaticMutation: false,
          rejectionReasons: ['below-semantic-threshold'],
        })],
        analyzedDocumentCount: 4,
        embeddedDocumentCount: 4,
        rankingPolicy: CHAT_EVIDENCE_RANKING_POLICY,
      })),
    });
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Make that part pop',
        scope: { kind: 'moment' },
        targetReference: 'that part',
        constraints: [],
        strength: 0.8,
        uncertainty: 0.2,
      },
    }, deps);

    expect(result.status).toBe('advisory');
    expect(result.dispatch.reasons).toContain('no-safe-canonical-evidence');
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
    expect(deps.executeProjectIntent).not.toHaveBeenCalled();
  });

  it('builds fact and signal candidates while leaving physical forms to existing owners', () => {
    const intent: GroundedEditorialIntent = compileGroundedEditorialIntent({
      goal: 'Make the doubling proof clear and impactful',
      scope: { kind: 'moment', startFrame: 100, endFrame: 200 },
      targetReference: 'Revenue grew from 10 to 20',
      constraints: [],
      strength: 0.75,
      uncertainty: 0.05,
      families: {
        captions: { mode: 'prefer' },
        motionGraphics: { mode: 'prefer' },
        zoom: { mode: 'prefer' },
        transitions: { mode: 'prefer' },
        sfx: { mode: 'prefer' },
      },
    });
    const decisions = buildTargetedSignalDecisions(project(), intent, [candidate({ startFrame: 145 })]);

    expect(decisions.map((decision) => decision.type)).toEqual([
      'graphic',
      'zoom',
      'caption-emphasis',
      'transition',
      'sfx-trigger',
    ]);
    const graphic = decisions.find((decision) => decision.type === 'graphic');
    expect(graphic?.params.semanticAtoms).toBeTruthy();
    expect(graphic?.params.semanticMgCandidateLedger).toBeTruthy();
    expect(graphic?.params).not.toHaveProperty('graphicType');
    expect(decisions.find((decision) => decision.type === 'zoom')?.params).not.toHaveProperty('targetScale');
    expect(decisions.find((decision) => decision.type === 'transition')?.params).toMatchObject({
      boundaryFrame: 150,
      clipAId: 'video-1',
      clipBId: 'video-2',
      transitionType: 'hard-cut',
    });
    expect(decisions.find((decision) => decision.type === 'sfx-trigger')?.params).toMatchObject({
      sfxRole: 'editorial-emphasis',
      sfxType: 'none',
    });
  });

  it('lets strong chat evidence become executable through the unified planner without a Creative Brief label', () => {
    const intent = compileGroundedEditorialIntent({
      goal: 'Make the revenue proof visually clear',
      scope: { kind: 'moment' },
      targetReference: 'Revenue grew from 10 to 20',
      constraints: [],
      strength: 0.7,
      uncertainty: 0,
      families: { motionGraphics: { mode: 'prefer' } },
    });
    const decisions = buildTargetedSignalDecisions(project(), intent, [candidate()]);
    const bundle = planUnifiedDecisionBundleFromCandidates([{
      source: 'signal-driven',
      edl: {
        projectId: 'project-1',
        generatedAt: new Date('2026-07-16T00:00:00.000Z'),
        totalDecisions: decisions.length,
        decisions,
        stats: { cutsPerMinute: 0, transitionCount: 0, graphicCount: 1, zoomCount: 0, speedChangeCount: 0, averageConfidence: 0.91 },
      },
      editorialPreferences: intent.editorialPreferences,
    }]);

    expect(bundle?.authority.executableProducer).toBe('unified-planner');
    expect(bundle?.edl.decisions).toHaveLength(1);
    expect(bundle?.edl.decisions[0]).toMatchObject({ type: 'graphic', source: 'signal-driven-chat-intent' });
  });
  it('dispatches scripts only to the Phase 2 owner', async () => {
    const deps = dependencies();
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Reorder every uploaded clip to follow this script',
        scope: { kind: 'project' },
        constraints: ['Use all relevant uploaded assets'],
        strength: 0.5,
        uncertainty: 0,
        script: 'First show the problem. Then show the chart. End with the proof.',
      },
    }, deps);

    expect(result.dispatch.owner).toBe('phase2-script-planner');
    expect(deps.dispatchScriptIntent).toHaveBeenCalledOnce();
    expect(deps.executeProjectIntent).not.toHaveBeenCalled();
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
  });

  it.each(['none', '(none)', 'none provided', 'null', 'undefined', 'N/A', 'not applicable'])(
    'treats optional-script sentinel %j as absent instead of activating script recomposition',
    async (script) => {
      const deps = dependencies();
      const result = await applyGroundedEditorialIntent({
        userId: 'user-1',
        projectId: 'project-1',
        input: {
          goal: 'Match the restraint of the reference edit',
          scope: { kind: 'project' },
          constraints: [],
          strength: 0.6,
          uncertainty: 0,
          script,
        },
      }, deps);

      expect(result.intent).not.toHaveProperty('script');
      expect(result.dispatch.owner).toBe('director-unified-planner');
      expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
      expect(deps.dispatchScriptIntent).not.toHaveBeenCalled();
    },
  );

  it('removes hidden prompt recipes from the live chat graph', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/agent-graph.ts'), 'utf8');
    expect(source).toContain('apply_editorial_intent');
    expect(source).not.toContain('call add_transition({ applyToAll: true })');
    expect(source).not.toContain("call auto_motion_graphics({ density: 'moderate' })");
    expect(source).not.toContain('Always provide `graphicType`');
    expect(source).not.toContain('Always try `add_motion_graphic` FIRST');
    expect(source).not.toContain('Use `auto_edit_from_script` with the script text');
  });
});
