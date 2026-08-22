import { describe, expect, it } from 'vitest';

import {
  AVScriptProjectionError,
  buildAVScriptPresentation,
} from '@/lib/thinkforge/presentation/av-script-projection';
import {
  materializeScriptSidecarV3,
  ScriptWriterSidecarV3ModelSchema,
} from '@/lib/thinkforge/schemas/script-sidecar-v3';
import { mixedPresenterCutawayTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

function sidecar() {
  return materializeScriptSidecarV3({
    treatment: mixedPresenterCutawayTreatment,
    identityPolicy: { mode: 'ordinary' },
    modelSidecar: ScriptWriterSidecarV3ModelSchema.parse({
      sidecarVersion: 3,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'model_host', name: 'Host', role: 'host' }],
      acts: [{
        id: 'model_act',
        title: 'Opening',
        narrativePurpose: 'Establish the human stakes before revealing the process.',
        narrativeScenes: [{
          id: 'model_scene',
          title: 'Claim and counterpoint',
          narrativePurpose: 'Keep the host present while the process becomes legible.',
          durationIntentSeconds: 12,
          charactersPresent: ['model_host'],
          sourceRefs: ['src_brief'],
          beats: [{
            id: 'model_beat',
            kind: 'mixed',
            narrativePurpose: 'Let the host frame the cost while the visual counterpoint appears concurrently.',
            durationIntentSeconds: 12,
            lines: [{
              id: 'model_line',
              text: 'The cost is visible long before the handoff that caused it.',
              speakerId: 'model_host',
              languageCode: 'en',
              onCamera: true,
              delivery: 'sync-dialogue',
              sourceRefs: ['src_brief'],
            }],
            treatmentVisualEvents: [
              { treatmentEventId: 'event_host_claim' },
              { treatmentEventId: 'event_process_cutaway' },
            ],
            sourceRefs: ['src_brief'],
          }],
        }],
      }],
      sourceRefs: ['src_brief'],
    }),
  });
}

describe('AV script presentation projection', () => {
  it('keeps concurrent semantic layers together without exposing private provenance or final form', () => {
    const presentation = buildAVScriptPresentation({
      title: 'A visible cost',
      documentVersion: 7,
      sidecar: sidecar(),
      treatment: mixedPresenterCutawayTreatment,
    });

    const beat = presentation.acts[0]!.scenes[0]!.beats[0]!;
    expect(beat.heard).toEqual([{
      speaker: 'Host',
      delivery: 'sync-dialogue',
      text: 'The cost is visible long before the handoff that caused it.',
      onCamera: true,
    }]);
    expect(beat.visualLayers).toHaveLength(2);
    expect(beat.visualLayers.map((layer) => layer.audioRelationship))
      .toEqual(['anchor', 'counterpoint']);
    expect(beat.visualLayers.map((layer) => layer.audienceJob))
      .toEqual(expect.arrayContaining([
        'Establish authority and emotional stakes.',
        'Make the abstract operational cost visible while the host continues speaking.',
      ]));

    const serialized = JSON.stringify(presentation);
    expect(serialized).not.toContain('treatmentId');
    expect(serialized).not.toContain('inputFingerprint');
    expect(serialized).not.toContain('sourceRefs');
    expect(serialized).not.toContain('creativeReferenceIds');
    expect(serialized).not.toContain('shotIntent');
    expect(serialized).not.toContain('renderPlan');
  });

  it('fails rather than presenting a treatment whose semantic event changed after binding', () => {
    const changed = sidecar();
    changed.acts[0]!.narrativeScenes[0]!.beats[0]!.visualEvents[1]!.visualThesis = 'A different visual meaning.';

    expect(() => buildAVScriptPresentation({
      documentVersion: 7,
      sidecar: changed,
      treatment: mixedPresenterCutawayTreatment,
    })).toThrow(AVScriptProjectionError);
  });
});
