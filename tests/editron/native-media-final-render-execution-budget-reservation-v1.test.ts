import { describe, expect, it } from 'vitest';

import { createNativeMediaFinalRenderExecutionBudgetPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-policy-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  assertNativeMediaFinalRenderExecutionBudgetReservationV1,
  createNativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  createNativeMediaFinalRenderExecutionBudgetReservationV1,
  nativeMediaFinalRenderExecutionBudgetReservationRefV1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-reservation-v1';

const HASH = (character: string) => character.repeat(64);

describe('native final-render execution-budget authorization and reservation v1', () => {
  it('binds exact scope, maximum metered cost and a durable job reservation ref', () => {
    const fixture = build();
    expect(fixture.authorization).toMatchObject({
      authority: 'FINANCE_POLICY_BOUND_EXACT_RENDER_EXECUTION_AUTHORIZATION',
      maximumUsage: {
        encodedFrameAttempts: '300',
        artifactBytesWritten: '1000',
        artifactBytesVerified: '1000',
      },
      maximumCostNanoUsd: '750',
    });
    expect(fixture.reservation).toMatchObject({
      authority: 'EXACT_RENDER_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE',
      status: 'RESERVED',
      reservedNanoUsd: '750',
    });
    expect(nativeMediaFinalRenderExecutionBudgetReservationRefV1(
      fixture.reservation,
    )).toEqual({
      reservationId: 'nmfr_budget_1',
      bindingSha256: fixture.reservation.reservationSha256,
    });
  });

  it('is key-order independent and changes identity for source or revision drift', () => {
    const fixture = build();
    const reordered = authorization({
      exactSourceRequestSha256: HASH('3'),
      admissionReceiptSha256: HASH('2'),
      projectRevisionSha256: HASH('1'),
      sequenceId: 'main', projectId: 'project-a', orgId: null,
      userId: 'user-a', tenantId: 'tenant-a',
    });
    const changed = authorization({ ...scope(), projectRevisionSha256: HASH('9') });
    expect(reordered).toEqual(fixture.authorization);
    expect(changed.authorizationSha256).not.toBe(
      fixture.authorization.authorizationSha256,
    );
  });

  it('rejects forged and extra authorization or reservation fields', () => {
    const fixture = build();
    expect(() => assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
      ...fixture.authorization,
      authorizationSha256: HASH('9'),
    }, fixture.policy)).toThrow('EXECUTION_BUDGET_AUTHORIZATION_INVALID');
    expect(() => assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
      ...fixture.authorization,
      extra: true,
    }, fixture.policy)).toThrow('EXECUTION_BUDGET_AUTHORIZATION_INVALID');
    expect(() => assertNativeMediaFinalRenderExecutionBudgetReservationV1({
      ...fixture.reservation,
      reservedNanoUsd: '1',
    }, fixture.authorization, fixture.policy)).toThrow(
      'EXECUTION_BUDGET_RESERVATION_INVALID',
    );
  });

  it('rejects a foreign Finance policy even when the shape is otherwise valid', () => {
    const fixture = build();
    const foreign = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
      ...policyInput(), ownerVersion: 'finance-render-v2',
    });
    expect(() => assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1(
      fixture.authorization,
      foreign,
    )).toThrow('EXECUTION_BUDGET_AUTHORIZATION_INVALID');
  });

  it.each([
    ['approval before policy', {
      approvedAt: '2026-08-29T23:59:59.000Z',
    }],
    ['approval beyond policy', {
      expiresAt: '2026-09-01T00:00:01.000Z',
    }],
    ['empty maximum usage', {
      maximumUsage: {
        encodedFrameAttempts: '0', artifactBytesWritten: '0',
        artifactBytesVerified: '0',
      },
    }],
    ['extra usage field', {
      maximumUsage: {
        encodedFrameAttempts: '300', artifactBytesWritten: '1000',
        artifactBytesVerified: '1000', extra: 'unsafe',
      },
    }],
  ])('fails closed for %s', (_label, override) => {
    expect(() => createNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
      ...authorizationInput(), ...override,
    } as never)).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_');
  });

  it('rejects reservation outside the exact approval window', () => {
    const fixture = build();
    expect(() => createNativeMediaFinalRenderExecutionBudgetReservationV1({
      policy: fixture.policy,
      authorization: fixture.authorization,
      reservationId: 'nmfr_budget_late',
      reservedAt: fixture.authorization.approval.expiresAt,
    })).toThrow('EXECUTION_BUDGET_RESERVATION_TIME_INVALID');
  });
});

function build() {
  const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput());
  const authorization = createNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
    ...authorizationInput(), policy,
  });
  const reservation = createNativeMediaFinalRenderExecutionBudgetReservationV1({
    policy, authorization, reservationId: 'nmfr_budget_1',
    reservedAt: '2026-08-30T00:10:00.000Z',
  });
  return { policy, authorization, reservation };
}

function authorization(scopeInput = scope()) {
  const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput());
  return createNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
    ...authorizationInput(), policy, scope: scopeInput,
  });
}

function authorizationInput() {
  return {
    policy: createNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput()),
    scope: scope(),
    maximumUsage: {
      encodedFrameAttempts: '300',
      artifactBytesWritten: '1000',
      artifactBytesVerified: '1000',
    },
    approvedBy: 'finance-admin',
    approvedAt: '2026-08-30T00:05:00.000Z',
    expiresAt: '2026-08-30T01:00:00.000Z',
  };
}

function scope() {
  return {
    tenantId: 'tenant-a', userId: 'user-a', orgId: null,
    projectId: 'project-a', sequenceId: 'main',
    projectRevisionSha256: HASH('1'),
    admissionReceiptSha256: HASH('2'),
    exactSourceRequestSha256: HASH('3'),
  };
}

function policyInput() {
  return {
    ownerVersion: 'finance-render-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    encodedFrameAttempt: { nanoUsdNumerator: '3', unitsDenominator: '2' },
    artifactByteWritten: { nanoUsdNumerator: '1', unitsDenominator: '10' },
    artifactByteVerified: { nanoUsdNumerator: '2', unitsDenominator: '10' },
  };
}
