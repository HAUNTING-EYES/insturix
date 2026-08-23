import type { ProviderNativeDurableRuntimeGuardOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-owner-artifact-resolver-v2r';
import type { ProviderNativeRuntimeGuardV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import {
  assertProviderNativeProductBudgetAuthorizationV2R,
  assertProviderNativeProductBudgetReservationV2R,
  PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
  type ProviderNativeProductBudgetAuthorizationV2R,
  type ProviderNativeProductBudgetReservationV2R,
  type ProviderNativeProductBudgetScopeV2R,
} from './provider-native-product-budget-v2r';

export interface ProviderNativeProductBudgetReservationLocatorV2R {
  resolve(input: Readonly<{
    scope: Readonly<ProviderNativeProductBudgetScopeV2R>;
    guardKind: typeof PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R;
    expectedGuardIdentitySha256: string;
  }>): Promise<Readonly<{
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
    reservation: Readonly<ProviderNativeProductBudgetReservationV2R>;
  }>>;
}

export interface ProviderNativeProductRuntimeGuardFactoryV2R {
  create(input: Readonly<{
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
    reservation: Readonly<ProviderNativeProductBudgetReservationV2R>;
  }>): Promise<Readonly<{
    guardKind: typeof PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R;
    guardIdentitySha256: string;
    authorizationSha256: string;
    reservationSha256: string;
    runtimeGuard: Readonly<ProviderNativeRuntimeGuardV2R>;
  }>>;
}

/**
 * Resolves the existing provider runtime-guard port only after an exact
 * CreditsService-owned reservation exists. The injected factory owns runtime
 * accounting; this adapter owns no pricing formula, wallet state or job state.
 */
export function createProviderNativeProductBudgetRuntimeGuardOwnerV2R(
  input: Readonly<{
    locator: Readonly<ProviderNativeProductBudgetReservationLocatorV2R>;
    factory: Readonly<ProviderNativeProductRuntimeGuardFactoryV2R>;
    now?: () => string;
  }>,
): Readonly<ProviderNativeDurableRuntimeGuardOwnerV2R> {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    resolve: async (request) => {
      if (request.guardKind !== PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R) {
        throw new Error('PRODUCT_BUDGET_GUARD_KIND_MISMATCH');
      }
      const scope = {
        tenantId: request.tenantId,
        userId: request.userId,
        projectId: request.projectId,
        episodeId: request.episodeId,
      };
      const located = await input.locator.resolve({
        scope,
        guardKind: PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
        expectedGuardIdentitySha256: request.expectedGuardIdentitySha256,
      });
      const authorization = assertProviderNativeProductBudgetAuthorizationV2R(
        located.authorization,
      );
      const reservation = assertProviderNativeProductBudgetReservationV2R(
        located.reservation,
        authorization,
      );
      if (!sameScope(scope, authorization.scope)
        || !sameScope(scope, reservation.scope)) {
        throw new Error('PRODUCT_BUDGET_GUARD_SCOPE_MISMATCH');
      }
      if (reservation.guardIdentitySha256 !== request.expectedGuardIdentitySha256
        || reservation.guardKind !== request.guardKind) {
        throw new Error('PRODUCT_BUDGET_GUARD_IDENTITY_MISMATCH');
      }
      const resolvedNow = Date.parse(now());
      if (!Number.isFinite(resolvedNow)
        || resolvedNow >= Date.parse(reservation.expiresAt)) {
        throw new Error('PRODUCT_BUDGET_RESERVATION_EXPIRED');
      }
      const created = await input.factory.create({ authorization, reservation });
      if (created.guardKind !== reservation.guardKind
        || created.guardIdentitySha256 !== reservation.guardIdentitySha256
        || created.authorizationSha256 !== authorization.authorizationSha256
        || created.reservationSha256 !== reservation.reservationSha256) {
        throw new Error('PRODUCT_BUDGET_RUNTIME_GUARD_FACTORY_MISMATCH');
      }
      return created.runtimeGuard;
    },
  };
}

function sameScope(
  left: Readonly<ProviderNativeProductBudgetScopeV2R>,
  right: Readonly<ProviderNativeProductBudgetScopeV2R>,
): boolean {
  return left.tenantId === right.tenantId
    && left.userId === right.userId
    && left.projectId === right.projectId
    && left.episodeId === right.episodeId;
}
