import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';

type JsonRecord = Record<string, unknown>;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve('tsx/cli');
const CHILD = path.join(process.cwd(), 'tests/editron/helpers/',
  'provider-native-separate-process-worker-v2r.ts');
const roots: string[] = [];

describe('provider-native durable separate-process recovery V2R', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })));
  });

  it('resumes only the captured Luna suffix after an actual process exit', async () => {
    const fixture = await makePaths();
    await child('prepare', fixture.state);
    await child('resume', fixture.state, fixture.result);

    const result = await readJson(fixture.result);
    expect(result).toMatchObject({
      version: 'EDITRON_PROVIDER_NATIVE_SEPARATE_PROCESS_RESULT_V2R_1',
      authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION',
      processes: { separateOperatingSystemProcesses: true },
      replay: {
        prefixProviderCalls: 4,
        suffixCapturedResponseCalls: 4,
        paidInferenceCalls: 0,
        prefixMutationsReplayed: false,
        finalProjectRevision: 'R45',
        finalOwnerStateSha256:
          'a3b2f2ec50dc905c68006bd58b9a3d0ce564eab98f01928cfcb9ffc9693b414e',
      },
      durable: {
        workerResultKind: 'completed',
        disposition: 'UNVERIFIABLE',
        persistedStatus: 'completed',
        persistedResumeSequence: 4,
      },
      whatHasNotBeenChecked: [
        'LIVE_ATLAS', 'QSTASH_DELIVERY', 'AUTHENTICATED_INGRESS',
        'REAL_PROJECTSERVICE_CLONE', 'PAID_PROVIDER_RESUME', 'RENDERED_ACCEPTANCE',
      ],
      stateEffects: [],
    });
    const processes = result.processes as JsonRecord;
    expect(processes.preparePid).not.toBe(process.pid);
    expect(processes.resumePid).not.toBe(process.pid);
    expect(processes.preparePid).not.toBe(processes.resumePid);
    expectHash(result, 'receiptSha256');
  }, 120_000);

  it('rejects a re-enveloped but forged owner snapshot before suffix execution', async () => {
    const fixture = await makePaths();
    await child('prepare', fixture.state);
    const state = await readJson(fixture.state);
    const owner = state.ownerSnapshot as JsonRecord;
    const project = owner.currentProject as JsonRecord;
    const overlay = (project.overlays as JsonRecord[])
      .find(({ id }) => id === 42) as JsonRecord;
    overlay.styles = { opacity: 0.25 };
    const material = { ...state };
    delete material.envelopeSha256;
    state.envelopeSha256 = hashCanonicalJsonV1(material);
    await fs.writeFile(fixture.state, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    await expect(child('resume', fixture.state, fixture.result))
      .rejects.toMatchObject({ stderr: expect.stringContaining(
        'STAGE25_DEPENDENCY_OWNER_RESTORE_SNAPSHOT_HASH_MISMATCH',
      ) });
    await expect(fs.stat(fixture.result)).rejects.toThrow();
  }, 120_000);
});

async function makePaths() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-separate-process-'));
  roots.push(root);
  return { state: path.join(root, 'state.json'), result: path.join(root, 'result.json') };
}

async function child(mode: 'prepare' | 'resume', state: string, result?: string) {
  return execFileAsync(process.execPath, [TSX_CLI, CHILD, mode, state,
    ...(result ? [result] : [])], {
    cwd: process.cwd(), windowsHide: true, timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function readJson(filePath: string): Promise<JsonRecord> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as JsonRecord;
}

function expectHash(value: JsonRecord, field: string): void {
  const actual = value[field];
  const material = { ...value };
  delete material[field];
  expect(actual).toBe(hashCanonicalJsonV1(material));
}
