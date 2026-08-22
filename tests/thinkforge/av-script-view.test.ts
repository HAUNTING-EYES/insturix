import { describe, expect, it } from 'vitest';

import { parseAVScriptPresentationResponse } from '@/components/dashboard/ThinkForge/AVScriptView';
import type { AVScriptPresentation } from '@/lib/thinkforge/presentation/av-script-projection';

const validPresentation = {
  version: 1,
  status: 'available',
  document: { title: 'A visible cost', version: 7 },
  treatment: {
    audienceOutcome: 'Recognise the operational cost before it compounds.',
    viewerPromise: 'A concise explanation of a hidden cost.',
    narrativeArc: 'Claim, counterpoint, and resolution.',
    visualVerbalRelationship: 'counterpoint',
    visualRhythm: 'Measured and evidence-led.',
    informationHierarchy: ['Human stake', 'Operational proof'],
    brandBoundaries: ['Do not overstate the claim.'],
    referenceSynthesis: ['Use the approved product flow as evidence.'],
    continuityStrategy: 'Keep the host and product proof connected.',
    audioVoiceStrategy: 'Calm voice-over with direct sync dialogue.',
    userConstraints: [],
    unresolvedAssumptions: [],
    decisions: [{
      decision: 'Keep the host visible while proof appears.',
      rationale: 'It preserves trust while the visual counterpoint makes the claim legible.',
      confidence: 0.9,
      evidenceCount: 2,
    }],
  },
  acts: [{
    title: 'Opening',
    narrativePurpose: 'Establish the human stakes.',
    scenes: [{
      title: 'Claim and counterpoint',
      narrativePurpose: 'Keep the host present while the process becomes legible.',
      durationIntentSeconds: 12,
      beats: [{
        kind: 'mixed',
        narrativePurpose: 'Frame the cost and show the operational proof concurrently.',
        durationIntentSeconds: 12,
        heard: [{
          speaker: 'Host',
          delivery: 'sync-dialogue',
          text: 'The cost is visible long before the handoff that caused it.',
          onCamera: true,
        }],
        onScreenText: ['The hidden cost'],
        visualLayers: [{
          audienceJob: 'Establish authority and emotional stakes.',
          visualThesis: 'The host and operational proof remain concurrent.',
          audioRelationship: 'counterpoint',
          timingNote: 'Run through the spoken claim.',
          continuityNotes: ['Carry the host eyeline into the proof.'],
          brandBoundaries: ['Avoid unsupported quantitative claims.'],
          accessibilityRequirements: ['Keep the spoken claim legible without colour alone.'],
          approvedSourceCount: 1,
          creativeReferenceCount: 1,
          captureRequirements: [{
            objective: 'Capture the approved handoff screen.',
            whyRequired: 'It is the primary operational proof.',
            captureKind: 'screen-recording',
            unresolvedCapabilityQuestions: [],
          }],
        }],
      }],
    }],
  }],
} satisfies AVScriptPresentation;

describe('AV Script client response parser', () => {
  it('accepts a complete user-safe presentation with concurrent visual layers', () => {
    const result = parseAVScriptPresentationResponse(validPresentation);

    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result.presentation.acts[0]?.scenes[0]?.beats[0]?.visualLayers).toHaveLength(1);
    expect(result.presentation.acts[0]?.scenes[0]?.beats[0]?.heard[0]?.speaker).toBe('Host');
  });

  it('preserves an explicit stale contract response instead of treating it as a network failure', () => {
    expect(parseAVScriptPresentationResponse({
      status: 'stale',
      code: 'script-sidecar-stale',
      message: 'The script changed after its AV treatment was written.',
    })).toEqual({
      status: 'stale',
      code: 'script-sidecar-stale',
      message: 'The script changed after its AV treatment was written.',
    });
  });

  it('rejects a superficially successful payload with malformed nested visual layers', () => {
    const malformed = structuredClone(validPresentation) as Record<string, unknown>;
    const acts = malformed.acts as Array<Record<string, unknown>>;
    const scenes = acts[0]?.scenes as Array<Record<string, unknown>>;
    const beats = scenes[0]?.beats as Array<Record<string, unknown>>;
    beats[0]!.visualLayers = [{ audienceJob: 'Missing the rest of the contract.' }];

    expect(parseAVScriptPresentationResponse(malformed)).toMatchObject({
      status: 'invalid_contract',
      code: 'malformed_response',
    });
  });
});
