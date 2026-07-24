import { describe, expect, it } from 'vitest';

import {
  parseSuiteArgs,
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
      '--cases=motivated-zoom,vague-sfx-beat',
    ])).toMatchObject({
      baseUrl: 'https://preview.example.test',
      authHeaderFile: 'C:\\tmp\\editron-auth.json',
      environmentFile: '.calibration-temp/vercel-preview.env',
      scenarioIds: ['motivated-zoom', 'vague-sfx-beat'],
    });
  });
});
