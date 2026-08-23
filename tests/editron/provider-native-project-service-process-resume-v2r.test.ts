import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
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
  'provider-native-project-service-process-worker-v2r.ts');
const roots: string[] = [];

describe('ProjectService proposal recovery across real OS processes V2R', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })));
  });

  it('replays only the committed writer prefix and executes only the suffix', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-project-recovery-'));
    roots.push(root);
    const statePath = path.join(root, 'state.json');
    const resultPath = path.join(root, 'result.json');
    await child('prepare', statePath);
    await child('resume', statePath, resultPath);
    const result = JSON.parse(await fs.readFile(resultPath, 'utf8')) as JsonRecord;

    expect(result).toMatchObject({
      version: 'EDITRON_PROJECTSERVICE_PROCESS_RECOVERY_RESULT_V2R_1',
      processes: { separateOperatingSystemProcesses: true },
      execution: { prefixProviderCalls: 2, suffixProviderCalls: 2,
        prefixWriterReplays: 1, suffixWriterExecutions: 1, paidInferenceCalls: 0 },
      proposal: { canonicalUnchanged: true, recoveredWriterCount: 2,
        finalWorkingRevision: 'local-r44',
        proposalReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      durable: { status: 'completed', resumeSequence: 2,
        disposition: 'UNVERIFIABLE' },
      whatHasNotBeenChecked: ['LIVE_ATLAS', 'QSTASH_DELIVERY', 'AUTHENTICATED_INGRESS',
        'PAID_PROVIDER_RESUME', 'RENDERED_ACCEPTANCE'],
    });
    const processes = result.processes as JsonRecord;
    expect(processes.preparePid).not.toBe(processes.resumePid);
    const proposal = result.proposal as JsonRecord;
    expect(proposal.canonicalStateSha256After).toBe(proposal.canonicalStateSha256Before);
    const { receiptSha256, ...material } = result;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(material));
  }, 120_000);
});

async function child(mode: 'prepare' | 'resume', state: string, result?: string) {
  return execFileAsync(process.execPath, [TSX_CLI, CHILD, mode, state,
    ...(result ? [result] : [])], { cwd: process.cwd(), windowsHide: true,
    timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
}
