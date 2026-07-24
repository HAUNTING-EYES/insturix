import type {
  ChatBattleFixtureCapability,
  ChatBattleFixturePlan,
} from './chat-edit-battle-fixture-plan';

export interface PreparedChatBattleFixture {
  project: Record<string, unknown>;
  selectedOverlayId?: string | number;
  clientContext: Record<string, unknown>;
  transcriptAssetAlias?: ChatBattleTranscriptAssetAlias;
}

export interface ChatBattleTranscriptAssetAlias {
  sourceAssetId: string;
  fixtureAssetId: string;
  transcription: {
    words: Array<{
      word: string;
      startMs: number;
      endMs: number;
      confidence: number;
    }>;
    transcript: string;
    language: string;
    confidence: number;
    generatedAt: Date;
  };
}

export interface ChatBattleFixtureCapabilityReport {
  ok: boolean;
  required: ChatBattleFixtureCapability[];
  missing: ChatBattleFixtureCapability[];
  sourceAssetIds: string[];
  videoAssetIds: string[];
  semanticVisualAssetIds: string[];
  spatialVisualAssetIds: string[];
}

export function inspectChatBattleFixtureCapabilities(input: {
  sourceProject: Record<string, unknown>;
  sourceAnalyses: readonly Record<string, unknown>[];
  required: readonly ChatBattleFixtureCapability[];
}): ChatBattleFixtureCapabilityReport {
  const required = [...new Set(input.required)];
  const sourceAssetIds = uniqueStrings(input.sourceProject.sourceAssetIds);
  const videoAssetIds = uniqueStrings(
    asRecords(input.sourceProject.overlays)
      .filter((overlay) => stringValue(overlay.type) === 'video')
      .map((overlay) => overlay.assetId),
  );
  const analysisByAssetId = new Map(
    input.sourceAnalyses.flatMap((analysis) => {
      const assetId = stringValue(analysis.assetId);
      return assetId ? [[assetId, analysis] as const] : [];
    }),
  );
  const semanticVisualAssetIds = videoAssetIds.filter((assetId) => (
    hasTimeLocalizedSemanticVisual(analysisByAssetId.get(assetId))
  ));
  const spatialVisualAssetIds = videoAssetIds.filter((assetId) => (
    hasTimeLocalizedSpatialVisual(analysisByAssetId.get(assetId))
  ));

  const missing = required.filter((capability) => {
    if (capability === 'multi-asset') {
      return new Set([...sourceAssetIds, ...videoAssetIds]).size < 2;
    }
    if (capability === 'semantic-visual') {
      return semanticVisualAssetIds.length === 0;
    }
    if (capability === 'semantic-visual-all-video-assets') {
      return videoAssetIds.length === 0 || semanticVisualAssetIds.length !== videoAssetIds.length;
    }
    return videoAssetIds.length === 0 || spatialVisualAssetIds.length !== videoAssetIds.length;
  });

  return {
    ok: missing.length === 0,
    required,
    missing,
    sourceAssetIds,
    videoAssetIds,
    semanticVisualAssetIds,
    spatialVisualAssetIds,
  };
}

