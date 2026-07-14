import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  battleContractInvocation,
  battlePhase0Invocation,
  battlePhase0OutputRoot,
  isProductionMgRenderJobForProject,
  resolveBattleUploadBatchId,
  parseBattleCliArgs,
  validateOptions,
} from '../../scripts/run-editron-battle-test';

describe('run-editron-battle-test cli', () => {
  let fixtureDir: string;
  let authPath: string;
  let intakePath: string;
  let videoPath: string;
  let imagePath: string;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'editron-battle-cli-'));
    authPath = path.join(fixtureDir, 'auth.json');
    intakePath = path.join(fixtureDir, 'intake.json');
    videoPath = path.join(fixtureDir, 'clip.mp4');
    imagePath = path.join(fixtureDir, 'still.png');
    await Promise.all([
      writeFile(authPath, JSON.stringify({ cookie: 'session=test' })),
      writeFile(intakePath, JSON.stringify({ durationPreference: { mode: 'auto' } })),
      writeFile(videoPath, 'fixture'),
      writeFile(imagePath, 'fixture'),
    ]);
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('keeps an existing-project audit read-only while enabling contracts and rendered truth', () => {
    const options = parseBattleCliArgs([
      '--project=proj_test',
      '--scenario=mixed',
      '--expected-source-seconds=29',
      '--run-id=fixture-run',
    ], {});

    expect(options).toMatchObject({
      projectId: 'proj_test',
      scenario: 'mixed',
      expectedSourceDurationSec: 29,
      runId: 'fixture-run',
      allowLiveWrite: false,
      runContracts: true,
      render: true,
    });
    expect(options && validateOptions(options)).toBeNull();
  });

  it('audits an existing batch without write permission when durable API access is present', () => {
    const options = parseBattleCliArgs([
      '--batch=upload_batch_test',
      '--base-url=https://preview.example.test/',
      `--auth-header-file=${authPath}`,
      '--metadata-only',
    ], {});

    expect(options).toMatchObject({
      uploadBatchId: 'upload_batch_test',
      baseUrl: 'https://preview.example.test',
      allowLiveWrite: false,
      render: false,
    });
    expect(options && validateOptions(options)).toBeNull();
  });

  it('requires durable API access for batch resolution', () => {
    const options = parseBattleCliArgs(['--batch=upload_batch_test'], {});

    expect(options && validateOptions(options)).toContain('requires --base-url and --auth-header-file');
  });

  it('rejects fresh uploads unless mutation is explicitly authorized', () => {
    const options = parseBattleCliArgs([
      `--file=${videoPath}`,
      '--base-url=https://preview.example.test',
      `--auth-header-file=${authPath}`,
    ], {});

    expect(options && validateOptions(options)).toBe('Fresh files require --allow-live-write.');
  });

  it('accepts mixed fresh fixtures and intake only with explicit live-write permission', () => {
    const options = parseBattleCliArgs([
      `--file=${videoPath}`,
      `--file=${imagePath}`,
      `--intake=${intakePath}`,
      '--scenario=hinglish',
      '--allow-live-write',
      '--base-url=https://preview.example.test',
      `--auth-header-file=${authPath}`,
      '--skip-contract-tests',
    ], {});

    expect(options).toMatchObject({
      files: [videoPath, imagePath],
      intakePath,
      scenario: 'hinglish',
      allowLiveWrite: true,
      runContracts: false,
    });
    expect(options && validateOptions(options)).toBeNull();
  });

  it('rejects ambiguous source modes and unknown scenarios', () => {
    const ambiguous = parseBattleCliArgs([
      '--project=proj_test',
      '--batch=upload_batch_test',
    ], {});
    const unsupported = parseBattleCliArgs([
      '--project=proj_test',
      '--scenario=talking-head-template',
    ], {});

    expect(ambiguous && validateOptions(ambiguous)).toContain('exactly one source');
    expect(unsupported && validateOptions(unsupported)).toContain('Unsupported scenario');
  });

  it('uses shell-free Node entrypoints for Vitest and Phase 0 on Windows', () => {
    const contracts = battleContractInvocation('C:\\node\\node.exe');
    const phase0 = battlePhase0Invocation(
      'proj_test',
      'D:\\battle output',
      'truth',
      true,
      false,
      'C:\\node\\node.exe',
    );

    expect(contracts.command).toBe('C:\\node\\node.exe');
    expect(contracts.args[0]).toMatch(/node_modules[\\/]vitest[\\/]vitest\.mjs$/);
    expect(contracts.args).toContain('run');
    expect(battlePhase0OutputRoot('fixture', 'D:\\repo')).toBe(path.resolve('D:\\repo', '.calibration-temp', 'phase0-fixtures', 'editron-battle', 'fixture'));
    expect(phase0).toEqual({
      command: 'C:\\node\\node.exe',
      args: [
        '--import',
        'tsx',
        'scripts/build-editron-phase0-fixture.ts',
        'proj_test',
        'D:\\battle output',
        '--run-id=truth',
        '--keep-runs=3',
        '--render',
      ],
    });
  });

  it('excludes ad-hoc smoke jobs from project lifecycle truth', () => {
    expect(isProductionMgRenderJobForProject({
      projectId: 'proj_test',
      request: { input: { momentId: 'proj_test:120:candidate_1' } },
    }, 'proj_test')).toBe(true);
    expect(isProductionMgRenderJobForProject({
      projectId: 'proj_test',
      request: { input: { momentId: 'mg-live-smoke-proj_test' } },
    }, 'proj_test')).toBe(false);
    expect(isProductionMgRenderJobForProject({
      projectId: 'proj_other',
      request: { input: { momentId: 'proj_other:120:candidate_1' } },
    }, 'proj_test')).toBe(false);
  });

  it('resolves persisted batch evidence for existing batch-origin projects', () => {
    expect(resolveBattleUploadBatchId({ sourceUploadBatchId: 'upload_batch_source' })).toBe('upload_batch_source');
    expect(resolveBattleUploadBatchId({ uploadBatchId: 'upload_batch_legacy' })).toBe('upload_batch_legacy');
    expect(resolveBattleUploadBatchId({ sourceUploadBatchId: 'upload_batch_source' }, 'upload_batch_explicit')).toBe('upload_batch_explicit');
    expect(resolveBattleUploadBatchId({})).toBeUndefined();
  });
});
