import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { auditSealedHoldoutPilotLiveArtifactsV4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-audit-v4r3';
import { SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-authorization-v4r3';
import { runSealedHoldoutPilotLiveOperatorV4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-operator-v4r3';

const ENVIRONMENT = { OPENAI_API_KEY: 'openai-test-secret',
  GOOGLE_GENERATIVE_AI_API_KEY: 'google-test-secret' } as const;
const NOW = new Date('2026-08-24T12:00:00.000Z');

describe('sealed holdout V4R3 post-run audit', () => {
  it('independently validates a complete run and rejects a tampered attempt', async () => {
    const source = testRoot('source'); const tampered = testRoot('tampered');
    await Promise.all([rm(source, { recursive: true, force: true }),
      rm(tampered, { recursive: true, force: true })]);
    await runSealedHoldoutPilotLiveOperatorV4R3({
      outputRoot: source, operatorId: 'admin',
      executeConfirmation: SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
      environment: ENVIRONMENT, now: () => NOW, fetchImpl: providerFetch(),
    });
    await cp(source, tampered, { recursive: true, errorOnExist: true });
    const audit = await auditSealedHoldoutPilotLiveArtifactsV4R3({
      runRoot: source, environment: ENVIRONMENT, now: () => NOW,
    });
    expect(audit).toMatchObject({
      validRawAttemptCount: 3, providerInfrastructureNonEvaluationCount: 0,
      terminalCounts: { CAPABILITY_GAP: 3 }, networkCallsDuringAudit: 0,
      modelQualityScoreAuthorized: false, fullCohortDispatchAuthorized: false,
      assessment: 'PASS_VALID_NON_SCORED_PILOT_EVIDENCE_NO_MODEL_RANKING',
    });
    const completed = path.join(tampered, 'attempts',
      'PILOT-001-HOLD-08_C2-OPENAI_LUNA.completed.json');
    const forged = JSON.parse(await readFile(completed, 'utf8')) as Record<string, unknown>;
    (forged.portResult as Record<string, unknown>).responseSha256 = 'f'.repeat(64);
    await writeFile(completed, `${JSON.stringify(forged, null, 2)}\n`, 'utf8');
    await expect(auditSealedHoldoutPilotLiveArtifactsV4R3({
      runRoot: tampered, environment: ENVIRONMENT, now: () => NOW,
    })).rejects.toThrow('SEALED_V4R3_PILOT_AUDIT');
    await Promise.all([rm(source, { recursive: true, force: true }),
      rm(tampered, { recursive: true, force: true })]);
  }, 120_000);
});

function testRoot(label: string): string {
  return path.join(process.cwd(), '.calibration-temp', 'editron-v4r3-pilot',
    `audit-test-${label}-${process.pid}`);
}
function providerFetch(): typeof fetch {
  let calls = 0;
  return vi.fn(async (request, init) => {
    if (!init?.body) {
      const model = decodeURIComponent(String(request).split('/').at(-1) ?? '');
      return new Response(JSON.stringify(String(request).includes('googleapis.com')
        ? { name: `models/${model}` } : { id: model }), { status: 200 });
    }
    calls += 1;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const model = String(body.model); const openai = String(request).includes('openai.com');
    const args = { disposition: 'CAPABILITY_GAP',
      reasonCodes: ['TRACKED_FINE_CONTOUR_MATTE_MISSING'], evidenceIds: [],
      summary: 'Unsupported without a tracked matte.' };
    const usage = openai
      ? { input_tokens: 1_000, output_tokens: 20, total_tokens: 1_020,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 } }
      : { total_input_tokens: 1_000, total_cached_tokens: 0,
          total_output_tokens: 20, total_thought_tokens: 0, total_tokens: 1_020 };
    return new Response(JSON.stringify(openai
      ? { id: `response-${calls}`, model, status: 'completed', output: [{
          type: 'function_call', call_id: `call-${calls}`,
          name: 'finish_editron_research_episode', arguments: JSON.stringify(args) }], usage }
      : { id: `interaction-${calls}`, model, status: 'completed', steps: [{
          type: 'function_call', id: `call-${calls}`,
          name: 'finish_editron_research_episode', arguments: args }], usage }), { status: 200 });
  }) as unknown as typeof fetch;
}
