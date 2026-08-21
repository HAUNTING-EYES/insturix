import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  buildCaptureAcquisitionDecisions,
  CaptureAcquisitionDecisionForm,
} from '@/components/dashboard/ThinkForge/production/CaptureAcquisitionDecisionForm';
import type { TreatmentCapturePlan } from '@/lib/thinkforge/production/semantic-capture-plan';

type Requirement = TreatmentCapturePlan['unclassifiedRequirements'][number];

function requirement(id: string, objective: string): Requirement {
  return {
    id,
    captureKind: 'unspecified',
    objective,
    whyRequired: 'The treatment requires direct evidence rather than a generic substitute.',
    subjectOrEvidence: 'Approved workflow evidence',
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    constraints: ['Do not invent product states or proof.'],
    requiredCapabilities: [],
    unresolvedCapabilityQuestions: [],
    capabilityEvidence: [],
    linkedNarrativeMoments: [{
      actId: 'act_1',
      actTitle: 'Opening',
      narrativeSceneId: 'scene_1',
      beatId: 'beat_1',
      eventId: 'event_1',
      narrativePurpose: 'Let approved evidence make the claim concrete.',
      timingNote: 'Appears with the claim.',
      sourceRefs: ['src_brief'],
      continuityNotes: [],
    }],
    continuity: { chapterScope: 'unmapped', actIds: ['act_1'], chapters: [], continuityNotes: [] },
  };
}

describe('CaptureAcquisitionDecisionForm', () => {
  it('maps every deliberate user choice to the narrow server contract', () => {
    const requirements = [
      requirement('workflow', 'Show the actual workflow.'),
      requirement('proof', 'Show the approved outcome.'),
      requirement('host', 'Record the host evidence.'),
    ];

    expect(buildCaptureAcquisitionDecisions(requirements, {
      workflow: 'screen-recording',
      proof: 'source-asset',
      host: 'physical-camera',
    })).toEqual([
      { requirementId: 'workflow', acquisitionKind: 'screen-recording', requiredCapabilities: [] },
      { requirementId: 'proof', acquisitionKind: 'source-asset', requiredCapabilities: [] },
      { requirementId: 'host', acquisitionKind: 'physical-camera', requiredCapabilities: ['camera'] },
    ]);
  });

  it('renders an explicit acquisition control for every unresolved requirement without inventing a setup', () => {
    const html = renderToStaticMarkup(React.createElement(CaptureAcquisitionDecisionForm, {
      requirements: [requirement('workflow', 'Show the actual workflow.')],
      onSubmit: () => undefined,
    }));

    expect(html).toContain('Evidence acquisition');
    expect(html).toContain('Show the actual workflow.');
    expect(html).toContain('Film it with a camera');
    expect(html).toContain('Capture it on screen');
    expect(html).toContain('Use approved source material');
    expect(html).not.toContain('26mm');
    expect(html).not.toContain('room-center');
  });
});
