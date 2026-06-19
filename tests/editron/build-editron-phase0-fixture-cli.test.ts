import { describe, expect, it } from 'vitest';

import { parseCliArgs } from '../../scripts/build-editron-phase0-fixture';

describe('build-editron-phase0-fixture cli', () => {
  it('uses environment defaults while keeping render opt-in', () => {
    const options = parseCliArgs(['proj_123'], {
      EDITRON_PHASE0_FIXTURE_DIR: '.calibration-temp/phase0-fixtures',
      EDITRON_PHASE0_RUN_ID: 'run-from-env',
      EDITRON_PHASE0_KEEP_RUNS: '7',
    });

    expect(options).toEqual({
      projectId: 'proj_123',
      outputRoot: '.calibration-temp/phase0-fixtures',
      runId: 'run-from-env',
      keepRuns: 7,
      render: false,
    });
  });

  it('parses output root, run id, pruning, and rendered-evidence capture', () => {
    const options = parseCliArgs([
      'proj_123',
      '.calibration-temp/custom-phase0',
      '--render',
      '--run-id=20260619T010203004Z',
      '--keep-runs=2',
    ], {});

    expect(options).toEqual({
      projectId: 'proj_123',
      outputRoot: '.calibration-temp/custom-phase0',
      runId: '20260619T010203004Z',
      keepRuns: 2,
      render: true,
    });
  });

  it('does not treat flags as positional output directories', () => {
    const options = parseCliArgs(['proj_123', '--render'], {
      EDITRON_PHASE0_FIXTURE_DIR: '.calibration-temp/phase0-fixtures',
    });

    expect(options).toMatchObject({
      projectId: 'proj_123',
      outputRoot: '.calibration-temp/phase0-fixtures',
      render: true,
    });
  });

  it('rejects unknown flags and extra positional arguments', () => {
    expect(parseCliArgs(['proj_123', '--wat'], {})).toBeNull();
    expect(parseCliArgs(['proj_123', 'out-a', 'out-b'], {})).toBeNull();
  });
});
