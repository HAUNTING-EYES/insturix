import { describe, expect, it } from 'vitest';
import {
  assertVideoTreatmentReferences,
  parseCreativeReferenceSet,
  parseVideoTreatment,
  VIDEO_TREATMENT_SIDECAR_TARGET_VERSION,
  VIDEO_TREATMENT_VERSION,
  VideoTreatmentReferenceError,
} from '@/lib/thinkforge/schemas/video-treatment';
import {
  abstractExplainerTreatment,
  brandContrastTreatments,
  mixedPresenterCutawayTreatment,
  referenceLedCreativeReferenceSet,
  referenceLedTreatment,
  unknownSetupTreatment,
  videoTreatmentGoldenFixtures,
} from '@/tests/fixtures/thinkforge-video-treatment';

describe('ThinkForge VideoTreatment contract', () => {
  it('validates every golden treatment fixture', () => {
    expect(videoTreatmentGoldenFixtures).toHaveLength(8);
    for (const fixture of videoTreatmentGoldenFixtures) {
      expect(parseVideoTreatment(fixture)).toEqual(fixture);
    }
  });

  it('represents a graphics-led explainer with zero physical capture requirements', () => {
    const parsed = parseVideoTreatment(abstractExplainerTreatment);

    expect(parsed.captureRequirements).toEqual([]);
    expect(parsed.visualEvents[0]?.captureRequirementIds).toEqual([]);
  });

  it('rejects physical-camera requirements when resolved intent forbids physical capture', () => {
    const invalid = structuredClone(mixedPresenterCutawayTreatment);
    invalid.audiovisualIntent.physicalCapture = 'forbidden';

    expect(() => parseVideoTreatment(invalid)).toThrow(/Physical capture is forbidden/);
  });

  it('rejects a treatment that omits required physical capture', () => {
    const invalid = structuredClone(abstractExplainerTreatment);
    invalid.audiovisualIntent.physicalCapture = 'required';

    expect(() => parseVideoTreatment(invalid)).toThrow(/Physical capture is required/);
  });

  it('rejects visible-person events and performer capture when people are forbidden', () => {
    const invalid = structuredClone(mixedPresenterCutawayTreatment);
    invalid.audiovisualIntent.visiblePerson = 'forbidden';
    invalid.audiovisualIntent.onCameraSpeech = 'forbidden';

    expect(() => parseVideoTreatment(invalid)).toThrow(/visible people are forbidden|forbid visible people/);
  });

  it('rejects a treatment that omits a required visible person', () => {
    const invalid = structuredClone(abstractExplainerTreatment);
    invalid.audiovisualIntent.visiblePerson = 'required';

    expect(() => parseVideoTreatment(invalid)).toThrow(/visual event must require a visible person/);
  });

  it('rejects capture requirements that are not used by any visual event', () => {
    const invalid = structuredClone(mixedPresenterCutawayTreatment);
    invalid.captureRequirements.push({
      ...structuredClone(invalid.captureRequirements[0]!),
      id: 'capture_orphan',
      objective: 'Capture evidence that no narrative moment requests.',
    });

    expect(() => parseVideoTreatment(invalid)).toThrow(/not linked to any visual event/);
  });

  it('preserves a presenter and cutaway as concurrent semantic events in one narrative moment', () => {
    const parsed = parseVideoTreatment(mixedPresenterCutawayTreatment);
    const events = parsed.visualEvents.filter((event) => event.momentId === 'moment_opening_claim');

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.audioRelationship)).toEqual(['anchor', 'counterpoint']);
    expect(events[0]?.captureRequirementIds).toEqual(['capture_host_opening']);
    expect(events[1]?.captureRequirementIds).toEqual([]);
    expect(parsed.captureRequirements[0]).toMatchObject({
      captureKind: 'physical-camera',
      requiredCapabilities: ['performer', 'camera', 'space', 'audio'],
    });
  });

  it('does not permit a legacy asset recommendation to become a treatment decision', () => {
    const invalid = structuredClone(abstractExplainerTreatment) as Record<string, unknown>;
    const events = invalid.visualEvents as Array<Record<string, unknown>>;
    events[0]!.assetRecommendation = 'graphics-only';

    expect(() => parseVideoTreatment(invalid)).toThrow();
  });

  it('keeps reference provenance separate from factual source references', () => {
    const references = parseCreativeReferenceSet(referenceLedCreativeReferenceSet);
    const treatment = parseVideoTreatment(referenceLedTreatment);

    expect(() => assertVideoTreatmentReferences(treatment, references)).not.toThrow();
    expect(treatment.visualEvents[0]?.sourceRefs).toEqual(['src_brief']);
    expect(treatment.visualEvents[0]?.creativeReferenceIds).toEqual(['ref_explainer']);
  });

  it('fails loudly when a treatment references an unknown creative reference', () => {
    const invalid = structuredClone(referenceLedTreatment);
    invalid.visualEvents[0]!.creativeReferenceIds = ['missing_reference'];
    const references = parseCreativeReferenceSet(referenceLedCreativeReferenceSet);

    expect(() => assertVideoTreatmentReferences(invalid, references))
      .toThrow(VideoTreatmentReferenceError);
  });

  it('keeps unknown production capability explicit instead of inventing physical setup details', () => {
    const parsed = parseVideoTreatment(unknownSetupTreatment);
    const requirement = parsed.captureRequirements[0]!;

    expect(requirement.unresolvedCapabilityQuestions).toEqual([
      'What device is available?',
      'Which room can be used?',
      'What audio and lighting are available?',
    ]);
    expect(requirement.requiredCapabilities).toEqual(['performer', 'camera', 'space', 'audio', 'lighting']);
    expect(requirement.constraints.join(' ')).toMatch(/Do not estimate a lens, room depth, lighting layout, cost, or setup time/);
  });

  it('reads valid original V1 records without inventing audiovisual or camera decisions', () => {
    const legacy = structuredClone(mixedPresenterCutawayTreatment);
    delete (legacy as Partial<typeof legacy>).audiovisualIntent;
    legacy.visualEvents.forEach((event) => delete (event as Partial<typeof event>).visiblePerson);
    const requirement = legacy.captureRequirements[0]! as Record<string, unknown>;
    delete requirement.captureKind;
    delete requirement.requiredCapabilities;

    const parsed = parseVideoTreatment(legacy);
    expect(parsed.audiovisualIntent).toMatchObject({
      audibleSpeech: 'unspecified',
      onCameraSpeech: 'unspecified',
      visiblePerson: 'unspecified',
      physicalCapture: 'unspecified',
    });
    expect(parsed.visualEvents.every((event) => event.visiblePerson === 'unspecified')).toBe(true);
    expect(parsed.captureRequirements[0]).toMatchObject({
      captureKind: 'unspecified',
      requiredCapabilities: [],
    });
  });

  it('keeps brand treatment variation semantic rather than changing document type', () => {
    const brandA = parseVideoTreatment(brandContrastTreatments.brandA);
    const brandB = parseVideoTreatment(brandContrastTreatments.brandB);

    expect(brandA.visualVerbalRelationship).toBe('anchor');
    expect(brandB.visualVerbalRelationship).toBe('complement');
    expect(brandA.visualEvents[0]?.visualThesis).not.toBe(brandB.visualEvents[0]?.visualThesis);
  });

  it('freezes the initial contract and Sidecar V3 transition target', () => {
    expect(VIDEO_TREATMENT_VERSION).toBe(1);
    expect(VIDEO_TREATMENT_SIDECAR_TARGET_VERSION).toBe(3);
  });
});
