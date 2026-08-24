import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
  assertSealedHoldoutPilotAuthorizationV4R3,
  issueSealedHoldoutPilotAuthorizationV4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-authorization-v4r3';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutGeneralisationManifestV4R2,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2';
import {
  buildSealedHoldoutGeneralisationManifestV4R3,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3';
import { issueSealedHoldoutNoSpendReadinessV4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r3';
import { preflightSealedHoldoutRouteHealthV4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-route-health-v4r3';

const APPROVED_AT = '2026-08-24T12:01:00.000Z';
const EXPIRES_AT = '2026-08-24T12:04:00.000Z';

describe('sealed holdout V4R3 pilot authorization', () => {
  it('authorizes exactly one non-scored row per currently healthy route', async () => {
    const context = await fixture();
    const authorization = await issueSealedHoldoutPilotAuthorizationV4R3({
      ...context, approval: approval(context), now: APPROVED_AT,
    });
    expect(authorization.authorizedRows).toHaveLength(3);
    expect(authorization.authorizedRows.map(({ routeId }) => routeId)).toEqual([
      'OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH',
    ]);
    expect(authorization.limits).toEqual({
      maximumProviderInferenceCalls: 3, maximumAttemptsPerRow: 1,
      automaticRetry: false, absoluteMaxSpendMicroUsd: 3_000_000,
    });
    expect(authorization.authorizedRows.reduce(
      (sum, row) => sum + row.absoluteMaxRowSpendMicroUsd, 0,
    )).toBe(3_000_000);
    expect(await assertSealedHoldoutPilotAuthorizationV4R3({
      ...context, authorization, now: APPROVED_AT,
    })).toEqual(authorization);
  });

  it('omits an unhealthy route instead of substituting or retrying it', async () => {
    const context = await fixture(429);
    const authorization = await issueSealedHoldoutPilotAuthorizationV4R3({
      ...context, approval: approval(context), now: APPROVED_AT,
    });
    expect(authorization.authorizedRows.map(({ routeId }) => routeId)).toEqual([
      'OPENAI_LUNA', 'OPENAI_TERRA',
    ]);
    expect(authorization.limits.maximumProviderInferenceCalls).toBe(2);
  });

  it('rejects stale health, wrong confirmation, and a self-rehashed row substitution', async () => {
    const context = await fixture();
    await expect(issueSealedHoldoutPilotAuthorizationV4R3({
      ...context, approval: approval(context), now: '2026-08-24T12:05:00.000Z',
    })).rejects.toThrow('SEALED_V4R3_ROUTE_HEALTH_RECEIPT_EXPIRED');
    await expect(issueSealedHoldoutPilotAuthorizationV4R3({
      ...context, approval: { ...approval(context), executeConfirmation: 'WRONG' as
        typeof SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3 }, now: APPROVED_AT,
    })).rejects.toThrow('SEALED_V4R3_PILOT_AUTH_APPROVAL_INVALID');

    const authorization = await issueSealedHoldoutPilotAuthorizationV4R3({
      ...context, approval: approval(context), now: APPROVED_AT,
    });
    const forged = structuredClone(authorization) as unknown as Record<string, unknown>;
    const rows = forged.authorizedRows as Array<Record<string, unknown>>;
    rows[0].routeId = 'GOOGLE_FLASH';
    const { authorizationSha256: _ignored, ...material } = forged;
    forged.authorizationSha256 = hashCanonicalJsonV1(material);
    await expect(assertSealedHoldoutPilotAuthorizationV4R3({
      ...context, authorization: forged, now: APPROVED_AT,
    })).rejects.toThrow('SEALED_V4R3_PILOT_AUTH_AUTHORIZATION_INVALID');
  });
});

async function fixture(googleStatus = 200) {
  const baseManifest = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const predecessorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
    baseManifest,
  });
  const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
    baseManifest, predecessorManifest,
  });
  const readiness = await issueSealedHoldoutNoSpendReadinessV4R3({
    manifest, baseManifest, predecessorManifest,
  });
  const routeHealth = await preflightSealedHoldoutRouteHealthV4R3({
    manifest, baseManifest, predecessorManifest,
    environment: { OPENAI_API_KEY: 'openai-test', GOOGLE_GENERATIVE_AI_API_KEY: 'google-test' },
    now: () => new Date('2026-08-24T12:00:00.000Z'),
    fetchImpl: providerFetch(googleStatus),
  });
  return { manifest, baseManifest, predecessorManifest, readiness, routeHealth };
}
function approval(context: Awaited<ReturnType<typeof fixture>>) {
  return { operatorId: 'admin', approvedAt: APPROVED_AT, expiresAt: EXPIRES_AT,
    confirmedManifestSha256: context.manifest.manifestSha256,
    confirmedReadinessReceiptSha256: context.readiness.receiptSha256,
    confirmedRouteHealthReceiptSha256: context.routeHealth.receiptSha256,
    confirmedPilotRowSetSha256: context.manifest.pilotRowSetSha256,
    executeConfirmation: SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
    confirmedMaxSpendUsd: '3.000000' as const };
}
function providerFetch(googleStatus: number): typeof fetch {
  return vi.fn(async (input) => {
    const model = decodeURIComponent(String(input).split('/').at(-1) ?? '');
    const google = model.startsWith('gemini-');
    return new Response(JSON.stringify(google
      ? { name: `models/${model}` } : { id: model }), { status: google ? googleStatus : 200 });
  }) as unknown as typeof fetch;
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
