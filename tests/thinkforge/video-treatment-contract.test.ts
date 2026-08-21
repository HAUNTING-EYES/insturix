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

  it('preserves a presenter and cutaway as concurrent semantic events in one narrative moment', () => {
    const parsed = parseVideoTreatment(mixedPresenterCutawayTreatment);
    const events = parsed.visualEvents.filter((event) => event.momentId === 'moment_opening_claim');

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.audioRelationship)).toEqual(['anchor', 'counterpoint']);
    expect(events[0]?.captureRequirementIds).toEqual(['capture_host_opening']);
    expect(events[1]?.captureRequirementIds).toEqual([]);
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
    expect(requirement.constraints.join(' ')).toMatch(/Do not estimate a lens, room depth, lighting layout, cost, or setup time/);
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
