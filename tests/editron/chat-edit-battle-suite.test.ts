import { describe, expect, it } from 'vitest';

import {
  parseSuiteArgs,
  resolveLiveChatBattleScenarios,
  validateAccessibleSourceProjectPayload,
  validateBattleCreditPreflight,
  validateDeploymentIdentityPayload,
  validateSuiteEnvironmentSelection,
} from '../../scripts/run-chat-edit-battle-suite';

describe('chat edit battle suite environment selection', () => {
  it('requires an explicit environment file for a remote deployment', () => {
    expect(validateSuiteEnvironmentSelection({
      baseUrl: 'https://preview.example.test',
    })).toContain('--env-file is required');
  });

  it('allows local execution to use the local environment files', () => {
    expect(validateSuiteEnvironmentSelection({
      baseUrl: 'http://127.0.0.1:3000',
    })).toBeNull();
  });

  it('parses and preserves the environment file used by fixture subprocesses', () => {
    expect(parseSuiteArgs([
      '--base-url=https://preview.example.test/',
      '--auth-header-file=C:\\tmp\\editron-auth.json',
      '--env-file=.calibration-temp/vercel-preview.env',
      '--database-name=editron_prev',
      '--cases=motivated-zoom,vague-sfx-beat',
    ])).toMatchObject({
      baseUrl: 'https://preview.example.test',
      authHeaderFile: 'C:\\tmp\\editron-auth.json',
      environmentFile: '.calibration-temp/vercel-preview.env',
      databaseName: 'editron_prev',
      scenarioIds: ['motivated-zoom', 'vague-sfx-beat'],
    });
  });

  it('rejects unsafe database overrides before opening MongoDB', () => {
    expect(() => parseSuiteArgs([
      '--base-url=https://preview.example.test/',
      '--auth-header-file=C:\\tmp\\editron-auth.json',
      '--env-file=.calibration-temp/vercel-preview.env',
      '--database-name=editron_prev;drop',
    ])).toThrow('safe MongoDB database name');
  });

  it('keeps deterministic fault contracts out of the remote live suite', () => {
    const liveIds = resolveLiveChatBattleScenarios([]).map((scenario) => scenario.id);

    expect(liveIds).not.toContain('bgm-provider-failure');
    expect(liveIds).toContain('bgm-explicit');
    expect(() => resolveLiveChatBattleScenarios(['bgm-provider-failure']))
      .toThrow('deterministic-contract only');
    expect(() => resolveLiveChatBattleScenarios(['not-a-scenario']))
      .toThrow('Unknown chat battle case');
  });

  it('pins remote battle runs to the immutable deployment identity', () => {
    expect(validateDeploymentIdentityPayload({
      commitSha: '0dce04a4df84708b0877d45d29c73171eee92e91',
      deploymentUrl: 'https://front-a1b2c3.vercel.app/',
    })).toEqual({
      commitSha: '0dce04a4df84708b0877d45d29c73171eee92e91',
      deploymentUrl: 'https://front-a1b2c3.vercel.app',
    });
  });

  it('fails closed when remote deployment identity is missing or mutable', () => {
    expect(() => validateDeploymentIdentityPayload({
      commitSha: '',
      deploymentUrl: 'https://front-a1b2c3.vercel.app',
    })).toThrow('valid commit SHA');
    expect(() => validateDeploymentIdentityPayload({
      commitSha: '0dce04a4',
      deploymentUrl: 'https://preview.example.test',
    })).toThrow('immutable HTTPS vercel.app URL');
  });

  it('requires authenticated access to every fixture source', () => {
    expect(validateAccessibleSourceProjectPayload({
      success: true,
      project: { projectId: 'proj-source' },
    }, 'proj-source')).toBeNull();
    expect(validateAccessibleSourceProjectPayload({
      success: false,
    }, 'proj-source')).toContain('cannot access fixture source');
  });

  it('requires enough credits for the requested live scenarios', () => {
    expect(validateBattleCreditPreflight({
      balance: { totalCredits: 76 },
    }, 76)).toBeNull();
    expect(validateBattleCreditPreflight({
      balance: { totalCredits: 12 },
    }, 76)).toContain('12 credits');
  });
});