export function prepareChatBattleFixture(input: {
  sourceProject: Record<string, unknown>;
  fixtureProjectId: string;
  plan: ChatBattleFixturePlan;
  now?: Date;
  expiresInMs?: number;
}): PreparedChatBattleFixture {
  const now = input.now ?? new Date();
  const project = structuredClone(input.sourceProject);
  delete project._id;

  const overlays = cloneOverlays(project.overlays);
  let transcriptAssetAlias: ChatBattleTranscriptAssetAlias | undefined;
  if (input.plan.removeCaptionTrack) {
    project.overlays = overlays.filter((overlay) => !isCaptionOverlay(overlay));
  } else if (input.plan.seedTranscript) {
    project.overlays = seedTranscriptOverlay(overlays, project, input.fixtureProjectId);
    transcriptAssetAlias = remapSeededTranscriptAsset(project, input.fixtureProjectId, now);
  } else {
    project.overlays = overlays;
  }

  const sourceProjectId = stringValue(input.sourceProject.projectId) ?? input.plan.sourceProjectId;
  const title = `Chat battle: ${input.plan.scenarioId}`;
  project.projectId = input.fixtureProjectId;
  project.name = title;
  project.title = title;
  project.status = 'ready';
  project.createdAt = now;
  project.updatedAt = now;
  project.expiresAt = new Date(now.getTime() + (input.expiresInMs ?? 24 * 60 * 60 * 1000));
  delete project.qualityReview;
  project.intelligence = stripStaleRenderEvidence(project.intelligence);
  project.metadata = {
    ...asRecord(project.metadata),
    battleTest: {
      harnessVersion: 'editron-chat-battle-v1',
      scenarioId: input.plan.scenarioId,
      profile: input.plan.profile,
      sourceProjectId,
      disposable: true,
      preparedAt: now.toISOString(),
    },
  };

  const selectedOverlay = findSelectedOverlay(project.overlays, input.plan.selectedOverlayType);
  if (input.plan.selectedOverlayType && !selectedOverlay) {
    throw new Error(
      `Fixture source ${sourceProjectId} has no ${input.plan.selectedOverlayType} overlay required by ${input.plan.scenarioId}.`,
    );
  }
  const durationInFrames = positiveInteger(project.durationInFrames) ?? maxOverlayEnd(project.overlays);
  const currentFrame = selectedOverlay
    ? Math.min(durationInFrames - 1, finiteFrame(selectedOverlay.from) + Math.floor(Math.max(1, finiteFrame(selectedOverlay.durationInFrames)) / 2))
    : Math.min(Math.max(0, durationInFrames - 1), 120);
  const selectedOverlayId = selectedOverlay?.id as string | number | undefined;

  return {
    project,
    selectedOverlayId,
    ...(transcriptAssetAlias ? { transcriptAssetAlias } : {}),
    clientContext: buildFixtureClientContext({
      durationInFrames,
      overlayCount: Array.isArray(project.overlays) ? project.overlays.length : 0,
      currentFrame,
      selectedOverlay,
      includeCursor: input.plan.scenarioId === 'spatial-cursor-reference',
      nowMs: now.getTime(),
    }),
  };
}

export function cloneChatBattleAnalysisDocuments(
  sourceDocuments: readonly Record<string, unknown>[],
  fixtureProjectId: string,
  now: Date = new Date(),
  transcriptAssetAlias?: ChatBattleTranscriptAssetAlias,
): Record<string, unknown>[] {
  return sourceDocuments.map((source) => {
    const clone = structuredClone(source);
    delete clone._id;
    clone.projectId = fixtureProjectId;
    clone.createdAt = now;
    clone.updatedAt = now;
    if (transcriptAssetAlias && clone.assetId === transcriptAssetAlias.sourceAssetId) {
      clone.assetId = transcriptAssetAlias.fixtureAssetId;
      const rawFootageAnalysis = asRecord(clone.rawFootageAnalysis);
      rawFootageAnalysis.transcription = structuredClone(transcriptAssetAlias.transcription);
      clone.rawFootageAnalysis = rawFootageAnalysis;
      clone.segmentAnalysis = synchronizeSegmentTranscripts(
        asRecord(clone.segmentAnalysis),
        transcriptAssetAlias.transcription.words,
      );
    }
    return clone;
  });
}

export function cloneChatBattleUploadBatch(
  sourceBatch: Record<string, unknown>,
  fixtureProjectId: string,
  fixtureUploadBatchId: string,
  now: Date = new Date(),
): Record<string, unknown> {
  const clone = structuredClone(sourceBatch);
  delete clone._id;
  for (const key of [
    'lastChatScriptIntentId',
    'chatScriptRecompositionQueuedAt',
    'orchestrationLeaseUntil',
    'orchestrationRecoveryLeaseUntil',
    'orchestrationRecoveryClaimedAt',
    'orchestrationMessageId',
    'orchestrationError',
    'orchestrationRecoveryError',
    'directorFailure',
    'directorMessageId',
    'deliverables',
    'projectIds',
  ]) {
    delete clone[key];
  }
  clone.uploadBatchId = fixtureUploadBatchId;
  clone.projectId = fixtureProjectId;
  clone.orchestrationStatus = 'ready';
  clone.createdAt = now;
  clone.updatedAt = now;
  clone.metadata = {
    ...asRecord(clone.metadata),
    battleFixture: true,
  };
  return clone;
}

