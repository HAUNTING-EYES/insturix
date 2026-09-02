import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-authorization-v4r3';
import {
  runSealedHoldoutPilotLiveOperatorV4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-operator-v4r3';

const NOW = new Date('2026-08-24T12:00:00.000Z');

describe('sealed holdout V4R3 live pilot operator', () => {
  it('writes one immutable intent and completed audit per healthy route', async () => {
    const outputRoot = testOutputRoot('success');
    await rm(outputRoot, { recursive: true, force: true });
    const network: string[] = [];
    const receipt = await runSealedHoldoutPilotLiveOperatorV4R3({
      outputRoot, operatorId: 'admin',
      executeConfirmation: SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
      environment: { OPENAI_API_KEY: 'openai-test-secret',
        GOOGLE_GENERATIVE_AI_API_KEY: 'google-test-secret' },
      now: () => NOW, fetchImpl: providerFetch(network),
    });
    expect(network).toHaveLength(6);
    expect(receipt).toMatchObject({
      providerInferenceCalls: 3,
      networkCalls: { modelMetadataGets: 3, inferenceCalls: 3 },
      maximumAttemptsPerRow: 1, automaticRetry: false, scoredRowsExecuted: 0,
      projectReads: 0, projectMutations: 0, mediaWrites: 0,
      assessment: 'PILOT_EXECUTED_NOT_SCORED_POST_RUN_AUDIT_REQUIRED',
    });
    expect(receipt.attemptIntentSha256s).toHaveLength(3);
    expect(receipt.completedAttemptSha256s).toHaveLength(3);
    const stored = await readFile(path.join(outputRoot, 'operator-receipt.json'), 'utf8');
    expect(stored).not.toContain('openai-test-secret');
    expect(stored).not.toContain('google-test-secret');
    await expect(runSealedHoldoutPilotLiveOperatorV4R3({
      outputRoot, operatorId: 'admin',
      executeConfirmation: SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
      environment: { OPENAI_API_KEY: 'unused', GOOGLE_GENERATIVE_AI_API_KEY: 'unused' },
      fetchImpl: providerFetch([]),
    })).rejects.toThrow();
    await rm(outputRoot, { recursive: true, force: true });
  }, 120_000);

  it('records one write-ahead intent and never retries a failed inference', async () => {
    const outputRoot = testOutputRoot('failure');
    await rm(outputRoot, { recursive: true, force: true });
    let inferenceCalls = 0;
    const fetchImpl = vi.fn(async (request, init) => {
      if (!init?.body) return metadataResponse(String(request));
      inferenceCalls += 1;
      return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 429 });
    }) as unknown as typeof fetch;
    await expect(runSealedHoldoutPilotLiveOperatorV4R3({
      outputRoot, operatorId: 'admin',
      executeConfirmation: SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
      environment: { OPENAI_API_KEY: 'openai-test-secret',
        GOOGLE_GENERATIVE_AI_API_KEY: 'google-test-secret' },
      now: () => NOW, fetchImpl,
    })).rejects.toThrow();
    expect(inferenceCalls).toBe(1);
    const attemptFiles = await import('node:fs/promises').then(({ readdir }) =>
      readdir(path.join(outputRoot, 'attempts')));
    expect(attemptFiles.filter((file) => file.endsWith('.intent.json'))).toHaveLength(1);
    expect(attemptFiles.filter((file) => file.endsWith('.completed.json'))).toHaveLength(0);
    expect(await readFile(path.join(outputRoot, 'pilot-failure.json'), 'utf8'))
      .not.toContain('openai-test-secret');
    await rm(outputRoot, { recursive: true, force: true });
  }, 120_000);
});

function testOutputRoot(label: string): string {
  return path.join(process.cwd(), '.calibration-temp', 'editron-v4r3-pilot',
    `operator-test-${label}-${process.pid}`);
}
function providerFetch(network: string[]): typeof fetch {
  return vi.fn(async (request, init) => {
    network.push(String(request));
    if (!init?.body) return metadataResponse(String(request));
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const model = String(body.model);
    const args = { disposition: 'CAPABILITY_GAP',
      reasonCodes: ['TRACKED_FINE_CONTOUR_MATTE_MISSING'], evidenceIds: [],
      summary: 'The requested selective grade is unsupported without a tracked matte.' };
    const openai = String(request).includes('openai.com');
    const usage = openai
      ? { input_tokens: 1_000, output_tokens: 20, total_tokens: 1_020,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 } }
      : { total_input_tokens: 1_000, total_cached_tokens: 0,
          total_output_tokens: 20, total_thought_tokens: 0, total_tokens: 1_020 };
    const response = openai
      ? { id: `response-${network.length}`, model, status: 'completed',
          output: [{ type: 'function_call', call_id: `call-${network.length}`,
            name: 'finish_editron_research_episode', arguments: JSON.stringify(args) }], usage }
      : { id: `interaction-${network.length}`, model, status: 'completed',
          steps: [{ type: 'function_call', id: `call-${network.length}`,
            name: 'finish_editron_research_episode', arguments: args }], usage };
    return new Response(JSON.stringify(response), { status: 200 });
  }) as unknown as typeof fetch;
}
function metadataResponse(endpoint: string): Response {
  const model = decodeURIComponent(endpoint.split('/').at(-1) ?? '');
  return new Response(JSON.stringify(endpoint.includes('googleapis.com')
    ? { name: `models/${model}` } : { id: model }), { status: 200 });
}
