import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  applyGroundedEditorialIntent,
  buildTargetedSignalDecisions,
  compileGroundedEditorialIntent,
  createChatEditorialIntentTools,
  dispatchProjectIntentToDurableJob,
  enforceServerEditorialFamilyScope,
  filterChatShadowAuthorityTools,
  type ChatEditorialIntentDependencies,
  type GroundedEditorialIntent,
} from '@/lib/editron/agent/chat-editorial-intent-tools';
import { verifyChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import {
  chatEditorialIntentWireSchema,
  compileChatEditorialIntentWire,
  normalizeChatEditorialIntentWireAliases,
} from '@/lib/editron/agent/chat-editorial-intent-wire';
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
      { name: 'extract_style' },
      { name: 'apply_style' },
      { name: 'cut_section' },
    ];
    expect(filterChatShadowAuthorityTools(tools).map((entry) => entry.name)).toEqual([
      'read_project_file',
      'cut_section',
    ]);
    expect(tools).toHaveLength(8);
  });

  it('server-enforces an exclusive SFX request without choosing its asset or form', () => {
    const input = enforceServerEditorialFamilyScope({
      goal: 'Add a tasteful sound effect at the strongest beat',
      scope: { kind: 'project' },
      constraints: [],
      strength: 0.5,
      uncertainty: 0,
    }, [{ family: 'sfx', mode: 'prefer' }], true);

    expect(input.families).toEqual({
      sfx: { mode: 'prefer' },
    });
    expect(JSON.stringify(input)).not.toMatch(/asset|token|query|form|type/i);
  });

  it('preserves broad freedom and hard off directives while correcting a missing family mode', () => {
    const input = enforceServerEditorialFamilyScope({
      goal: 'Improve the whole edit, add music, and do not use motion graphics',
      scope: { kind: 'project' },
      constraints: [],
      strength: 0.5,
      uncertainty: 0,
      families: {
        captions: { mode: 'prefer', frequency: 0.4 },
      },
    }, [
      { family: 'music', mode: 'prefer' },
      { family: 'motionGraphics', mode: 'off' },
    ], false);

    expect(input.families).toEqual({
      captions: { mode: 'prefer', frequency: 0.4 },
      music: { mode: 'prefer' },
      motionGraphics: { mode: 'off' },
    });
    expect(input.families).not.toHaveProperty('zoom');
  });

  it('fails closed on invalid server family contracts', () => {
    const input = {
      goal: 'Improve the edit',
      scope: { kind: 'project' as const },
      constraints: [],
      strength: 0.5,
      uncertainty: 0,
    };
    expect(() => enforceServerEditorialFamilyScope(input, [], true)).toThrow(
      'requires a preferred family',
    );
    expect(() => enforceServerEditorialFamilyScope(input, [
      { family: 'sfx', mode: 'prefer' },
      { family: 'sfx', mode: 'off' },
    ], false)).toThrow('duplicate family');
  });

  it('injects the owner-classified family contract before durable dispatch', async () => {
    const deps = dependencies();
    const intentTool = createChatEditorialIntentTools({
      userId: 'user-1',
      projectId: 'project-1',
      requiredFamilyDirectives: [{ family: 'motionGraphics', mode: 'prefer' }],
      familyScopeExclusive: true,
    }, deps).find((candidate) => candidate.name === 'apply_editorial_intent');
    expect(intentTool).toBeDefined();

    await intentTool!.invoke({
      goal: 'Create a process diagram for this explanation',
      scopeKind: 'project',
    });

    expect(deps.executeProjectIntent).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({
        editorialPreferences: {
          families: {
            motionGraphics: { mode: 'prefer' },
          },
        },
        executionScope: {
          version: 'editorial-execution-scope-v1',
          source: 'chat-editorial-intent',
          mode: 'explicit-families-only',
          families: ['motionGraphics'],
        },
      }),
    }));
  });

  it('queues reference video style through the durable worker using server-owned turn identity', async () => {
    const queueReferenceStyleJob = vi.fn(async () => ({
      status: 'queued' as const,
      jobId: 'chat_style_123',
      messageId: 'qstash-123',
    }));
    const tools = createChatEditorialIntentTools(
      {
        userId: 'user-1',
        projectId: 'project-1',
        sessionId: 'session-123',
        operationId: 'operation-123',
      },
      undefined,
      { queueReferenceStyleJob },
    );
    const referenceTool = tools.find((candidate) => candidate.name === 'apply_reference_style');
    expect(referenceTool).toBeDefined();

    const output = JSON.parse(await referenceTool!.invoke({
      referenceAssetId: 'asset-reference-video',
      strength: 0.72,
    }) as string);

    expect(queueReferenceStyleJob).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      sessionId: 'session-123',
      operationId: 'operation-123',
      referenceAssetId: 'asset-reference-video',
      strength: 0.72,
    });
    expect(output).toMatchObject({
      status: 'success',
      data: {
        jobId: 'chat_style_123',
        queueStatus: 'queued',
        messageId: 'qstash-123',
      },
    });
    expect(output.nextAction).toContain('processing');
  });

  it('normalizes only unambiguous legacy intent aliases into the flat wire', () => {
    const normalized = normalizeChatEditorialIntentWireAliases({
      goal: 'Make the proof land',
      scope: { kind: 'moment', startFrame: '100', endFrame: '220', overlayIds: ['video-1'] },
      constraints: ['Keep the speaker visible', 'Do not cover the chart'],
      strength: '0.72',
      uncertainty: '0.08',
      families: {
        motionGraphics: { mode: 'prefer', frequency: '0.45', intensity: 0.72 },
        transitions: 'off',
      },
      script: 'none',
    });

    expect(normalized).toMatchObject({
      scopeKind: 'moment',
      startFrame: 100,
      endFrame: 220,
      constraintsText: 'Keep the speaker visible\nDo not cover the chart',
      strength: 0.72,
      uncertainty: 0.08,
      motionGraphicsMode: 'prefer',
      motionGraphicsFrequency: 0.45,
      motionGraphicsIntensity: 0.72,
      transitionsMode: 'off',
      scriptText: 'none',
    });
    const compiled = compileChatEditorialIntentWire(
      chatEditorialIntentWireSchema.parse(normalized),
      { userTurnText: 'Make the proof land' },
    );
    expect(compiled).toMatchObject({
      scope: { kind: 'moment', startFrame: 100, endFrame: 220, overlayIds: ['video-1'] },
      constraints: ['Keep the speaker visible', 'Do not cover the chart'],
      families: {
        motionGraphics: { mode: 'prefer', frequency: 0.45, intensity: 0.72 },
        transitions: { mode: 'off' },
      },
    });
    expect(compiled).not.toHaveProperty('script');
  });

  it('rejects semantic-invalid aliases instead of inventing numeric meaning', () => {
    const namedStrength = normalizeChatEditorialIntentWireAliases({
      goal: 'Make this stronger',
      scope: 'project',
      constraints: 'Keep it tasteful',
      families: ['motionGraphics'],
      strength: 'high',
      uncertainty: 'low',
    });

    const parsed = chatEditorialIntentWireSchema.safeParse(namedStrength);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('named semantic values unexpectedly parsed');
    expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['strength', 'uncertainty']),
    );
  });

  it('allows a grounded inline script and rejects a model-invented script', async () => {
    const deps = dependencies();
    const intentTool = createChatEditorialIntentTools(
      { userId: 'user-1', projectId: 'project-1' },
      deps,
    ).find((candidate) => candidate.name === 'apply_editorial_intent');
    expect(intentTool).toBeDefined();
    const script = 'First show the problem. Then reveal the chart. End with the proof.';

    const accepted = JSON.parse(await intentTool!.invoke({
      goal: 'Reorder the uploaded clips to this script',
      scopeKind: 'project',
      scriptText: script,
    }, {
      configurable: { chatUserTurnText: `Please follow this script exactly:\n${script}` },
    }) as string);
    expect(accepted).toMatchObject({
      status: 'success',
      data: { dispatch: { owner: 'phase2-script-planner', status: 'queued' } },
    });

    await expect(intentTool!.invoke({
      goal: 'Improve this video',
      scopeKind: 'project',
      scriptText: 'An invented script that never appeared in the user request.',
    }, {
      configurable: { chatUserTurnText: 'Please improve this video.' },
    })).rejects.toThrow(/scriptText must be copied from the current user message/);
  });

  it('accepts script-role attachment evidence but not an ordinary reference attachment', async () => {
    const intentTool = createChatEditorialIntentTools(
      { userId: 'user-1', projectId: 'project-1' },
      dependencies(),
    ).find((candidate) => candidate.name === 'apply_editorial_intent');
    expect(intentTool).toBeDefined();
    const script = 'Open on the sketch. Move to stitching. End on the finished garment.';
    const attachmentTurn = (role: 'script' | 'context') => [
      'Use the attached material to reorder the footage.',
      '<authorized_chat_attachments>',
      JSON.stringify({ attachmentId: 'reference:script-1', role }),
      '</authorized_chat_attachments>',
      '<untrusted_reference_content>',
      JSON.stringify({ attachmentId: 'reference:script-1', contentExcerpt: script }),
      '</untrusted_reference_content>',
    ].join('\n');

    const accepted = JSON.parse(await intentTool!.invoke({
      goal: 'Reorder the uploaded clips to the attached script',
      scopeKind: 'project',
      scriptText: script,
    }, {
      configurable: { chatUserTurnText: attachmentTurn('script') },
    }) as string);
    expect(accepted).toMatchObject({
      status: 'success',
      data: { dispatch: { owner: 'phase2-script-planner', status: 'queued' } },
    });

    await expect(intentTool!.invoke({
      goal: 'Reorder the uploaded clips to the reference',
      scopeKind: 'project',
      scriptText: script,
    }, {
      configurable: { chatUserTurnText: attachmentTurn('context') },
    })).rejects.toThrow(/scriptText must be copied from the current user message/);
  });

  it('routes project-wide outcomes to Director with canonical retrieval recorded', async () => {
    const deps = dependencies();
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      operationId: 'operation-1',
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
    expect(deps.executeProjectIntent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      operationId: 'operation-1',
    }));
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
    expect(deps.searchEvidence).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Make the edit feel more engaging but still restrained',
    }));
    expect(deps.persistAudit).toHaveBeenCalledOnce();
  });

  it('maps project-wide work to an owner-scoped durable receipt instead of running Director inline', async () => {
    const enqueue = vi.fn(async () => ({
      status: 'queued' as const,
      jobId: 'chat_intent_123',
      messageId: 'qstash-intent-123',
    }));
    const intent = compileGroundedEditorialIntent({
      goal: 'Make the whole edit more intentional',
      scope: { kind: 'project' },
      constraints: [],
      strength: 0.6,
      uncertainty: 0,
    });

    const dispatch = await dispatchProjectIntentToDurableJob({
      projectId: 'project-1',
      userId: 'user-1',
      sessionId: 'session-1',
      operationId: 'operation-1',
      intent,
    }, enqueue);

    expect(enqueue).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      sessionId: 'session-1',
      operationId: 'operation-1',
      intent,
    });
    expect(dispatch).toMatchObject({
      owner: 'director-unified-planner',
      status: 'queued',
      mutated: false,
      authority: {
        jobId: 'chat_intent_123',
        queueStatus: 'queued',
        messageId: 'qstash-intent-123',
      },
    });

    const verification = verifyChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { goal: intent.goal },
      resultData: { dispatch },
      beforeProject: project(),
      afterProject: project(),
    });
    expect(verification).toMatchObject({
      status: 'pass',
      stateChanged: false,
      renderVerification: { status: 'deferred', required: false },
    });
  });

  it('fails project-wide dispatch when server-owned durable turn identity is absent', async () => {
    const enqueue = vi.fn();
    const dispatch = await dispatchProjectIntentToDurableJob({
      projectId: 'project-1',
      userId: 'user-1',
      intent: compileGroundedEditorialIntent({
        goal: 'Make this better',
        scope: { kind: 'project' },
        constraints: [],
        strength: 0.5,
        uncertainty: 0,
      }),
    }, enqueue);

    expect(dispatch).toMatchObject({
      status: 'failed',
      mutated: false,
      reasons: ['durable-editorial-intent-context-unavailable'],
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('asks for one choice when weak evidence does not ground an ambiguous target', async () => {
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

    expect(result.status).toBe('needs-choice');
    expect(result.dispatch.reasons).toContain('no-safe-canonical-evidence');
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
    expect(deps.executeProjectIntent).not.toHaveBeenCalled();
  });

  it('returns a truthful no-op when an exact range is grounded but contains no safe edit opportunity', async () => {
    const deps = dependencies({
      searchEvidence: vi.fn(async () => ({
        auditId: 'audit-visible-range',
        candidates: [candidate({
          startFrame: 57,
          endFrame: 126,
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
    const intentTool = createChatEditorialIntentTools(
      { userId: 'user-1', projectId: 'project-1' },
      deps,
    ).find((tool) => tool.name === 'apply_editorial_intent');
    expect(intentTool).toBeDefined();

    const output = JSON.parse(await intentTool!.invoke({
      goal: 'Tighten this visible section without changing the rest',
      scopeKind: 'selection',
      startFrame: 0,
      endFrame: 270,
    }) as string);

    expect(output).toMatchObject({
      status: 'no-op',
      data: {
        status: 'no-op',
        dispatch: {
          mutated: false,
          reasons: ['no-safe-canonical-evidence'],
        },
      },
      error: null,
    });
    expect(output.nextAction).toContain('no grounded edit opportunity');
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
    expect(deps.persistAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 'no-op' }));
  });

  it('keeps high-uncertainty exact targets as needs-choice rather than no-op', async () => {
    const deps = dependencies();
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Do something tasteful here',
        scope: { kind: 'moment', startFrame: 100, endFrame: 200 },
        constraints: [],
        strength: 0.5,
        uncertainty: 1,
      },
    }, deps);

    expect(result.status).toBe('needs-choice');
    expect(result.dispatch.reasons).toEqual(['intent-uncertainty-too-high']);
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
  });

  it('fails closed before the default targeted writer can run unrevisioned edits', async () => {
    const { executeTargetedIntent: _unsafeTargetedWriter, ...defaultDeps } = dependencies();
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Make the revenue proof pop',
        scope: { kind: 'moment', startFrame: 100, endFrame: 200, overlayIds: ['video-1'] },
        targetReference: 'revenue proof',
        constraints: [],
        strength: 0.7,
        uncertainty: 0,
      },
    }, defaultDeps);

    expect(result).toMatchObject({
      status: 'error',
      dispatch: {
        owner: 'targeted-unified-planner',
        status: 'failed',
        mutated: false,
        reasons: ['targeted-live-writer-not-revision-bound'],
      },
    });
    expect(defaultDeps.persistAudit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      dispatch: expect.objectContaining({ mutated: false }),
    }));
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

describe('Director Mode confirm-gate (assist lane)', () => {
  const assistProject = () => ({ ...project(), editMode: 'assist' });

  it('gates a project-wide intent on an assist project until the user confirms', async () => {
    const deps = dependencies({ loadProject: vi.fn(async () => assistProject()) });
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

    expect(result.status).toBe('advisory');
    expect(result.dispatch.reasons).toEqual(['assist-auto-director-needs-confirmation']);
    expect(result.dispatch.mutated).toBe(false);
    expect(deps.executeProjectIntent).not.toHaveBeenCalled();
    expect(deps.dispatchScriptIntent).not.toHaveBeenCalled();
    expect(deps.executeTargetedIntent).not.toHaveBeenCalled();
  });

  it('does not let model-supplied scriptText override explicit family authority', async () => {
    const deps = dependencies();
    const tools = createChatEditorialIntentTools({
      userId: 'user-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      operationId: 'operation-1',
      requiredFamilyDirectives: [{ family: 'motionGraphics', mode: 'prefer' }],
      familyScopeExclusive: true,
    }, deps);
    const applyTool = tools.find((candidate) => (candidate as { name: string }).name === 'apply_editorial_intent') as {
      invoke: (input: unknown, config: unknown) => Promise<string>;
    };
    const userTurnText = 'Create one grounded process motion graphic from the real project stages.';
    const output = JSON.parse(await applyTool.invoke({
      goal: userTurnText,
      motionGraphicsMode: 'prefer',
      scriptText: userTurnText,
    }, {
      configurable: { chatUserTurnText: userTurnText },
    }));

    expect(output.status).toBe('success');
    expect(output.data.intent).not.toHaveProperty('script');
    expect(output.data.dispatch.owner).toBe('director-unified-planner');
    expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
    expect(deps.dispatchScriptIntent).not.toHaveBeenCalled();
  });

  it('keeps explicit family scope authoritative for internal callers carrying script context', async () => {
    const deps = dependencies();
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Create a grounded process motion graphic',
        scope: { kind: 'project' },
        constraints: [],
        strength: 0.5,
        uncertainty: 0,
        script: 'First show design, then construction, then the finished result.',
      },
      executionScope: {
        version: 'editorial-execution-scope-v1',
        source: 'chat-editorial-intent',
        mode: 'explicit-families-only',
        families: ['motionGraphics'],
      },
    }, deps);

    expect(result.intent.script).toContain('First show design');
    expect(result.dispatch.owner).toBe('director-unified-planner');
    expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
    expect(deps.dispatchScriptIntent).not.toHaveBeenCalled();
  });

  it('does not treat an explicit family-only MG composition as a full Auto-Director handoff', async () => {
    const deps = dependencies({ loadProject: vi.fn(async () => assistProject()) });
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Create a process diagram for this explanation',
        scope: { kind: 'project' },
        constraints: [],
        strength: 0.5,
        uncertainty: 0,
        families: { motionGraphics: { mode: 'prefer' } },
      },
      executionScope: {
        version: 'editorial-execution-scope-v1',
        source: 'chat-editorial-intent',
        mode: 'explicit-families-only',
        families: ['motionGraphics'],
      },
    }, deps);

    expect(result.status).toBe('success');
    expect(result.dispatch.reasons).not.toContain('assist-auto-director-needs-confirmation');
    expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
  });

  it('gates a script-led intent the same way', async () => {
    const deps = dependencies({ loadProject: vi.fn(async () => assistProject()) });
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Reorder every uploaded clip to follow this script',
        scope: { kind: 'project' },
        constraints: [],
        strength: 0.5,
        uncertainty: 0,
        script: 'First show the problem. Then the proof.',
      },
    }, deps);

    expect(result.status).toBe('advisory');
    expect(result.dispatch.reasons).toEqual(['assist-auto-director-needs-confirmation']);
    expect(deps.dispatchScriptIntent).not.toHaveBeenCalled();
  });

  it('executes after explicit confirmation', async () => {
    const deps = dependencies({ loadProject: vi.fn(async () => assistProject()) });
    const result = await applyGroundedEditorialIntent({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'Make the edit feel more engaging but still restrained',
        scope: { kind: 'project' },
        constraints: [],
        strength: 0.55,
        uncertainty: 0.12,
        autoDirectorConfirmed: true,
      },
    }, deps);

    expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
    expect(result.status).toBe('success');
  });

  it('never gates targeted moment-scoped edits — normal chat ownership stays instant', async () => {
    const deps = dependencies({ loadProject: vi.fn(async () => assistProject()) });
    await applyGroundedEditorialIntent({
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

    expect(deps.executeTargetedIntent).toHaveBeenCalledOnce();
    expect(deps.executeProjectIntent).not.toHaveBeenCalled();
  });

  it('auto projects are untouched by the gate', async () => {
    const deps = dependencies();
    await applyGroundedEditorialIntent({
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

    expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
  });

  it('wire schema carries the confirmation flag through compilation', () => {
    const wire = chatEditorialIntentWireSchema.parse({ goal: 'redo it all', scopeKind: 'project' });
    expect(wire.autoDirectorConfirmed).toBe(false);
    const compiled = compileChatEditorialIntentWire({ ...wire, autoDirectorConfirmed: true });
    expect(compiled.autoDirectorConfirmed).toBe(true);
  });

  it('STRUCTURED CONFIRM: the tool ORs config.autoDirectorConfirmed into the wire flag (button-driven, no NLP)', async () => {
    const deps = dependencies({ loadProject: vi.fn(async () => assistProject()) });
    const tools = createChatEditorialIntentTools({ userId: 'user-1', projectId: 'project-1' }, deps);
    const applyTool = tools.find((t) => (t as { name: string }).name === 'apply_editorial_intent') as {
      invoke: (input: unknown, config: unknown) => Promise<string>;
    };

    // First call WITHOUT the config flag → gate fires (advisory).
    const gated = JSON.parse(await applyTool.invoke(
      { goal: 'just edit the whole thing for me', scopeKind: 'project' },
      { configurable: {} },
    ));
    expect(gated.data.dispatch.reasons).toContain('assist-auto-director-needs-confirmation');
    expect(deps.executeProjectIntent).not.toHaveBeenCalled();

    // Re-run WITH the structured config flag (set by the confirm button) → executes.
    const confirmed = JSON.parse(await applyTool.invoke(
      { goal: 'just edit the whole thing for me', scopeKind: 'project' },
      { configurable: { autoDirectorConfirmed: true } },
    ));
    expect(confirmed.status).toBe('success');
    expect(deps.executeProjectIntent).toHaveBeenCalledOnce();
  });
});
