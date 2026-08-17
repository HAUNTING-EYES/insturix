import { describe, expect, it } from 'vitest';
import {
  CLICKATRON_E2E_MEDIA_FIXTURE_MODE,
  resolveClickatronE2EMediaFixture,
} from '@/lib/clickatron/e2e-media-fixture';

function fixtureEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return Object.assign({
    NODE_ENV: 'test',
    THINKFORGE_E2E_MODE: '1',
    THINKFORGE_E2E_RUN_ID: 'scope1',
    CLICKATRON_E2E_MEDIA_FIXTURE: CLICKATRON_E2E_MEDIA_FIXTURE_MODE,
  } as NodeJS.ProcessEnv, overrides);
}

const INVALID_FIXTURE_ENVIRONMENTS: Array<[Partial<NodeJS.ProcessEnv>, string]> = [
  [{ NODE_ENV: 'production' }, 'forbidden in production'],
  [{ THINKFORGE_E2E_MODE: '0' }, 'requires THINKFORGE_E2E_MODE=1'],
  [{ THINKFORGE_E2E_RUN_ID: '' }, 'requires a valid ThinkForge E2E run ID'],
  [{ THINKFORGE_E2E_RUN_ID: '../unsafe' }, 'requires a valid ThinkForge E2E run ID'],
  [{ CLICKATRON_E2E_MEDIA_FIXTURE: 'fal' }, 'Unsupported CLICKATRON_E2E_MEDIA_FIXTURE mode'],
];

describe('Clickatron E2E media fixture', () => {
  it('is disabled by default', () => {
    expect(resolveClickatronE2EMediaFixture({ NODE_ENV: 'test' })).toBeNull();
  });

  it('returns a deterministic browser-loadable bitmap only under every E2E guard', () => {
    expect(resolveClickatronE2EMediaFixture(fixtureEnvironment())).toEqual({
      mode: 'completed',
      runId: 'scope1',
      imageRef: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });

  it.each(INVALID_FIXTURE_ENVIRONMENTS)('fails closed when a guard is invalid', (overrides, message) => {
    expect(() => resolveClickatronE2EMediaFixture(fixtureEnvironment(overrides)))
      .toThrow(message);
  });
});
