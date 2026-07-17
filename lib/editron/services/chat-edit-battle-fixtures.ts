import type { ChatBattleFixturePlan } from './chat-edit-battle-fixture-plan';

export interface PreparedChatBattleFixture {
  project: Record<string, unknown>;
  selectedOverlayId?: string | number;
  clientContext: Record<string, unknown>;
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
  if (input.plan.removeCaptionTrack) {
    project.overlays = overlays.filter((overlay) => !isCaptionOverlay(overlay));
  } else if (input.plan.seedTranscript) {
    project.overlays = seedTranscriptOverlay(overlays, project, input.fixtureProjectId);
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
): Record<string, unknown>[] {
  return sourceDocuments.map((source) => {
    const clone = structuredClone(source);
    delete clone._id;
    clone.projectId = fixtureProjectId;
    clone.createdAt = now;
    clone.updatedAt = now;
    return clone;
  });
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
    const startFrame = 45 + (index * 14);
    const endFrame = startFrame + 10;
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
