import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { computeRemotionSiteFingerprint } from '../../lib/editron/services/remotion-site-fingerprint';
import {
  assertRemotionSiteFresh,
  resolveRemotionSiteFreshness,
} from '../../lib/editron/services/remotion-site-version';
import { resolvePhase0RenderedEvidenceConfig } from '../../lib/editron/services/phase0-rendered-evidence-worker';

const APP_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const tempDirectories: string[] = [];

afterEach(() => {
  for (const tempDirectory of tempDirectories.splice(0)) {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

describe('Remotion site version freshness', () => {
  it('accepts an explicit Remotion bundle fingerprint that matches the app build', () => {
    const status = resolveRemotionSiteFreshness({
      serveUrl: 'https://remotion-site.example.com',
      env: {
        EDITRON_REMOTION_BUNDLE_SHA: APP_SHA,
        REMOTION_LAMBDA_SERVE_BUNDLE_SHA: 'abcdef123456',
      },
    });

    expect(status).toMatchObject({
      ok: true,
      reason: 'verified_env_bundle',
      source: 'env',
      expectedBundle: APP_SHA,
      serveBundle: 'abcdef123456',
    });
  });

  it('accepts a serve URL that contains the expected renderer bundle token', () => {
    const status = assertRemotionSiteFresh({
      serveUrl: 'https://remotion-sites.example.com/editron-preview-abcdef123456/index.html',
      env: { EDITRON_REMOTION_BUNDLE_SHA: APP_SHA },
    });

    expect(status).toMatchObject({ ok: true, reason: 'verified_url_bundle', source: 'url' });
  });

  it('blocks Vercel renders when the Remotion site is not bundle-pinned', () => {
    const status = resolveRemotionSiteFreshness({
      serveUrl: 'https://remotion-site.example.com',
      env: { EDITRON_REMOTION_BUNDLE_SHA: APP_SHA },
    });

    expect(status).toMatchObject({
      ok: false,
      reason: 'missing_remotion_site_bundle',
      serveBundle: null,
    });
    expect(() => assertRemotionSiteFresh({
      serveUrl: 'https://remotion-site.example.com',
      env: { EDITRON_REMOTION_BUNDLE_SHA: APP_SHA },
    })).toThrow(/not pinned/);
  });

  it('blocks Vercel renders when the Remotion bundle differs from the app build', () => {
    expect(() => assertRemotionSiteFresh({
      serveUrl: 'https://remotion-site.example.com',
      env: {
        EDITRON_REMOTION_BUNDLE_SHA: APP_SHA,
        REMOTION_LAMBDA_SERVE_BUNDLE_SHA: '111111122222',
      },
    })).toThrow(/renderer bundle/);
  });

  it('keeps local/test renders non-blocking when expected bundle metadata is absent', () => {
    const status = resolveRemotionSiteFreshness({
      serveUrl: 'https://remotion-site.example.com',
      env: {},
    });

    expect(status).toMatchObject({ ok: true, reason: 'unverified_no_app_commit' });
  });

  it('makes Phase0 rendered truth skip when build metadata has no matching Remotion bundle', () => {
    const config = resolvePhase0RenderedEvidenceConfig({
      REMOTION_LAMBDA_FUNCTION_NAME: 'phase0-fn',
      REMOTION_LAMBDA_SERVE_URL: 'https://remotion-site.example.com',
      REMOTION_AWS_REGION: 'us-east-1',
      EDITRON_REMOTION_BUNDLE_SHA: APP_SHA,
    });

    expect(config.configured).toBe(false);
    expect(config.reason).toBe('remotion_site_missing_remotion_site_bundle');
  });

  it('changes only when the renderer import graph changes', () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'editron-remotion-fingerprint-'));
    tempDirectories.push(rootDir);
    writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({
      dependencies: { react: '19.1.0' },
    }));
    writeFileSync(
      path.join(rootDir, 'entry.ts'),
      "import type { TypeOnly } from './type-only'; import './renderer'; import React from 'react';\n",
    );
    writeFileSync(path.join(rootDir, 'renderer.ts'), 'export const renderer = 1;\n');
    writeFileSync(path.join(rootDir, 'type-only.ts'), 'export interface TypeOnly { value: string }\n');
    writeFileSync(path.join(rootDir, 'remotion.config.ts'), 'export const config = true;\n');
    writeFileSync(path.join(rootDir, 'unrelated.ts'), 'export const unrelated = 1;\n');

    const first = computeRemotionSiteFingerprint({ rootDir, entryPoint: 'entry.ts' });
    writeFileSync(path.join(rootDir, 'unrelated.ts'), 'export const unrelated = 2;\n');
    const unrelatedChanged = computeRemotionSiteFingerprint({ rootDir, entryPoint: 'entry.ts' });
    writeFileSync(path.join(rootDir, 'renderer.ts'), 'export const renderer = 2;\n');
    const rendererChanged = computeRemotionSiteFingerprint({ rootDir, entryPoint: 'entry.ts' });

    expect(unrelatedChanged.sha256).toBe(first.sha256);
    expect(rendererChanged.sha256).not.toBe(first.sha256);
    expect(first.files).toEqual(['entry.ts', 'remotion.config.ts', 'renderer.ts']);
    expect(first.packages).toEqual(['react@19.1.0']);
  });

  it('fails loudly when a runtime import cannot be fingerprinted', () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'editron-remotion-fingerprint-'));
    tempDirectories.push(rootDir);
    writeFileSync(path.join(rootDir, 'package.json'), '{}');
    writeFileSync(path.join(rootDir, 'entry.ts'), "import './missing-renderer';\n");
    writeFileSync(path.join(rootDir, 'remotion.config.ts'), 'export const config = true;\n');

    expect(() => computeRemotionSiteFingerprint({ rootDir, entryPoint: 'entry.ts' }))
      .toThrow(/Unable to resolve local Remotion import/);
  });
});
