import { describe, expect, it } from 'vitest';
import {
  ScriptSidecarV3TreatmentError,
  ScriptWriterSidecarV3ModelSchema,
  canonicalizeScriptWriterV3ModelSidecarIds,
  materializeScriptSidecarV3,
  parseScriptSidecarV3,
} from '@/lib/thinkforge/schemas/script-sidecar-v3';
import { mixedPresenterCutawayTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

function modelSidecar(eventIds = ['event_host_claim', 'event_process_cutaway']) {
  return {
    sidecarVersion: 3,
    spokenTextSource: 'beat-lines' as const,
    characters: [{ id: 'model_host', name: 'Host', role: 'host' as const }],
    acts: [{
      id: 'model_act',
      title: 'Opening',
      narrativePurpose: 'Establish the human stakes and reveal the process beneath them.',
      narrativeScenes: [{
        id: 'model_scene',
        title: 'The claim and its counterpoint',
        narrativePurpose: 'Keep the host present while the hidden process becomes legible.',
        durationIntentSeconds: 12,
        charactersPresent: ['model_host'],
        sourceRefs: ['src_brief'],
        beats: [{
          id: 'model_beat',
          kind: 'mixed' as const,
          narrativePurpose: 'Let the host frame the cost while the process appears concurrently.',
          durationIntentSeconds: 12,
          lines: [{
            id: 'model_line',
            text: 'The cost is visible long before the handoff that caused it.',
            speakerId: 'model_host',
            languageCode: 'en',
            onCamera: true,
            delivery: 'sync-dialogue' as const,
            sourceRefs: ['src_brief'],
          }],
          treatmentVisualEvents: eventIds.map((treatmentEventId) => ({ treatmentEventId })),
          sourceRefs: ['src_brief'],
        }],
      }],
    }],
    sourceRefs: ['src_brief'],
  };
}

describe('Script Sidecar V3 semantic treatment contract', () => {
  it('materializes concurrent presenter and cutaway events from one approved treatment', () => {
    const sidecar = materializeScriptSidecarV3({
      modelSidecar: ScriptWriterSidecarV3ModelSchema.parse(modelSidecar()),
      treatment: mixedPresenterCutawayTreatment,
      identityPolicy: { mode: 'ordinary' },
    });

    const beat = sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!;
    expect(sidecar.treatment).toEqual({
      treatmentId: mixedPresenterCutawayTreatment.treatmentId,
      treatmentVersion: mixedPresenterCutawayTreatment.version,
      inputFingerprint: mixedPresenterCutawayTreatment.decisionTrace.inputFingerprint,
    });
    expect(beat.visualEvents.map((event) => event.treatmentEventId))
      .toEqual(['event_host_claim', 'event_process_cutaway']);
    expect(beat.visualEvents.map((event) => event.audioRelationship))
      .toEqual(['anchor', 'counterpoint']);
    expect(JSON.stringify(sidecar)).not.toContain('shotIntent');
    expect(JSON.stringify(sidecar)).not.toContain('assetRecommendation');
    expect(JSON.stringify(sidecar)).not.toContain('renderPlan');
    expect(parseScriptSidecarV3(sidecar)).toEqual(sidecar);
  });

  it('canonicalizes persisted hierarchy IDs after model output without changing semantic event IDs', () => {
    const canonical = canonicalizeScriptWriterV3ModelSidecarIds(
      ScriptWriterSidecarV3ModelSchema.parse(modelSidecar()),
      { mode: 'ordinary' },
    );

    expect(canonical.acts[0]!.id).toBe('act_1');
    expect(canonical.acts[0]!.narrativeScenes[0]!.id).toBe('scene_1');
    expect(canonical.acts[0]!.narrativeScenes[0]!.beats[0]!.id).toBe('beat_1');
    expect(canonical.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!.id).toBe('line_1');
    expect(canonical.acts[0]!.narrativeScenes[0]!.beats[0]!.treatmentVisualEvents)
      .toEqual([{ treatmentEventId: 'event_host_claim' }, { treatmentEventId: 'event_process_cutaway' }]);
  });

  it('fails closed when the writer omits a treatment event or invents one', () => {
    const omitted = captureTreatmentError(() => materializeScriptSidecarV3({
      modelSidecar: ScriptWriterSidecarV3ModelSchema.parse(modelSidecar(['event_host_claim'])),
      treatment: mixedPresenterCutawayTreatment,
      identityPolicy: { mode: 'ordinary' },
    }));
    expect(omitted.issues).toEqual(['unused_treatment_visual_event:event_process_cutaway']);

    const invented = captureTreatmentError(() => materializeScriptSidecarV3({
      modelSidecar: ScriptWriterSidecarV3ModelSchema.parse(modelSidecar(['missing_event'])),
      treatment: mixedPresenterCutawayTreatment,
      identityPolicy: { mode: 'ordinary' },
    }));
    expect(invented.issues).toContain('unknown_treatment_visual_event:missing_event');
  });

  it('lets a chapter select exactly its assigned treatment events and rejects all others', () => {
    const scoped = materializeScriptSidecarV3({
      modelSidecar: ScriptWriterSidecarV3ModelSchema.parse(modelSidecar(['event_host_claim'])),
      treatment: mixedPresenterCutawayTreatment,
      identityPolicy: { mode: 'chapter', chapterId: 'chapter_open' },
      treatmentEventIds: ['event_host_claim'],
    });
    expect(scoped.acts[0]!.narrativeScenes[0]!.beats[0]!.visualEvents.map((event) => event.id))
      .toEqual(['event_host_claim']);

    const outOfScope = captureTreatmentError(() => materializeScriptSidecarV3({
      modelSidecar: ScriptWriterSidecarV3ModelSchema.parse(modelSidecar(['event_process_cutaway'])),
      treatment: mixedPresenterCutawayTreatment,
      identityPolicy: { mode: 'chapter', chapterId: 'chapter_open' },
      treatmentEventIds: ['event_host_claim'],
    }));
    expect(outOfScope.issues).toContain('out_of_scope_treatment_visual_event:event_process_cutaway');
  });

  it('rejects final-form fields from the model-facing V3 schema', () => {
    const candidate = modelSidecar() as Record<string, unknown>;
    const beat = (((candidate.acts as Array<Record<string, unknown>>)[0]!.narrativeScenes as Array<Record<string, unknown>>)[0]!
      .beats as Array<Record<string, unknown>>)[0]!;
    beat.assetRecommendation = 'ai-video';
    beat.shotIntent = { desiredFraming: 'close-up' };

    expect(ScriptWriterSidecarV3ModelSchema.safeParse(candidate).success).toBe(false);
  });
});

function captureTreatmentError(action: () => void): ScriptSidecarV3TreatmentError {
  try {
    action();
  } catch (error) {
    if (error instanceof ScriptSidecarV3TreatmentError) return error;
    throw error;
  }
  throw new Error('Expected materialization to fail with a treatment error.');
}
