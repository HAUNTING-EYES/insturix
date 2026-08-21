import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TreatmentCapturePlanResult } from '@/components/dashboard/ThinkForge/production/TreatmentCapturePlanResult';
import type { TreatmentCapturePlan } from '@/lib/thinkforge/production/semantic-capture-plan';

type CaptureRequirement = TreatmentCapturePlan['physicalCaptureRequirements'][number];

function requirement(overrides: Partial<CaptureRequirement> = {}): CaptureRequirement {
  return {
    id: 'requirement_1',
    captureKind: 'source-asset',
    objective: 'Show the workflow evidence that makes the claim believable.',
    whyRequired: 'The audience needs proof while the narration explains the implication.',
    subjectOrEvidence: 'Approved product workflow recording',
    sourceRefs: [],
    creativeReferenceIds: [],
    constraints: ['Do not restate the voice-over verbatim.'],
    requiredCapabilities: [],
    unresolvedCapabilityQuestions: [],
    capabilityEvidence: [],
    linkedNarrativeMoments: [{
      actId: 'act_1',
      actTitle: 'Opening',
      narrativeSceneId: 'scene_1',
      beatId: 'beat_1',
      eventId: 'event_1',
      narrativePurpose: 'Let the evidence carry the proof while narration adds context.',
      timingNote: 'Appears alongside the explanation.',
      sourceRefs: [],
      continuityNotes: [],
    }],
    continuity: { chapterScope: 'unmapped', actIds: ['act_1'], chapters: [], continuityNotes: [] },
    ...overrides,
  } as CaptureRequirement;
}

function plan(overrides: Partial<TreatmentCapturePlan> = {}): TreatmentCapturePlan {
  return {
    version: 1,
    kind: 'treatment-capture-plan',
    status: 'no-physical-capture',
    treatment: {
      treatmentId: 'treatment_1',
      treatmentVersion: 1,
      inputFingerprint: 'treatment_fingerprint',
    },
    voiceRecording: { required: false, speakers: [] },
    physicalCaptureRequirements: [],
    nonPhysicalAcquisitionRequirements: [requirement()],
    unclassifiedRequirements: [],
    calibrationQuestions: [],
    ...overrides,
  } as TreatmentCapturePlan;
}

describe('TreatmentCapturePlanResult', () => {
  it('renders graphics and source acquisition without legacy camera-diagram language', () => {
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(React.createElement(TreatmentCapturePlanResult, {
      plan: plan(),
    }));

    expect(html).toContain('No physical shoot is required');
    expect(html).toContain('Approved product workflow recording');
    expect(html).toContain('Let the evidence carry the proof');
    expect(html).not.toContain('coordinateSystem');
    expect(html).not.toContain('normalized camera mark');
    expect(html).not.toContain('Setup groups');
  });

  it('shows only the unresolved physical confirmation that the treatment requires', () => {
    vi.stubGlobal('React', React);
    const physicalRequirement = requirement({
      captureKind: 'physical-camera',
      objective: 'Record the host opening that frames the audience problem.',
      capabilityEvidence: [{
        capability: 'camera',
        status: 'missing',
        detail: 'No confirmed production profile declares an available camera.',
        evidenceIds: [],
      }],
      requiredCapabilities: ['camera'],
    });
    const html = renderToStaticMarkup(React.createElement(TreatmentCapturePlanResult, {
      plan: plan({
        status: 'needs-capture-calibration',
        physicalCaptureRequirements: [physicalRequirement],
        nonPhysicalAcquisitionRequirements: [],
        calibrationQuestions: ['Choose the exact camera or recording device available for this capture requirement.'],
      }),
      onEditInputs: () => undefined,
    }));

    expect(html).toContain('Physical capture needs confirmation');
    expect(html).toContain('No confirmed production profile declares an available camera.');
    expect(html).toContain('Confirm capture inputs');
    expect(html).not.toContain('26mm');
    expect(html).not.toContain('room-center');
  });

  it('shows authored cross-chapter continuity without promising that physical setup can be reused', () => {
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(React.createElement(TreatmentCapturePlanResult, {
      plan: plan({
        physicalCaptureRequirements: [requirement({
          captureKind: 'physical-camera',
          continuity: {
            chapterScope: 'cross-chapter',
            actIds: ['act_1', 'act_2'],
            chapters: [
              { actId: 'act_1', actTitle: 'Opening', chapterId: 'chapter_1', chapterTitle: 'The claim', narrativeSceneIds: ['scene_1'] },
              { actId: 'act_2', actTitle: 'Return', chapterId: 'chapter_2', chapterTitle: 'The consequence', narrativeSceneIds: ['scene_2'] },
            ],
            continuityNotes: ['Return to the host after the counterpoint resolves.'],
          },
        })],
        nonPhysicalAcquisitionRequirements: [],
      }),
    }));

    expect(html).toContain('Story continuity');
    expect(html).toContain('Appears in 2 planned chapters.');
    expect(html).toContain('Opening: ');
    expect(html).toContain('The consequence');
    expect(html).toContain('Return to the host after the counterpoint resolves.');
    expect(html).not.toContain('same camera');
    expect(html).not.toContain('same room');
  });
});
