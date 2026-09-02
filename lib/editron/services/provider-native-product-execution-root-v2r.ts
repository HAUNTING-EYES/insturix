import {
  createProviderNativeCanonicalMediaReferenceOwnerV2R,
} from './provider-native-canonical-media-reference-owner-v2r';
import {
  createProviderNativeCanonicalMediaProductPortsV2R,
} from './provider-native-canonical-media-product-ports-v2r';
import {
  createProviderNativeProductBudgetRuntimeGuardOwnerV2R,
} from './provider-native-product-budget-owner-v2r';
import type { ProviderNativeProductBudgetCreditsOwnerV2R }
  from './provider-native-product-budget-credits-owner-v2r';
import type { ProviderNativeProductCustomerChargeOwnerV2R }
  from './provider-native-product-customer-charge-v2r';
import {
  createProviderNativeGoogleInputTokenCounterV2R,
} from './provider-native-google-token-counter-v2r';
import {
  createProviderNativeOpenAiInputTokenCounterV2R,
} from './provider-native-openai-token-counter-v2r';
import {
  createProviderNativeProductRuntimeGuardFactoryV2R,
  type ProviderNativeProductInputTokenCounterV2R,
} from './provider-native-product-runtime-guard-v2r';
import {
  PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
} from './provider-native-product-budget-v2r';
import {
  createProviderNativeProductTerminalSettlementOwnerV2R,
} from './provider-native-product-terminal-settlement-v2r';
import type {
  EditorialPlanDurableExecutionOwnerV1,
  EditorialPlanDurableTerminalSettlementOwnerV1,
} from './editorial-plan-durable-worker-v1';
import type { ProjectService } from './project-service';
import {
  createProviderNativePlanDefinitionBoundExecutionOwnerV2R,
  type ProviderNativePlanSharedArtifactOwnersV2R,
} from '../research/open-ended-planner/provider-native-plan-definition-bound-execution-owner-v2r';
import {
  assertProviderNativeDurableRouteV2R,
  createProviderNativeDurableLiveTransportOwnerV2R,
  resolveProviderNativeRouteCredentialV2R,
} from '../research/open-ended-planner/provider-native-live-transport-v2r';
import type { ProviderNativePlanExecutionEnvelopeV2R }
  from '../research/open-ended-planner/provider-native-plan-execution-envelope-v2r';
import type { ProviderNativeRouteV2R }
  from '../research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  createProviderNativeProjectServiceCloneOwnerV2R,
} from '../research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import {
  createProviderNativeProjectServiceCutProofOwnerV2R,
} from '../research/open-ended-planner/provider-native-project-service-cut-proof-owner-v2r';
import {
  createProviderNativeProjectServiceOperatorDispatcherV2R,
  PROVIDER_NATIVE_PROJECT_SERVICE_OPERATOR_IDS_V2R,
} from '../research/open-ended-planner/provider-native-project-service-operator-dispatcher-v2r';

type CanonicalMediaOptions = Parameters<
  typeof createProviderNativeCanonicalMediaProductPortsV2R
>[0];
type CutProofOptions = NonNullable<Parameters<
  typeof createProviderNativeProjectServiceCutProofOwnerV2R
>[0]>;

export interface ProviderNativeProductExecutionRootV2R {
  authority: 'PRODUCT_COMPOSITION_NO_CANONICAL_PROJECT_MUTATION';
  supportedOperatorIds:
    typeof PROVIDER_NATIVE_PROJECT_SERVICE_OPERATOR_IDS_V2R;
  executionOwner: Readonly<EditorialPlanDurableExecutionOwnerV1>;
  terminalSettlementOwner:
    Readonly<EditorialPlanDurableTerminalSettlementOwnerV1>;
}

/**
 * Composes existing product owners behind the Plan-bound episode boundary.
 * The caller supplies the CreditsService-owned wallet contract and customer
 * pricing owner; this root owns no wallet, project, media, proof or plan state.
 */
