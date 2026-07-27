import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCanonicalChatEvidenceDocuments,
  rankCanonicalChatEvidence,
  searchCanonicalChatEvidence,
  validateEmbedding,
  type CanonicalChatEvidenceCandidate,
  type CanonicalChatEvidenceDocument,
  type ChatEvidenceDependencies,
  type ChatEvidenceRetrievalAudit,
  type EvidenceEmbedding,
} from '@/lib/editron/services/chat-multimodal-evidence';
import {
  EDITRON_EMBEDDING_DIMENSIONS,
  EDITRON_EMBEDDING_MODEL,
} from '@/lib/editron/services/gemini-embedding';

function vector(axis: number, dimensions = EDITRON_EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length: dimensions }, (_, index) => index === axis ? 1 : 0);
}

function textEmbedding(axis: number): EvidenceEmbedding {
  return {
    model: EDITRON_EMBEDDING_MODEL,
    dimensions: EDITRON_EMBEDDING_DIMENSIONS,
    values: vector(axis),
  };
}

function fixture() {
  const project = {
    projectId: 'project-multi',
    fps: 30,
    durationInFrames: 990,
    overlays: [
      {
        id: 'craft-clip',
        type: 'video',
        assetId: 'asset-craft',
        from: 100,
        durationInFrames: 300,
        sourceStartFrame: 60,
      },
      {
        id: 'stage-clip',
        type: 'video',
        assetId: 'asset-stage',
        from: 500,
        durationInFrames: 300,
        sourceStartFrame: 0,
      },
      {
        id: 'reference-image',
        type: 'image',
        assetId: 'asset-image',
        from: 900,
        durationInFrames: 90,
      },
    ],
  };
  const analyses = [
    {
      projectId: 'project-multi',
      assetId: 'asset-craft',
      segmentAnalysis: {
        segments: [{
          startMs: 2_000,
          endMs: 4_000,
          transcript: { text: 'Yeh zardozi haath se banayi gayi hai' },
          semanticVisual: {
            windows: [{
              subjects: ['gold embroidery hoop'],
              actions: ['artisan stitching beads by hand'],
              visibleStateChanges: ['plain fabric gains a gold pattern'],
            }],
            ocrText: ['ZARDOZI'],
            primaryVisualMode: 'demonstration',
          },
          visual: {
            mainSubject: { x: 0.12, y: 0.18, width: 0.55, height: 0.62 },
            textBoxes: [{ text: 'ZARDOZI' }],
            textBoxCount: 1,
            objectCount: 3,
            faceCount: 0,
            motionIntensity: 0,
            motionVectorX: -0.42,
            motionVectorY: 0.08,
          },
          vocal: { energy: 0.64, emotionIntensity: 0.58, emotionalValence: 'warm' },
          weight: { finalWeight: 0.83 },
        }],
      },
      musicAnalysis: { beats: [2.2, 3.1] },
    },
    {
      projectId: 'project-multi',
      assetId: 'asset-stage',
      segmentAnalysis: {
        segments: [{
          startMs: 1_000,
          endMs: 3_000,
          transcript: { text: 'We hand over the launch presentation to the team' },
          semanticVisual: {
            windows: [{
              subjects: ['presenter at a screen'],
              actions: ['presenting a launch slide'],
              visibleStateChanges: ['slide advances'],
            }],
            primaryVisualMode: 'presentation',
          },
          visual: { motionIntensity: 0.15, faceCount: 1 },
          weight: { finalWeight: 0.52 },
        }],
      },
    },
    {
      projectId: 'project-multi',
      assetId: 'asset-image',
      semanticVisual: {
        windows: [{
          subjects: ['finished embroidered garment'],
          actions: ['garment displayed on mannequin'],
          visibleStateChanges: [],
        }],
        ocrText: ['HANDCRAFTED'],
        primaryVisualMode: 'product-reference',
      },
    },
  ];
  return { project, analyses };
}

