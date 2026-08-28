import { describe, expect, it } from 'vitest';
import {
  findScriptSidecarV3AudiovisualEventIssues,
} from '@/lib/thinkforge/schemas/script-sidecar-v3-audiovisual-validation';
import {
  parseScriptSidecarV3,
  type ScriptSidecarV3,
} from '@/lib/thinkforge/schemas/script-sidecar-v3';
import type { VideoTreatment } from '@/lib/thinkforge/schemas/video-treatment';
import { mixedPresenterCutawayTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

function buildSidecar(input: {
  treatment?: VideoTreatment;
  openingEventIds: readonly string[];
  includeOnCameraLine?: boolean;
  charactersPresent?: readonly string[];
}): ScriptSidecarV3 {
  const treatment = input.treatment ?? mixedPresenterCutawayTreatment;
  const openingEventIds = new Set(input.openingEventIds);
  const selectedEvent = (eventId: string) => {
    const event = treatment.visualEvents.find((candidate) => candidate.id === eventId);
    if (!event) throw new Error(`Missing fixture event ${eventId}`);
    return { ...event, treatmentEventId: event.id };
  };
  const openingEvents = treatment.visualEvents
    .filter((event) => openingEventIds.has(event.id))
    .map((event) => selectedEvent(event.id));
  const remainingEvents = treatment.visualEvents
    .filter((event) => !openingEventIds.has(event.id))
    .map((event) => selectedEvent(event.id));
  const includeOnCameraLine = input.includeOnCameraLine ?? true;

  return parseScriptSidecarV3({
    sidecarVersion: 3,
    spokenTextSource: 'beat-lines',
    treatment: {
      treatmentId: treatment.treatmentId,
      treatmentVersion: treatment.version,
      inputFingerprint: treatment.decisionTrace.inputFingerprint,
    },
    characters: [{ id: 'host', name: 'Host', role: 'host' }],
    acts: [{
      id: 'act_1',
      title: 'Opening argument',
      narrativePurpose: 'Establish the claim and reveal its operational consequence.',
      narrativeScenes: [{
        id: 'scene_1',
        title: 'Claim and reveal',
        narrativePurpose: 'Keep speech and semantic visual evidence locally coherent.',
        durationIntentSeconds: 20,
        charactersPresent: [...(input.charactersPresent ?? ['host'])],
        sourceRefs: [],
        beats: [{
          id: 'beat_opening',
          kind: includeOnCameraLine ? 'dialogue' : 'visual',
          narrativePurpose: 'Land the opening claim.',
          durationIntentSeconds: 10,
          lines: includeOnCameraLine ? [{
            id: 'line_opening',
            text: 'The hidden handoff is already costing the launch.',
            speakerId: 'host',
            languageCode: 'en',
            onCamera: true,
            delivery: 'sync-dialogue',
            sourceRefs: [],
          }] : [],
          visualEvents: openingEvents,
          sourceRefs: [],
        }, {
          id: 'beat_reveal',
          kind: 'visual',
          narrativePurpose: 'Reveal the process behind the claim.',
          durationIntentSeconds: 10,
          lines: [],
          visualEvents: remainingEvents,
          sourceRefs: ['src_brief'],
        }],
      }],
    }],
    sourceRefs: ['src_brief'],
  });
}

describe('Script Sidecar V3 audiovisual event validation', () => {
  it('accepts on-camera speech bound to a local person-compatible treatment event', () => {
    const sidecar = buildSidecar({ openingEventIds: ['event_host_claim'] });

    expect(findScriptSidecarV3AudiovisualEventIssues({
      sidecar,
      treatment: mixedPresenterCutawayTreatment,
    })).toEqual([]);
  });

  it('rejects on-camera speech with no local treatment event', () => {
    const sidecar = buildSidecar({ openingEventIds: [] });

    expect(findScriptSidecarV3AudiovisualEventIssues({
      sidecar,
      treatment: mixedPresenterCutawayTreatment,
    })).toContain('audiovisual_on_camera_event_missing:beat_opening');
  });

  it('rejects on-camera speech when every local event forbids a visible person', () => {
    const treatment: VideoTreatment = {
      ...mixedPresenterCutawayTreatment,
      visualEvents: mixedPresenterCutawayTreatment.visualEvents.map((event) => (
        event.id === 'event_process_cutaway'
          ? { ...event, visiblePerson: 'forbidden' as const }
          : event
      )),
    };
    const sidecar = buildSidecar({
      treatment,
      openingEventIds: ['event_process_cutaway'],
    });

    expect(findScriptSidecarV3AudiovisualEventIssues({ sidecar, treatment }))
      .toContain('audiovisual_on_camera_event_forbids_person:beat_opening');
  });

  it('rejects a person-required event in a scene with no visible cast', () => {
    const sidecar = buildSidecar({
      openingEventIds: ['event_host_claim'],
      includeOnCameraLine: false,
      charactersPresent: [],
    });

    expect(findScriptSidecarV3AudiovisualEventIssues({
      sidecar,
      treatment: mixedPresenterCutawayTreatment,
    })).toContain('audiovisual_visible_person_event_cast_missing:event_host_claim');
  });
});
