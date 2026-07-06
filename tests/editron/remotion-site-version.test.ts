import { describe, expect, it } from 'vitest';

import {
  assertRemotionSiteFresh,
  resolveRemotionSiteFreshness,
} from '../../lib/editron/services/remotion-site-version';
import { resolvePhase0RenderedEvidenceConfig } from '../../lib/editron/services/phase0-rendered-evidence-worker';

const APP_SHA = 'abcdef1234567890abcdef1234567890abcdef12';

describe('Remotion site version freshness', () => {
  it('accepts an explicit Remotion site commit that matches the app deploy', () => {
    const status = resolveRemotionSiteFreshness({
      serveUrl: 'https://remotion-site.example.com',
      env: {
        VERCEL_GIT_COMMIT_SHA: APP_SHA,
        REMOTION_LAMBDA_SERVE_COMMIT_SHA: 'abcdef123456',
      },
    });

    expect(status).toMatchObject({
      ok: true,
      reason: 'verified_env_commit',
      source: 'env',
      appCommit: APP_SHA,
      serveCommit: 'abcdef123456',
    });
  });

  it('accepts a serve URL that contains the current app commit token', () => {
    const status = assertRemotionSiteFresh({
      serveUrl: 'https://remotion-sites.example.com/editron-preview-abcdef123456/index.html',
      env: { VERCEL_GIT_COMMIT_SHA: APP_SHA },
    });

    expect(status).toMatchObject({ ok: true, reason: 'verified_url_commit', source: 'url' });
  });

  it('blocks Vercel renders when the Remotion site is not version-pinned', () => {
    const status = resolveRemotionSiteFreshness({
      serveUrl: 'https://remotion-site.example.com',
      env: { VERCEL_GIT_COMMIT_SHA: APP_SHA },
    });

    expect(status).toMatchObject({
      ok: false,
      reason: 'missing_remotion_site_commit',
      serveCommit: null,
    });
    expect(() => assertRemotionSiteFresh({
      serveUrl: 'https://remotion-site.example.com',
      env: { VERCEL_GIT_COMMIT_SHA: APP_SHA },
    })).toThrow(/not version-pinned/);
  });

  it('blocks Vercel renders when the Remotion site commit differs from the app deploy', () => {
    expect(() => assertRemotionSiteFresh({
      serveUrl: 'https://remotion-site.example.com',
      env: {
        VERCEL_GIT_COMMIT_SHA: APP_SHA,
        REMOTION_LAMBDA_SERVE_COMMIT_SHA: '111111122222',
      },
    })).toThrow(/points at commit/);
  });

  it('keeps local/test renders non-blocking when app commit metadata is absent', () => {
    const status = resolveRemotionSiteFreshness({
      serveUrl: 'https://remotion-site.example.com',
      env: {},
    });

    expect(status).toMatchObject({ ok: true, reason: 'unverified_no_app_commit' });
  });

  it('makes Phase0 rendered truth skip when Vercel commit metadata has no matching Remotion site commit', () => {
    const config = resolvePhase0RenderedEvidenceConfig({
      REMOTION_LAMBDA_FUNCTION_NAME: 'phase0-fn',
      REMOTION_LAMBDA_SERVE_URL: 'https://remotion-site.example.com',
      REMOTION_AWS_REGION: 'us-east-1',
      VERCEL_GIT_COMMIT_SHA: APP_SHA,
    });

    expect(config.configured).toBe(false);
    expect(config.reason).toBe('remotion_site_missing_remotion_site_commit');
  });
});