function attachTextEmbedding(document: CanonicalChatEvidenceDocument, axis: number): CanonicalChatEvidenceDocument {
  return {
    ...document,
    textEmbedding: textEmbedding(axis),
    modalities: { ...document.modalities, textEmbedding: true },
    missingModalities: document.missingModalities.filter((value) => value !== 'text-embedding'),
  };
}

function canonicalCandidate(overrides: Partial<CanonicalChatEvidenceCandidate> = {}): CanonicalChatEvidenceCandidate {
  return {
    evidenceId: 'evidence-craft',
    assetId: 'asset-craft',
    overlayId: 'craft-clip',
    overlayType: 'video',
    sourceStartMs: 2_000,
    sourceEndMs: 4_000,
    startFrame: 100,
    endFrame: 160,
    text: 'artisan stitching gold embroidery by hand',
    transcriptText: 'Yeh zardozi haath se banayi gayi hai',
    visualText: 'artisan stitching gold embroidery by hand',
    boundingBox: { x: 0.12, y: 0.18, width: 0.55, height: 0.62, units: 'normalized' },
    score: 0.89,
    accepted: true,
    safeForAutomaticMutation: true,
    matchType: 'semantic-corroborated',
    scores: {
      exactPhrase: 0,
      lexical: 0.25,
      textSemantic: 0.91,
      imageSemantic: 0.88,
      importance: 0.83,
      combined: 0.89,
    },
    modalityPresence: {
      transcript: true,
      visualFacts: true,
      ocr: true,
      spatial: true,
      motion: true,
      vocal: true,
      music: true,
      sourceToCutMapping: true,
      textEmbedding: true,
      imageEmbedding: true,
    },
    missingModalities: [],
    rejectionReasons: [],
    sourcePaths: ['editron_asset_analyses.asset-craft.segmentAnalysis.segments.0', 'project.overlays.craft-clip'],
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.doUnmock('@/lib/editron/services/chat-multimodal-evidence');
  vi.doUnmock('@/lib/editron/services/project-service');
  vi.doUnmock('@/lib/editron/services/media');
});

