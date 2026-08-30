import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIsolatedPromptParts } from '@/lib/thinkforge/agents/prompt-boundary';
import { ScriptWriterV3ModelOutputSchema } from '@/lib/thinkforge/agents/script-writer-agent';
import { createUnspecifiedAudiovisualIntent } from '@/lib/thinkforge/schemas/audiovisual-intent';
import { VideoTreatmentModelOutputSchema } from '@/lib/thinkforge/schemas/video-treatment';
import { resolveThinkForgeE2EStructuredFixture } from '@/lib/thinkforge/testing/structured-writer-fixtures';

function semanticScriptPrompt(visualEventIds: readonly string[]): string {
  return buildIsolatedPromptParts({
    systemInstruction: 'Use the approved semantic treatment events.',
    data: {
      brandContext: 'Recurring phrases/structures to favor: State the evidence before the recommendation\nNEVER use these words/phrases: playful, whimsical, maybe',
      authoringDestination: { outputKind: 'video_script' },
      videoTreatment: { visualEvents: visualEventIds.map((id) => ({ id })) },
    },
  }).prompt;
}

function semanticTreatmentPrompt(sourceRefs: readonly string[] = ['brief_user']): string {
  return buildIsolatedPromptParts({
    systemInstruction: 'Create one whole-video semantic treatment.',
    data: {
      task: 'Create one whole-video semantic treatment before script prose is written.',
      audiovisualIntent: createUnspecifiedAudiovisualIntent(),
      allowedTraceEvidence: {
        sourceRefs,
        creativeReferenceIds: [],
        creativeReferenceEvidenceIds: [],
        graphConstraintIds: [],
      },
    },
  }).prompt;
}

describe('ThinkForge browser structured-writer fixtures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('emits a V3 script fixture that selects each approved treatment event exactly once', () => {
    vi.stubEnv('THINKFORGE_E2E_WRITER_FIXTURE', 'auto');
    vi.stubEnv('THINKFORGE_E2E_MODE', '1');
    vi.stubEnv('THINKFORGE_E2E_RUN_ID', 'fixturev3');

    const result = resolveThinkForgeE2EStructuredFixture({
      schema: ScriptWriterV3ModelOutputSchema,
      prompt: semanticScriptPrompt(['event_open', 'event_counterpoint', 'event_close']),
      systemInstruction: 'trusted script writer instruction',
    });

    expect(result?.result.sidecar.sidecarVersion).toBe(3);
    const selectedEventIds = result?.result.sidecar.acts.flatMap((act) => (
      act.narrativeScenes.flatMap((scene) => (
        scene.beats.flatMap((beat) => beat.treatmentVisualEvents.map((event) => event.treatmentEventId))
      ))
    ));
    expect(selectedEventIds).toEqual(['event_open', 'event_counterpoint', 'event_close']);
    expect(JSON.stringify(result?.result.sidecar)).not.toMatch(/shotIntent|visualIntent|renderPlan/i);
  });

  it('supplies a semantic no-capture treatment before the V3 script fixture consumes it', () => {
    vi.stubEnv('THINKFORGE_E2E_WRITER_FIXTURE', 'auto');
    vi.stubEnv('THINKFORGE_E2E_MODE', '1');
    vi.stubEnv('THINKFORGE_E2E_RUN_ID', 'fixturev3');

    const treatment = resolveThinkForgeE2EStructuredFixture({
      schema: VideoTreatmentModelOutputSchema,
      prompt: semanticTreatmentPrompt(),
      systemInstruction: '<video_treatment_planner_contract version="1">',
    });
    const eventIds = treatment?.result.visualEvents.map((event) => event.id) ?? [];
    const writer = resolveThinkForgeE2EStructuredFixture({
      schema: ScriptWriterV3ModelOutputSchema,
      prompt: semanticScriptPrompt(eventIds),
      systemInstruction: 'trusted script writer instruction',
    });
    const selectedEventIds = writer?.result.sidecar.acts.flatMap((act) => (
      act.narrativeScenes.flatMap((scene) => (
        scene.beats.flatMap((beat) => beat.treatmentVisualEvents.map((event) => event.treatmentEventId))
      ))
    ));

    expect(treatment?.result.captureRequirements).toEqual([]);
    expect(treatment?.result.resolvedAudiovisualDecision).toMatchObject({
      audibleSpeech: { presence: 'sparse', sources: ['voice-over'] },
      onCameraSpeech: { presence: 'absent' },
      visiblePeople: { presence: 'absent' },
      physicalCapture: { need: 'absent' },
      materials: { graphics: 'required' },
    });
    expect(treatment?.result.visualEvents.every((event) => event.visiblePerson === 'forbidden')).toBe(true);
    expect(eventIds).toHaveLength(6);
    expect(selectedEventIds).toEqual(eventIds);
  });

  it('fails explicitly when a semantic script fixture has no approved treatment events', () => {
    vi.stubEnv('THINKFORGE_E2E_WRITER_FIXTURE', 'auto');
    vi.stubEnv('THINKFORGE_E2E_MODE', '1');
    vi.stubEnv('THINKFORGE_E2E_RUN_ID', 'fixturev3');

    expect(() => resolveThinkForgeE2EStructuredFixture({
      schema: ScriptWriterV3ModelOutputSchema,
      prompt: semanticScriptPrompt([]),
      systemInstruction: 'trusted script writer instruction',
    })).toThrow('requires one or more approved video treatment visual events');
  });

  it('fails explicitly when the treatment fixture has no authorised evidence', () => {
    vi.stubEnv('THINKFORGE_E2E_WRITER_FIXTURE', 'auto');
    vi.stubEnv('THINKFORGE_E2E_MODE', '1');
    vi.stubEnv('THINKFORGE_E2E_RUN_ID', 'fixturev3');

    expect(() => resolveThinkForgeE2EStructuredFixture({
      schema: VideoTreatmentModelOutputSchema,
      prompt: semanticTreatmentPrompt([]),
      systemInstruction: '<video_treatment_planner_contract version="1">',
    })).toThrow('requires authorised source evidence');
  });
});
