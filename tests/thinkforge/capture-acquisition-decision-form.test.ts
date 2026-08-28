import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  buildCaptureAcquisitionDecisions,
  CaptureAcquisitionDecisionForm,
  type CaptureAcquisitionDraft,
} from '@/components/dashboard/ThinkForge/production/CaptureAcquisitionDecisionForm';
import type { TreatmentCapturePlan } from '@/lib/thinkforge/production/semantic-capture-plan';

type DecisionRequest = TreatmentCapturePlan['decisionRequests'][number];

function request(
  requirementId: string,
  allowedAcquisitionKinds: DecisionRequest['allowedAcquisitionKinds'],
  sourceCandidates: DecisionRequest['sourceCandidates'] = [],
): DecisionRequest {
  return {
    requirementId,
    prompt: `Resolve evidence for ${requirementId}.`,
    allowedAcquisitionKinds,
    sourceCandidates,
  };
}

function draft(input: Partial<CaptureAcquisitionDraft>): CaptureAcquisitionDraft {
  return {
    requiredCapabilities: [],
    screenLabel: '',
    screenScope: '',
    screenUrl: '',
    screenAuthorizationConfirmed: false,
    sourceRights: {},
    ...input,
  };
}

describe('CaptureAcquisitionDecisionForm', () => {
  it('emits only complete, authorized acquisition decisions', () => {
    const requests = [
      request('workflow', ['screen-recording']),
      request('proof', ['source-asset'], [{
        referenceId: 'upload_1',
        title: 'Approved result image',
        ledgerKind: 'upload',
        sourceId: 'asset_1',
      }]),
      request('host', ['physical-camera']),
    ];

    expect(buildCaptureAcquisitionDecisions(requests, {
      workflow: draft({
        acquisitionKind: 'screen-recording',
        screenLabel: 'Approved product workspace',
        screenScope: 'Record the import and approval states only.',
        screenUrl: 'https://app.example.com/project/1',
        screenAuthorizationConfirmed: true,
      }),
      proof: draft({
        acquisitionKind: 'source-asset',
        sourceRights: { upload_1: 'project-approved' },
      }),
      host: draft({
        acquisitionKind: 'physical-camera',
        requiredCapabilities: ['camera', 'performer', 'audio'],
      }),
    })).toEqual([{
      requirementId: 'workflow',
      acquisitionKind: 'screen-recording',
      requiredCapabilities: [],
      screenTarget: {
        label: 'Approved product workspace',
        captureScope: 'Record the import and approval states only.',
        sourceUrl: 'https://app.example.com/project/1',
        authorizationConfirmed: true,
      },
    }, {
      requirementId: 'proof',
      acquisitionKind: 'source-asset',
      requiredCapabilities: [],
      sourceSelections: [{ referenceId: 'upload_1', rightsBasis: 'project-approved' }],
    }, {
      requirementId: 'host',
      acquisitionKind: 'physical-camera',
      requiredCapabilities: ['camera', 'performer', 'audio'],
    }]);
  });

  it('withholds incomplete screen and source decisions instead of inventing evidence', () => {
    const requests = [
      request('workflow', ['screen-recording']),
      request('proof', ['source-asset']),
    ];

    expect(buildCaptureAcquisitionDecisions(requests, {
      workflow: draft({ acquisitionKind: 'screen-recording', screenLabel: 'Workspace' }),
      proof: draft({
        acquisitionKind: 'source-asset',
        sourceRights: { forged_source: 'user-provided' },
      }),
    })).toEqual([]);
  });

  it('renders generic choices without camera geometry or invented source material', () => {
    const html = renderToStaticMarkup(React.createElement(CaptureAcquisitionDecisionForm, {
      requests: [request('workflow', ['physical-camera', 'screen-recording', 'source-asset'])],
      onSubmit: () => undefined,
    }));

    expect(html).toContain('Evidence acquisition');
    expect(html).toContain('Capture with a camera');
    expect(html).toContain('Record an authorized screen target');
    expect(html).toContain('Use authorized source material');
    expect(html).not.toContain('26mm');
    expect(html).not.toContain('room-center');
  });

  it('renders binding fields when the treatment already requires screen capture', () => {
    const html = renderToStaticMarkup(React.createElement(CaptureAcquisitionDecisionForm, {
      requests: [request('workflow', ['screen-recording'])],
      onSubmit: () => undefined,
    }));

    expect(html).toContain('Authorized product or system');
    expect(html).toContain('Exact flow, states, and boundaries to record');
    expect(html).toContain('I am authorized to capture the named target and states.');
  });
});