describe('canonical chat multimodal evidence', () => {
  it('preserves multimodal facts and maps each asset segment onto the edited timeline', () => {
    const { project, analyses } = fixture();
    const documents = buildCanonicalChatEvidenceDocuments({
      projectId: project.projectId,
      project,
      analyses,
    });

    expect(documents).toHaveLength(3);
    const craft = documents.find((document) => document.assetId === 'asset-craft');
    expect(craft).toMatchObject({
      overlayId: 'craft-clip',
      sourceStartMs: 2_000,
      sourceEndMs: 4_000,
      editedStartFrame: 100,
      editedEndFrame: 160,
      transcriptText: 'Yeh zardozi haath se banayi gayi hai',
      importance: 0.83,
      modalities: {
        transcript: true,
        visualFacts: true,
        ocr: true,
        spatial: true,
        motion: true,
        vocal: true,
        music: true,
        sourceToCutMapping: true,
        textEmbedding: false,
        imageEmbedding: false,
      },
    });
    expect(craft?.visualText).toContain('artisan stitching beads by hand');
    expect(craft?.missingModalities).toContain('image-embedding');
    expect(documents.find((document) => document.assetId === 'asset-image')).toMatchObject({
      overlayId: 'reference-image',
      editedStartFrame: 900,
      editedEndFrame: 990,
      modalities: { visualFacts: true, sourceToCutMapping: true },
    });
  });

  it('validates embedding model, dimensions, length, finiteness, and non-zero content', () => {
    expect(validateEmbedding(textEmbedding(0), {
      model: EDITRON_EMBEDDING_MODEL,
      dimensions: EDITRON_EMBEDDING_DIMENSIONS,
    })).toEqual({ valid: true });
    expect(validateEmbedding({ ...textEmbedding(0), model: 'wrong-model' }, {
      model: EDITRON_EMBEDDING_MODEL,
    })).toEqual({ valid: false, reason: 'model-mismatch' });
    expect(validateEmbedding({ ...textEmbedding(0), dimensions: 12 })).toEqual({ valid: false, reason: 'vector-length-mismatch' });
    expect(validateEmbedding({ ...textEmbedding(0), values: Array(EDITRON_EMBEDDING_DIMENSIONS).fill(0) })).toEqual({ valid: false, reason: 'zero-vector' });
    expect(validateEmbedding({ ...textEmbedding(0), values: [Number.NaN, ...vector(0).slice(1)] })).toEqual({ valid: false, reason: 'non-finite-vector' });
  });

  it('ranks vague visual meaning above an unrelated lexical hand match without granting mutation authority', () => {
    const { project, analyses } = fixture();
    const documents = buildCanonicalChatEvidenceDocuments({ projectId: project.projectId, project, analyses });
    const embedded = documents.map((document) => attachTextEmbedding(
      document,
      document.assetId === 'asset-craft' ? 0 : document.assetId === 'asset-stage' ? 1 : 2,
    ));
    const ranked = rankCanonicalChatEvidence({
      documents: embedded,
      query: 'artisan handwork transforming fabric',
      intent: 'visual',
      queryTextEmbedding: textEmbedding(0),
      limit: 3,
    });

    expect(ranked[0]).toMatchObject({
      assetId: 'asset-craft',
      accepted: true,
      matchType: 'semantic-text',
      safeForAutomaticMutation: false,
    });
    expect(ranked[0].scores.textSemantic).toBe(1);
    expect(ranked.findIndex((candidate) => candidate.assetId === 'asset-stage')).toBeGreaterThan(0);
  });

  it('treats true image vectors as a separate contract and licenses only unambiguous corroboration', () => {
    const { project, analyses } = fixture();
    const craft = attachTextEmbedding(
      buildCanonicalChatEvidenceDocuments({ projectId: project.projectId, project, analyses })
        .find((document) => document.assetId === 'asset-craft')!,
      0,
    );
    const imageEmbedding: EvidenceEmbedding = { model: 'clip-v1', dimensions: 3, values: [1, 0, 0] };
    const ranked = rankCanonicalChatEvidence({
      documents: [{
        ...craft,
        imageEmbedding,
        modalities: { ...craft.modalities, imageEmbedding: true },
      }],
      query: 'craft transformation',
      intent: 'visual',
      queryTextEmbedding: textEmbedding(0),
      queryImageEmbedding: imageEmbedding,
    });

    expect(ranked[0]).toMatchObject({
      matchType: 'semantic-corroborated',
      accepted: true,
      safeForAutomaticMutation: true,
    });
    expect(ranked[0].scores).toMatchObject({ textSemantic: 1, imageSemantic: 1 });
  });

  it('collapses touching slices of the same visual fact into one mutation opportunity', () => {
    const { project, analyses } = fixture();
    const craft = buildCanonicalChatEvidenceDocuments({
      projectId: project.projectId,
      project,
      analyses,
    }).find((document) => document.assetId === 'asset-craft')!;
    const adjacent = {
      ...craft,
      evidenceId: 'evidence-craft-adjacent',
      overlayId: 'craft-clip-adjacent',
      sourceStartMs: craft.sourceEndMs,
      sourceEndMs: craft.sourceEndMs + 2_000,
      editedStartFrame: craft.editedEndFrame,
      editedEndFrame: (craft.editedEndFrame ?? 0) + 60,
      sourcePaths: ['project.overlays.craft-clip-adjacent'],
    };

    const ranked = rankCanonicalChatEvidence({
      documents: [craft, adjacent],
      query: 'artisan stitching beads by hand',
      intent: 'visual',
      limit: 5,
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({
      assetId: 'asset-craft',
      matchType: 'exact-phrase',
      accepted: true,
      safeForAutomaticMutation: true,
    });
    expect(ranked[0].rejectionReasons).not.toContain('ambiguous-top-candidates');
    expect(ranked[0].sourcePaths).toEqual(expect.arrayContaining([
      ...craft.sourcePaths,
      'project.overlays.craft-clip-adjacent',
    ]));
  });

  it('persists bounded retrieval evidence, missing modalities, and rejection reasons without hidden Mongo initialization', async () => {
    const { project, analyses } = fixture();
    const savedCaches: CanonicalChatEvidenceDocument[][] = [];
    const audits: ChatEvidenceRetrievalAudit[] = [];
    const dependencies: ChatEvidenceDependencies = {
      loadAnalyses: vi.fn(async (_projectId, assetIds) => analyses.filter((analysis) => assetIds.includes(analysis.assetId))),
      loadEmbeddingCache: vi.fn(async () => []),
      saveEmbeddingCache: vi.fn(async (_projectId, _userId, entries) => { savedCaches.push(entries); }),
      saveAudit: vi.fn(async (audit) => { audits.push(audit); }),
      embedText: vi.fn(async (text, taskType) => {
        if (taskType === 'RETRIEVAL_QUERY') return vector(0);
        if (text.includes('zardozi') || text.includes('gold embroidery')) return vector(0);
        if (text.includes('launch presentation')) return vector(1);
        return vector(2);
      }),
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    };

    const result = await searchCanonicalChatEvidence({
      projectId: project.projectId,
      userId: 'user-1',
      project,
      query: 'artisan handwork',
      intent: 'visual',
      limit: 3,
    }, dependencies);

    expect(dependencies.loadAnalyses).toHaveBeenCalledWith(
      project.projectId,
      ['asset-craft', 'asset-stage', 'asset-image'],
      'user-1',
    );
    expect(savedCaches.flat()).toHaveLength(3);
    expect(result.candidates[0]).toMatchObject({ assetId: 'asset-craft', accepted: true });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      projectId: project.projectId,
      userId: 'user-1',
      analyzedDocumentCount: 3,
      embeddedDocumentCount: 3,
    });
    expect(audits[0].missingModalities['image-embedding']).toBe(3);
    expect(audits[0].candidates[0]).toHaveProperty('scores');
    expect(audits[0].candidates[0]).toHaveProperty('modalityPresence');
    expect(audits[0].candidates[0].sourcePaths).toContain('project.overlays.craft-clip');
    expect(audits[0].candidates.some((candidate) => candidate.rejectionReasons.length > 0)).toBe(true);
  });

  it('wires canonical candidates into transcript and visual chat tools while keeping semantic cuts fail-closed', async () => {
    const search = vi.fn(async () => ({
      auditId: 'audit-live',
      candidates: [canonicalCandidate()],
      analyzedDocumentCount: 1,
      embeddedDocumentCount: 1,
      rankingPolicy: {},
    }));
    const project = fixture().project;
    vi.doMock('@/lib/editron/services/chat-multimodal-evidence', () => ({ searchCanonicalChatEvidence: search }));
    vi.doMock('@/lib/editron/services/project-service', () => ({
      projectService: { loadProject: vi.fn(async () => project) },
    }));
    vi.doMock('@/lib/editron/services/media', () => ({
      getTranscription: vi.fn(async () => ({ transcript: '', words: [] })),
    }));

    const [{ createChatTranscriptTools }, { createChatVisualTools, resolveVisualEditPlacement }] = await Promise.all([
      import('@/lib/editron/agent/chat-transcript-tools'),
      import('@/lib/editron/agent/chat-visual-tools'),
    ]);
    const transcriptTool = createChatTranscriptTools({ userId: 'user-1', projectId: project.projectId })
      .find((tool) => tool.name === 'find_transcript_moment')!;
    const transcriptOutput = JSON.parse(await transcriptTool.invoke({
      query: 'the craftsmanship section',
      includeCaptions: false,
      forceRefresh: false,
      limit: 5,
      minConfidence: 0.42,
    }));
    expect(transcriptOutput.data.candidates[0]).toMatchObject({
      matchType: 'multimodal-semantic',
      safeForAutoEdit: false,
      source: { auditId: 'audit-live', evidenceId: 'evidence-craft' },
    });

    const frameVerifier = vi.fn(async () => ({
      status: 'confirmed' as const,
      receiptId: 'frame-visual-test',
      frame: 130,
      query: 'the hand-crafted garment section',
      provider: 'gemini' as const,
      model: 'test-vision-model',
      matchQuality: 'clear-semantic' as const,
      evidence: 'Hands are working on the garment.',
      reasoning: 'The requested garment craft moment is directly visible.',
      boundingBox: {
        x: 0.2,
        y: 0.25,
        width: 0.5,
        height: 0.45,
        units: 'normalized' as const,
      },
    }));
    const visualTools = createChatVisualTools({
      userId: 'user-1',
      projectId: project.projectId,
      frameVerifier,
    });
    const findVisual = visualTools.find((tool) => tool.name === 'find_visual_moment')!;
    const resolveVisual = visualTools.find((tool) => tool.name === 'resolve_visual_edit')!;
    expect(findVisual.description).toContain('For any mutation, call resolve_visual_edit directly');
    expect(resolveVisual.description).toContain('do not call find_visual_moment first');
    const highlightOutput = JSON.parse(await resolveVisual.invoke({
      query: 'the hand-crafted garment section',
      action: 'highlight',
      includeOverlayText: false,
      limit: 5,
      minConfidence: 0.35,
      durationFrames: 60,
    }));
    expect(highlightOutput.status).toBe('success');
    expect(highlightOutput.error).toBeNull();
    expect(highlightOutput.nextAction).toBe('continue');
    expect(highlightOutput.data.useWith.add_overlay).toMatchObject({ start: 130, type: 'shape' });

    const inspection = resolveVisualEditPlacement(project, 'the hand-crafted garment section', {
      action: 'inspect',
      precomputedCandidates: [{
        ...highlightOutput.data.candidates[0],
        safeForAutoEdit: false,
      }],
    });
    expect(inspection).toMatchObject({ status: 'ready', action: 'inspect' });

    const cutOutput = JSON.parse(await resolveVisual.invoke({
      query: 'the hand-crafted garment section',
      action: 'cut_range',
      includeOverlayText: false,
      limit: 5,
      minConfidence: 0.35,
      durationFrames: 60,
    }));
    expect(cutOutput.status).toBe('error');
    expect(cutOutput.data.status).toBe('ambiguous');
    expect(cutOutput.error).toMatchObject({
      code: 'VISUAL_RESOLUTION_REQUIRED',
      details: { resolverStatus: 'ambiguous' },
    });
    expect(cutOutput.nextAction).toBe('ask_clarification');
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ intent: 'visual' }));

    search.mockResolvedValueOnce({
      auditId: 'audit-frame-inspection',
      candidates: [canonicalCandidate({
        accepted: false,
        safeForAutomaticMutation: false,
        rejectionReasons: ['below-evidence-threshold'],
      })],
      analyzedDocumentCount: 1,
      embeddedDocumentCount: 1,
      rankingPolicy: {},
    });
    const frameVerifiedOutput = JSON.parse(await resolveVisual.invoke({
      query: 'the hand-crafted garment section',
      action: 'highlight',
      includeOverlayText: false,
      limit: 5,
      minConfidence: 0.35,
      durationFrames: 60,
    }, {
      configurable: {
        chatFrameEvidence: {
          frame: 130,
          question: 'Verify canonical visual match for: the hand-crafted garment section',
          dataUrl: 'data:image/jpeg;base64,/9j/2Q==',
          width: 960,
          height: 540,
          capturedAtMs: 1_000_000,
          source: 'editor-rendered-frame',
        },
      },
    }));
    expect(frameVerifiedOutput.status).toBe('success');
    expect(frameVerifiedOutput.data.frameVerification).toMatchObject({
      status: 'confirmed',
      receiptId: 'frame-visual-test',
    });
    expect(frameVerifiedOutput.data.useWith.add_overlay).toMatchObject({
      start: 130,
      x: '45%',
      y: '47.5%',
      width: '50%',
      height: '45%',
    });
    expect(frameVerifier).toHaveBeenCalledOnce();
  });
});