function seedTranscriptOverlay(
  overlays: Record<string, unknown>[],
  project: Record<string, unknown>,
  fixtureProjectId: string,
): Record<string, unknown>[] {
  const fps = positiveInteger(project.fps) ?? 30;
  const durationInFrames = Math.max(600, positiveInteger(project.durationInFrames) ?? maxOverlayEnd(overlays));
  project.durationInFrames = durationInFrames;
  const words = transcriptFixtureTokens().map((token, index) => {
    const startFrame = 15 + (index * 6);
    const endFrame = startFrame + 5;
    return {
      word: token,
      startMs: Math.round((startFrame / fps) * 1000),
      endMs: Math.round((endFrame / fps) * 1000),
      confidence: 0.99,
    };
  });
  const existingIndex = overlays.findIndex(isCaptionOverlay);
  const existing = existingIndex >= 0 ? overlays[existingIndex] : {};
  const seeded = {
    ...existing,
    id: existing.id ?? `battle-caption-${fixtureProjectId}`,
    type: 'caption',
    from: 0,
    durationInFrames,
    row: finiteFrame(existing.row) || 4,
    words,
    captions: [],
    metadata: {
      ...asRecord(existing.metadata),
      battleFixtureTranscript: true,
    },
  };
  if (existingIndex >= 0) overlays[existingIndex] = seeded;
  else overlays.push(seeded);
  return overlays;
}

function remapSeededTranscriptAsset(
  project: Record<string, unknown>,
  fixtureProjectId: string,
  now: Date,
): ChatBattleTranscriptAssetAlias {
  const fps = positiveInteger(project.fps) ?? 30;
  const overlays = cloneOverlays(project.overlays);
  const caption = overlays.find((overlay) => (
    isCaptionOverlay(overlay)
    && asRecord(overlay.metadata).battleFixtureTranscript === true
  ));
  const words = asRecords(caption?.words).flatMap((word) => {
    const text = stringValue(word.word ?? word.text);
    const startMs = finiteNonNegativeNumber(word.startMs);
    const endMs = finiteNonNegativeNumber(word.endMs);
    const confidence = finiteNonNegativeNumber(word.confidence) ?? 0.99;
    return text && startMs != null && endMs != null && endMs > startMs
      ? [{ word: text, startMs, endMs, confidence }]
      : [];
  });
  if (words.length === 0) {
    throw new Error(`Fixture ${fixtureProjectId} seeded a caption track without timed words.`);
  }

  const lastSourceFrame = Math.ceil((words[words.length - 1].endMs / 1_000) * fps);
  const sourceOverlay = overlays.find((overlay) => {
    if (overlay.type !== 'video') return false;
    const sourceStart = finiteFrame(overlay.sourceStartFrame ?? overlay.videoStartTime);
    return finiteFrame(overlay.from) === 0
      && sourceStart === 0
      && finiteFrame(overlay.durationInFrames) >= lastSourceFrame
      && Boolean(stringValue(overlay.assetId));
  });
  const sourceAssetId = stringValue(sourceOverlay?.assetId);
  if (!sourceAssetId) {
    throw new Error(
      `Fixture ${fixtureProjectId} needs a source-zero video long enough for its ${lastSourceFrame}-frame transcript seed.`,
    );
  }

  const fixtureAssetId = `battle_${fixtureProjectId.replace(/[^a-z0-9_-]/gi, '_').slice(0, 72)}`;
  project.overlays = overlays.map((overlay) => (
    overlay.assetId === sourceAssetId
      ? { ...overlay, assetId: fixtureAssetId }
      : overlay
  ));
  return {
    sourceAssetId,
    fixtureAssetId,
    transcription: {
      words,
      transcript: words.map((word) => word.word).join(' '),
      language: 'multilingual-fixture',
      confidence: 0.99,
      generatedAt: now,
    },
  };
}

function synchronizeSegmentTranscripts(
  segmentAnalysis: Record<string, unknown>,
  words: ChatBattleTranscriptAssetAlias['transcription']['words'],
): Record<string, unknown> {
  const segments = asRecords(segmentAnalysis.segments);
  if (segments.length === 0) return segmentAnalysis;
  return {
    ...segmentAnalysis,
    segments: segments.map((segment) => {
      const startMs = finiteNonNegativeNumber(segment.startMs) ?? 0;
      const endMs = finiteNonNegativeNumber(segment.endMs) ?? startMs;
      const matching = words.filter((word) => word.endMs > startMs && word.startMs < endMs);
      const next = { ...segment };
      if (matching.length === 0) {
        delete next.transcript;
      } else {
        next.transcript = {
          text: matching.map((word) => word.word).join(' '),
          wordCount: matching.length,
          fillerCount: 0,
          silenceGapCount: 0,
          avgWordGapMs: averageWordGapMs(matching),
        };
      }
      return next;
    }),
  };
}

function averageWordGapMs(
  words: ChatBattleTranscriptAssetAlias['transcription']['words'],
): number {
  if (words.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < words.length; index += 1) {
    total += Math.max(0, words[index].startMs - words[index - 1].endMs);
  }
  return total / (words.length - 1);
}

