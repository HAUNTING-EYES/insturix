import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { hashDurableWorkflowJobJsonV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';

type JsonRecord = Record<string, unknown>;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve('tsx/cli');
const CHILD = path.join(process.cwd(), 'tests/editron/helpers/',
  'editorial-plan-durable-separate-process-worker-v1.ts');
const roots: string[] = [];

describe('editorial plan durable job separate-process recovery', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })));
  });

  it('reclaims and revalidates the product binding after an actual process exit', async () => {
    const fixture = await makePaths();
    await child('prepare', fixture.state);
    await child('resume', fixture.state, fixture.result);

    const result = await readJson(fixture.result);
    expect(result).toMatchObject({
      version: 'EDITRON_EDITORIAL_PLAN_SEPARATE_PROCESS_RESULT_V1_1',
      authority: 'ZERO_INFERENCE_NO_PROJECT_MUTATION',
      processes: { separateOperatingSystemProcesses: true },
      recovery: {
        attemptCount: 2,
        nodeId: 'root',
        definitionId: 'definition-root-v1',
        oldLeaseRejected: true,
        duplicateDeliveryDisposition: 'lease_held',
      },
      providerInferenceCalls: 0,
      projectServiceReads: 0,
      stateEffects: [],
      whatHasNotBeenChecked: [
        'LIVE_ATLAS', 'QSTASH_DELIVERY', 'AUTHENTICATED_INGRESS',
        'PROJECTSERVICE_CLONE_OR_MUTATION', 'PROVIDER_INFERENCE',
      ],
    });
    const processes = result.processes as JsonRecord;
    expect(processes.preparePid).not.toBe(process.pid);
    expect(processes.resumePid).not.toBe(process.pid);
    expect(processes.preparePid).not.toBe(processes.resumePid);
    expect((result.recovery as JsonRecord).planRevisionSha256)
      .toMatch(/^[a-f0-9]{64}$/);
    expectHash(result, 'receiptSha256');
  }, 120_000);

  it('rejects a tampered serialization envelope before hydration', async () => {
    const fixture = await makePaths();
    await child('prepare', fixture.state);
    const state = await readJson(fixture.state);
    const identity = state.identity as JsonRecord;
    identity.definitionId = 'forged-definition';
    await writeJson(fixture.state, state);

    await expect(child('resume', fixture.state, fixture.result))
      .rejects.toMatchObject({ stderr: expect.stringContaining(
        'EDITORIAL_PLAN_SEPARATE_PROCESS_STATE_INVALID',
      ) });
    await expect(fs.stat(fixture.result)).rejects.toThrow();
  }, 120_000);

  it('rejects a re-enveloped inner job forgery through the product resolver', async () => {
    const fixture = await makePaths();
    await child('prepare', fixture.state);
    const state = await readJson(fixture.state);
    const records = state.records as JsonRecord;
    const jobs = records.jobs as JsonRecord[];
    const job = jobs[0];
    const input = job.input as JsonRecord;
    const payload = input.payload as JsonRecord;
    job.projectId = 'project-forged';
    payload.projectId = 'project-forged';
    input.bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
    const material = { ...state };
    delete material.envelopeSha256;
    state.envelopeSha256 = hashEditronCanonicalJsonV1(material);
    await writeJson(fixture.state, state);

    await expect(child('resume', fixture.state, fixture.result))
      .rejects.toMatchObject({ stderr: expect.stringContaining(
        'PLAN_JOB_RESOLUTION_PLAN_NOT_FOUND',
      ) });
    await expect(fs.stat(fixture.result)).rejects.toThrow();
  }, 120_000);
});

async function makePaths() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-product-process-'));
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
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function expectHash(value: JsonRecord, field: string): void {
  const actual = value[field];
  const material = { ...value };
  delete material[field];
  expect(actual).toBe(hashEditronCanonicalJsonV1(material));
}
