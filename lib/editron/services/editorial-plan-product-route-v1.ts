import type { ProjectService } from './project-service';
import type { ProviderNativeProductBudgetCreditsOwnerV2R }
  from './provider-native-product-budget-credits-owner-v2r';
import type { ProviderNativeProductCustomerChargeOwnerV2R }
  from './provider-native-product-customer-charge-v2r';
import {
  createProviderNativeProductCustomerChargeOwnerV2R,
} from './provider-native-product-customer-pricing-v2r';
import {
  createProviderNativeProductCustomerPricingMongoLocatorV2R,
} from './provider-native-product-customer-pricing-mongo-v2r';
import {
  createProviderNativeProductExecutionRootV2R,
} from './provider-native-product-execution-root-v2r';
import {
  createAuthenticatedEditorialPlanProductWorkerV1,
} from './editorial-plan-product-worker-v1';
import {
  resolveProviderNativeCredentialsV2R,
} from '../research/open-ended-planner/provider-native-live-transport-v2r';

export const EDITORIAL_PLAN_PRODUCT_STORAGE_READ_TIMEOUT_ENV_V1 =
  'EDITRON_PROVIDER_NATIVE_STORAGE_READ_TIMEOUT_MS' as const;

type ProductExecutionRootFactoryV2R =
  typeof createProviderNativeProductExecutionRootV2R;
type ProductWorkerHandlerV1 = ReturnType<
  typeof createAuthenticatedEditorialPlanProductWorkerV1
>;

/**
 * Composes the signed Plan worker without performing store, storage, wallet or
 * provider I/O. Invalid deployment configuration still returns the signed
 * worker boundary, but with no execution owners so no job can be claimed.
 */
export function createEditorialPlanProductRouteV1(input: Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  projectService?: Pick<ProjectService, 'loadProjectForMutation'>;
  budgetOwner?: Readonly<ProviderNativeProductBudgetCreditsOwnerV2R>;
  customerChargeOwner?: Readonly<ProviderNativeProductCustomerChargeOwnerV2R>;
  createExecutionRoot?: ProductExecutionRootFactoryV2R;
  reportConfigurationFailure?: (code: string) => void;
}> = {}): ProductWorkerHandlerV1 {
  const environment = input.environment ?? process.env;
  try {
    const storageReadTimeoutMs = requiredMilliseconds(
      environment[EDITORIAL_PLAN_PRODUCT_STORAGE_READ_TIMEOUT_ENV_V1],
      EDITORIAL_PLAN_PRODUCT_STORAGE_READ_TIMEOUT_ENV_V1,
      1_000,
      300_000,
    );
    // This route advertises all three exact product routes. Refuse to claim a
    // job unless both provider families are deployably configured.
    resolveProviderNativeCredentialsV2R(environment);
    const budgetOwner = input.budgetOwner
      ?? lazyCreditsServiceBudgetOwner();
    const customerChargeOwner = input.customerChargeOwner
      ?? createProviderNativeProductCustomerChargeOwnerV2R({
        policyLocator:
          createProviderNativeProductCustomerPricingMongoLocatorV2R(),
      });
    const root = (input.createExecutionRoot
      ?? createProviderNativeProductExecutionRootV2R)({
      projectService: input.projectService ?? lazyProjectServicePort(),
      budgetOwner,
      customerChargeOwner,
      canonicalMedia: { storageReadTimeoutMs },
      provider: { environment },
    });
    return createAuthenticatedEditorialPlanProductWorkerV1({
      executionOwner: root.executionOwner,
      terminalSettlementOwner: root.terminalSettlementOwner,
    });
  } catch (error) {
    const code = boundedConfigurationCode(error);
    (input.reportConfigurationFailure ?? reportConfigurationFailure)(code);
    return createAuthenticatedEditorialPlanProductWorkerV1({});
  }
}

function lazyCreditsServiceBudgetOwner(): Readonly<
  ProviderNativeProductBudgetCreditsOwnerV2R
> {
  let ownerPromise: Promise<
    Readonly<ProviderNativeProductBudgetCreditsOwnerV2R>
  > | null = null;
  const owner = () => {
    ownerPromise ??= import('@/lib/services/creditsService').then(
      ({ CreditsService }) => (
        CreditsService.createProviderNativeProductBudgetOwnerV2R()
      ),
    );
    return ownerPromise;
  };
  return {
    reserve: async (request) => (await owner()).reserve(request),
    settle: async (request) => (await owner()).settle(request),
    resolve: async (request) => (await owner()).resolve(request),
    resolveTerminal: async (request) => (
      (await owner()).resolveTerminal(request)
    ),
  };
}

function lazyProjectServicePort(): Pick<
  ProjectService,
  'loadProjectForMutation'
> {
  return {
    loadProjectForMutation: async (userId, projectId) => {
      const { projectService } = await import('./project-service');
      return projectService.loadProjectForMutation(userId, projectId);
    },
  };
}

function requiredMilliseconds(
  raw: string | undefined,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const value = raw?.trim();
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${label}_INVALID`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label}_INVALID`);
  }
  return parsed;
}

function boundedConfigurationCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Z0-9_:,-]{1,240}$/.test(message)
    ? message
    : 'EDITORIAL_PLAN_PRODUCT_ROUTE_CONFIGURATION_INVALID';
}

function reportConfigurationFailure(code: string): void {
  console.error(`[EditorialPlanProductRoute] configuration rejected: ${code}`);
}