function transcriptFixtureTokens(): string[] {
  return [
    'pricing', 'is', 'simple',
    'the', 'pricing', 'model', 'matters', 'because', 'value', 'is', 'clear',
    '\u0915\u0940\u092e\u0924', '\u0906\u0938\u093e\u0928', '\u0939\u0948',
    'pricing', 'simple', 'hai',
    'this', 'is', 'the', 'key', 'point',
    'now', 'watch', 'this',
  ];
}

function buildFixtureClientContext(input: {
  durationInFrames: number;
  overlayCount: number;
  currentFrame: number;
  selectedOverlay?: Record<string, unknown>;
  includeCursor: boolean;
  nowMs: number;
}): Record<string, unknown> {
  const visibleEnd = Math.min(input.durationInFrames, Math.max(180, input.currentFrame + 150));
  const selectedFrom = input.selectedOverlay ? finiteFrame(input.selectedOverlay.from) : undefined;
  const selectedEnd = input.selectedOverlay
    ? selectedFrom! + Math.max(1, finiteFrame(input.selectedOverlay.durationInFrames))
    : undefined;
  return {
    currentFrame: input.currentFrame,
    selectedOverlayId: input.selectedOverlay?.id ?? null,
    selectedRange: selectedFrom == null || selectedEnd == null
      ? null
      : { startFrame: selectedFrom, endFrame: Math.min(input.durationInFrames, selectedEnd), source: 'selected-overlay' },
    visibleTimeline: { startFrame: 0, endFrame: visibleEnd, source: 'timeline-viewport' },
    durationInFrames: input.durationInFrames,
    overlayCount: input.overlayCount,
    activePanel: 'ai-chat',
    canvas: { width: 1920, height: 1080 },
    ...(input.includeCursor ? {
      spatialCursor: {
        surface: 'preview',
        frame: input.currentFrame,
        normalizedX: 0.78,
        normalizedY: 0.22,
        canvasX: 1498,
        canvasY: 238,
        capturedAtMs: input.nowMs,
        source: 'last-editor-pointer',
      },
    } : {}),
  };
}

function stripStaleRenderEvidence(value: unknown): Record<string, unknown> {
  const intelligence = structuredClone(asRecord(value));
  delete intelligence.phase0RenderedStillEvidence;
  delete intelligence.phase0RenderedQualityGate;
  delete intelligence.phase0RenderedAestheticReport;
  return intelligence;
}

function cloneOverlays(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? structuredClone(value).map(asRecord) : [];
}

function hasTimeLocalizedSemanticVisual(analysis: Record<string, unknown> | undefined): boolean {
  return asRecords(asRecord(analysis?.segmentAnalysis).segments).some((segment) => {
    const semanticVisual = asRecord(segment.semanticVisual);
    return asRecords(semanticVisual.windows).some((window) => {
      const startSec = finiteNonNegativeNumber(window.startSec);
      const endSec = finiteNonNegativeNumber(window.endSec);
      return startSec != null && endSec != null && endSec > startSec;
    });
  });
}

function hasTimeLocalizedSpatialVisual(analysis: Record<string, unknown> | undefined): boolean {
  return asRecords(asRecord(analysis?.segmentAnalysis).segments).some((segment) => {
    const visual = asRecord(segment.visual);
    const presence = asRecord(visual.primitivePresence);
    return presence.mainSubject === true
      && finiteUnitNumber(visual.mainSubjectX) != null
      && finiteUnitNumber(visual.mainSubjectY) != null
      && finiteUnitNumber(visual.mainSubjectWidth) != null
      && finiteUnitNumber(visual.mainSubjectHeight) != null;
  });
}

function uniqueStrings(value: unknown): string[] {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map(stringValue)
      .filter((item): item is string => Boolean(item)),
  )];
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function findSelectedOverlay(value: unknown, requiredType?: string): Record<string, unknown> | undefined {
  if (!requiredType || !Array.isArray(value)) return undefined;
  const compatible = requiredType === 'html-scene'
    ? new Set(['html-scene', 'generated-scene'])
    : new Set([requiredType]);
  return value.map(asRecord).find((overlay) => compatible.has(stringValue(overlay.type) ?? ''));
}

function isCaptionOverlay(value: unknown): boolean {
  const type = stringValue(asRecord(value).type);
  return type === 'caption' || type === 'captions';
}

function maxOverlayEnd(value: unknown): number {
  if (!Array.isArray(value)) return 1;
  return Math.max(1, ...value.map((item) => {
    const overlay = asRecord(item);
    return finiteFrame(overlay.from) + Math.max(1, finiteFrame(overlay.durationInFrames));
  }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteFrame(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteUnitNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}
