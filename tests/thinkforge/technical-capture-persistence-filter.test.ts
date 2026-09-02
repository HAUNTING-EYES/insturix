import { describe, expect, it } from 'vitest';

import {
  buildCaptureAcquisitionDecisionWriteFilter,
  buildTechnicalCapturePlanningWriteFilter,
} from '@/lib/thinkforge/services/db';

const BASE_BINDING = {
  sessionId: 'session_1',
  scriptId: 'script_1',
  expectedVersion: 3,
  expectedContent: 'Bound script content.',
  expectedSidecarHash: 'a'.repeat(64),
};

describe('technical capture planning persistence filter', () => {
  it('requires the exact acquisition decision hash when one produced the design', () => {
    expect(buildTechnicalCapturePlanningWriteFilter({
      ...BASE_BINDING,
      expectedAcquisitionDecisionSetHash: 'b'.repeat(64),
    })).toEqual(expect.objectContaining({
      sessionId: 'session_1',
      scriptId: 'script_1',
      version: 3,
      'metadata.captureAcquisitionDecisions.decisionSetHash': 'b'.repeat(64),
    }));
  });

  it('requires acquisition decisions to remain absent when none produced the design', () => {
    expect(buildTechnicalCapturePlanningWriteFilter({
      ...BASE_BINDING,
      expectedAcquisitionDecisionSetHash: null,
    })).toEqual(expect.objectContaining({
      'metadata.captureAcquisitionDecisions': { $exists: false },
    }));
  });

  it('rejects an invalid decision hash instead of weakening the write guard', () => {
    expect(() => buildTechnicalCapturePlanningWriteFilter({
      ...BASE_BINDING,
      expectedAcquisitionDecisionSetHash: 'not-a-hash',
    })).toThrow(/decision hash must be a SHA-256 digest/);
  });
});

describe('capture acquisition decision persistence filter', () => {
  it('updates only the exact prior decision-set revision', () => {
    expect(buildCaptureAcquisitionDecisionWriteFilter({
      ...BASE_BINDING,
      expectedPreviousDecisionSetHash: 'c'.repeat(64),
    })).toEqual(expect.objectContaining({
      sessionId: 'session_1',
      scriptId: 'script_1',
      version: 3,
      content: 'Bound script content.',
      'metadata.writerOutput.sidecarBinding.sidecarHash': 'a'.repeat(64),
      'metadata.captureAcquisitionDecisions.decisionSetHash': 'c'.repeat(64),
    }));
  });

  it('requires the prior decision set to remain absent for the first write', () => {
    expect(buildCaptureAcquisitionDecisionWriteFilter({
      ...BASE_BINDING,
      expectedPreviousDecisionSetHash: null,
    })).toEqual(expect.objectContaining({
      'metadata.captureAcquisitionDecisions': { $exists: false },
    }));
  });

  it('rejects an invalid prior hash instead of weakening the CAS', () => {
    expect(() => buildCaptureAcquisitionDecisionWriteFilter({
      ...BASE_BINDING,
      expectedPreviousDecisionSetHash: 'invalid',
    })).toThrow(/Previous capture acquisition decision hash/);
  });
});