export function createProviderNativeProductExecutionRootV2R(input: Readonly<{
  projectService: Pick<ProjectService, 'loadProjectForMutation'>;
  budgetOwner: Readonly<ProviderNativeProductBudgetCreditsOwnerV2R>;
  customerChargeOwner: Readonly<ProviderNativeProductCustomerChargeOwnerV2R>;
  canonicalMedia: CanonicalMediaOptions;
  provider: Readonly<{
    environment: Readonly<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
    transportTimeoutMs?: number;
    tokenCountTimeoutMilliseconds?: number;
  }>;
  proof?: CutProofOptions;
  now?: () => string;
}>): Readonly<ProviderNativeProductExecutionRootV2R> {
  const mediaPorts = createProviderNativeCanonicalMediaProductPortsV2R(
    input.canonicalMedia,
  );
  const transport = createProviderNativeDurableLiveTransportOwnerV2R({
    environment: input.provider.environment,
    ...(input.provider.fetchImpl ? { fetchImpl: input.provider.fetchImpl } : {}),
    ...(input.provider.transportTimeoutMs !== undefined
      ? { timeoutMs: input.provider.transportTimeoutMs } : {}),
  });
  const counters = createRouteTokenCounters(input.provider);
  const projectClone = createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: input.projectService,
    isolatedOperatorOwner:
      createProviderNativeProjectServiceOperatorDispatcherV2R(),
    isolatedOutcomeProofOwner:
      createProviderNativeProjectServiceCutProofOwnerV2R(input.proof),
  });

  const executionOwner = createProviderNativePlanDefinitionBoundExecutionOwnerV2R({
    artifactOwnersForDefinition: (envelope) => {
      assertProductEnvelope(envelope);
      return artifactOwnersForEnvelope({
        envelope,
        projectClone,
        transport,
        mediaPorts,
        budgetOwner: input.budgetOwner,
        tokenCounter: envelope.route.provider === 'openai'
          ? counters.openai : counters.google,
        now: input.now,
      });
    },
  });
  const terminalSettlementOwner =
    createProviderNativeProductTerminalSettlementOwnerV2R({
      budgetOwner: input.budgetOwner,
      customerChargeOwner: input.customerChargeOwner,
    });

  return Object.freeze({
    authority: 'PRODUCT_COMPOSITION_NO_CANONICAL_PROJECT_MUTATION' as const,
    supportedOperatorIds: PROVIDER_NATIVE_PROJECT_SERVICE_OPERATOR_IDS_V2R,
    executionOwner,
    terminalSettlementOwner,
  });
}

function artifactOwnersForEnvelope(input: Readonly<{
  envelope: Readonly<ProviderNativePlanExecutionEnvelopeV2R>;
  projectClone: ProviderNativePlanSharedArtifactOwnersV2R['projectClone'];
  transport: ProviderNativePlanSharedArtifactOwnersV2R['transport'];
  mediaPorts: ReturnType<typeof createProviderNativeCanonicalMediaProductPortsV2R>;
  budgetOwner: Readonly<ProviderNativeProductBudgetCreditsOwnerV2R>;
  tokenCounter: Readonly<ProviderNativeProductInputTokenCounterV2R>;
  now?: () => string;
}>): ProviderNativePlanSharedArtifactOwnersV2R {
  return {
    projectClone: input.projectClone,
    transport: input.transport,
    reference: createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: input.envelope.route,
      ...input.mediaPorts,
    }),
    runtimeGuard: createProviderNativeProductBudgetRuntimeGuardOwnerV2R({
      locator: input.budgetOwner,
      factory: createProviderNativeProductRuntimeGuardFactoryV2R({
        tokenCounter: input.tokenCounter,
      }),
      ...(input.now ? { now: input.now } : {}),
    }),
  };
}

function createRouteTokenCounters(input: Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  tokenCountTimeoutMilliseconds?: number;
}>): Readonly<{
  openai: Readonly<ProviderNativeProductInputTokenCounterV2R>;
  google: Readonly<ProviderNativeProductInputTokenCounterV2R>;
}> {
  const credentialOwner = Object.freeze({
    credentialFor: (route: Readonly<ProviderNativeRouteV2R>) => (
      resolveProviderNativeRouteCredentialV2R(route.provider, input.environment)
    ),
  });
  const options = {
    credentialOwner,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.tokenCountTimeoutMilliseconds !== undefined
      ? { timeoutMilliseconds: input.tokenCountTimeoutMilliseconds } : {}),
  };
  return Object.freeze({
    openai: createProviderNativeOpenAiInputTokenCounterV2R(options),
    google: createProviderNativeGoogleInputTokenCounterV2R(options),
  });
}

function assertProductEnvelope(
  envelope: Readonly<ProviderNativePlanExecutionEnvelopeV2R>,
): void {
  assertProviderNativeDurableRouteV2R(envelope.route);
  if (envelope.runtimeGuardBinding.guardKind
    !== PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R) {
    throw new Error('PROVIDER_NATIVE_PRODUCT_ROOT_GUARD_KIND_UNSUPPORTED');
  }
  const supported = new Set<string>(
    PROVIDER_NATIVE_PROJECT_SERVICE_OPERATOR_IDS_V2R,
  );
  const unsupported = envelope.boundEpisodeDefinition.definition
    .eligibleOperatorIds.filter((operatorId) => !supported.has(operatorId));
  if (unsupported.length) {
    throw new Error(
      `PROVIDER_NATIVE_PRODUCT_ROOT_OPERATOR_UNSUPPORTED:${unsupported.join(',')}`,
    );
  }
}
