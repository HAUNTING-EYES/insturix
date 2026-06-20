import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: mocks.getDatabase,
}));

import {
  recordProjectOutcome,
  resolveBanditOutcomeWritePolicy,
} from '../../lib/editron/services/genre-parameter-bandit';

describe('genre parameter bandit learning gate', () => {
  beforeEach(() => {
    mocks.getDatabase.mockReset();
  });

  it('blocks metadata-only quality scores from training live bandits', async () => {
    expect(resolveBanditOutcomeWritePolicy({
      userRendered: true,
      evidenceSource: 'metadata-only',
    })).toMatchObject({
      allowed: false,
      reason: 'missing_rendered_quality_evidence',
      evidenceSource: 'metadata-only',
    });

    const result = await recordProjectOutcome('user_1', 'project_1', 82, false, false);

    expect(result).toEqual({
      recorded: false,
      reason: 'missing_rendered_quality_evidence',
    });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it('allows rendered aesthetic pass evidence to reach persistence', async () => {
    expect(resolveBanditOutcomeWritePolicy({
      evidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'pass',
    })).toMatchObject({
      allowed: true,
      reason: 'rendered_evidence_passed',
      evidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'pass',
    });
  });

  it('allows explicit publish acceptance even before rendered aesthetic automation exists', () => {
    expect(resolveBanditOutcomeWritePolicy({
      userPublished: true,
    })).toMatchObject({
      allowed: true,
      reason: 'user_published',
      evidenceSource: 'user-published',
    });
  });
});
