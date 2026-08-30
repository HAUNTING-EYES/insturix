import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
} from './canonical-json-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  MediaProxyMasterTranscodeDurableDispatchErrorV2,
  dispatchMediaProxyMasterTranscodeDurableJobV2,
} from './media-proxy-master-transcode-durable-dispatch-v2';
import type {
  MediaProxyMasterTranscodeDurableDispatchEnvironmentV1,
  MediaProxyMasterTranscodeQStashPublisherV1,
} from './media-proxy-master-transcode-durable-dispatch-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  createOrGetMediaProxyMasterTranscodeDurableJobV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  type MediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV2,
} from './media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2 }
  from './media-proxy-master-transcode-execution-budget-mongo-ledger-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1 }
  from './media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2,
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV2,
  type MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
} from './media-proxy-master-transcode-execution-budget-reservation-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
  type MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
} from './media-proxy-master-transcode-operational-policy-environment-v1';
import type { MediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from './media-proxy-master-transcode-operational-policy-registry-v1';
import { createMediaProxyMasterR2ProductPublicationPoliciesV2 }
  from './media-proxy-master-r2-product-publication-policy-v2';
import type { MediaProxyMasterR2PrivatePublicationPolicyV1 }
  from './media-proxy-master-r2-private-publication-policy-v1';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import {
  assertMediaProxyMasterTranscodeCommandV1,
  type MediaProxyMasterTranscodeCommandV1,
} from './media-proxy-master-trusted-transcode-v1';

type JobStoreV2 = Pick<
  DurableWorkflowJobStoreV1,
  'createOrGet' | 'recordDispatch'
>;
type DispatchV2 = typeof dispatchMediaProxyMasterTranscodeDurableJobV2;

export type MediaProxyMasterTranscodeProductAdmissionEnvironmentV2 =
  MediaSourcePtsCadenceR2RuntimeEnvironmentV1
  & MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1
  & MediaProxyMasterTranscodeDurableDispatchEnvironmentV1;

type PrivateRuntimeV2 = Readonly<{
  proxyMasterTranscodePublication: Readonly<{
    publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV1;
  }>;
}>;

type FinanceV2 = Readonly<{
  policyLocator: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV2
  >;
  ledgerOwner: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2
  >;
}>;

export type MediaProxyMasterTranscodeProductAdmissionRequestV2 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  command: MediaProxyMasterTranscodeCommandV1;
  runtimePolicy: MediaProxyMasterTranscodeDurableRuntimePolicyV1;
  authorization: MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2;
}>;

export type MediaProxyMasterTranscodeProductAdmissionResultV2 = Readonly<
  | {
      disposition: 'SCHEDULED';
      jobId: string;
      reservationId: string;
      created: boolean;
      delivery:
        | 'CONFIRMED'
        | 'ALREADY_CONFIRMED'
        | 'JOB_ALREADY_ACTIVE_OR_TERMINAL';
      messageId: string | null;
    }
  | {
      disposition: 'DELIVERY_DEFERRED';
      jobId: string;
      reservationId: string;
      created: boolean;
      reason:
        | 'DISPATCH_CONFIGURATION_UNAVAILABLE'
        | 'QSTASH_PUBLISH_REJECTED'
        | 'QSTASH_MESSAGE_ID_MISSING'
        | 'QSTASH_MESSAGE_ID_INVALID'
        | 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;

export type MediaProxyMasterTranscodeProductAdmissionDependenciesV2 = Readonly<{
  environment?: MediaProxyMasterTranscodeProductAdmissionEnvironmentV2;
  jobStore?: JobStoreV2;
  policyRegistry?: Readonly<
    MediaProxyMasterTranscodeOperationalPolicyRegistryV1
  >;
  finance?: FinanceV2;
  createPrivateRuntime?: (
    environment: MediaProxyMasterTranscodeProductAdmissionEnvironmentV2,
  ) => PrivateRuntimeV2;
  dispatch?: DispatchV2;
  publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>;
  clock?: () => Date;
}>;

/**
 * Admits the prepared-artifact V2 job from deployment-owned storage policy.
 * Creative route and transcode-policy authorship remain upstream.
 */
export async function admitMediaProxyMasterTranscodeProductV2(
  input: MediaProxyMasterTranscodeProductAdmissionRequestV2,
  dependencies: MediaProxyMasterTranscodeProductAdmissionDependenciesV2 = {},
): Promise<MediaProxyMasterTranscodeProductAdmissionResultV2> {
  const now = checkedNow(dependencies.clock ?? (() => new Date()));
  const environment = dependencies.environment ?? process.env;
  const command = assertMediaProxyMasterTranscodeCommandV1(input.command);
  const runtimePolicy =
    assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
      input.runtimePolicy,
    );
  const policyRegistry = dependencies.policyRegistry
    ?? deploymentPolicyRegistry(environment);
  assertActiveOperationalPolicies(policyRegistry, runtimePolicy);

  const privateRuntime = (dependencies.createPrivateRuntime
    ?? createMediaSourcePtsCadenceR2RuntimePortsV1)(environment);
  const { publicationPolicy, preparedArtifactPolicy } =
    createMediaProxyMasterR2ProductPublicationPoliciesV2(
      privateRuntime.proxyMasterTranscodePublication.publicationPolicy,
    );
  const finance = dependencies.finance ?? defaultFinance(now);
  const financePolicy = await resolveFinancePolicy(
    finance.policyLocator,
    input.authorization,
  );
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2(
      input.authorization,
      financePolicy,
    );
  const expectedAuthorization =
    createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2({
      policy: financePolicy,
      evidence: {
        tenantId: input.tenantId,
        userId: input.userId,
        orgId: input.orgId,
        assetId: input.assetId,
        command,
        runtimePolicy,
        publicationPolicy,
        preparedArtifactPolicy,
      },
      approvedBy: authorization.approval.approvedBy,
      approvedAt: authorization.approval.approvedAt,
      expiresAt: authorization.approval.expiresAt,
    });
  if (canonicalizeEditronJsonV1(authorization)
    !== canonicalizeEditronJsonV1(expectedAuthorization)) {
    fail('FINANCE_AUTHORIZATION_SCOPE_MISMATCH');
  }

  const reservation = await finance.ledgerOwner.reserve(authorization);
  const budgetReservation =
    mediaProxyMasterTranscodeExecutionBudgetReservationRefV2(reservation);
  const resolvedReservation = await finance.ledgerOwner.resolve(
    budgetReservation,
  );
  if (!sameBinding(financePolicy, resolvedReservation.policy)) {
    fail('FINANCE_RESERVATION_POLICY_MISMATCH');
  }

  const jobInput = assertMediaProxyMasterTranscodeDurableJobInputV2({
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
    tenantId: input.tenantId,
    userId: input.userId,
    orgId: input.orgId,
    assetId: input.assetId,
    command,
    commandSha256: command.commandSha256,
    publicationPolicy,
    preparedArtifactPolicy,
    runtimePolicy,
    budgetReservation,
  });
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2(
    authorization,
    resolvedReservation.policy,
    jobInput,
  );
  const {
    version: _version,
    commandSha256: _commandSha256,
    ...request
  } = jobInput;
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const prepared = await createOrGetMediaProxyMasterTranscodeDurableJobV2({
    jobStore,
    request,
    now,
  });

  let dispatched: Awaited<ReturnType<DispatchV2>>;
  try {
    dispatched = await (dependencies.dispatch
      ?? dispatchMediaProxyMasterTranscodeDurableJobV2)({
      request,
      jobStore,
      policyRegistry,
      env: environment,
      ...(dependencies.publisher ? { publisher: dependencies.publisher } : {}),
      now,
    });
  } catch (error) {
    if (!isDispatchConfigurationUnavailable(error)) throw error;
    return frozen({
      disposition: 'DELIVERY_DEFERRED',
      jobId: prepared.job.jobId,
      reservationId: reservation.reservationId,
      created: prepared.created,
      reason: 'DISPATCH_CONFIGURATION_UNAVAILABLE',
    });
  }
  if (dispatched.jobId !== prepared.job.jobId) {
    fail('DISPATCH_JOB_ID_MISMATCH');
  }

  switch (dispatched.state) {
    case 'dispatched':
      return frozen({
        disposition: 'SCHEDULED',
        jobId: prepared.job.jobId,
        reservationId: reservation.reservationId,
        created: prepared.created,
        delivery: 'CONFIRMED',
        messageId: dispatched.messageId,
      });
    case 'already_dispatched':
      return frozen({
        disposition: 'SCHEDULED',
        jobId: prepared.job.jobId,
        reservationId: reservation.reservationId,
        created: prepared.created,
        delivery: 'ALREADY_CONFIRMED',
        messageId: dispatched.messageId,
      });
    case 'not_dispatchable':
      return frozen({
        disposition: 'SCHEDULED',
        jobId: prepared.job.jobId,
        reservationId: reservation.reservationId,
        created: prepared.created,
        delivery: 'JOB_ALREADY_ACTIVE_OR_TERMINAL',
        messageId: null,
      });
    case 'dispatch_unconfirmed':
    case 'delivery_unknown':
      return frozen({
        disposition: 'DELIVERY_DEFERRED',
        jobId: prepared.job.jobId,
        reservationId: reservation.reservationId,
        created: prepared.created,
        reason: dispatched.reason,
      });
  }
}

function deploymentPolicyRegistry(
  environment: MediaProxyMasterTranscodeProductAdmissionEnvironmentV2,
) {
  const resolved =
    resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1(
      environment,
    );
  if (!resolved.configured) fail(`OPERATIONAL_POLICY_${resolved.reason}`);
  return resolved.registry;
}

function assertActiveOperationalPolicies(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
  runtime: MediaProxyMasterTranscodeDurableRuntimePolicyV1,
): void {
  if (!sameBinding(runtime.retryPolicy, registry.activeRetryPolicyBinding)
    || !sameBinding(
      runtime.heartbeatPolicy,
      registry.activeHeartbeatPolicyBinding,
    )
    || runtime.lifecycle.maxAttempts
      !== registry.activeRetryPolicy.durableJob.maxAttempts
    || runtime.lifecycle.retentionMs
      !== registry.activeRetryPolicy.durableJob.retentionMs) {
    fail('OPERATIONAL_POLICY_NOT_ACTIVE');
  }
  const retry = registry.resolveRetry(runtime.retryPolicy as never);
  const heartbeat = registry.resolveHeartbeat(runtime.heartbeatPolicy as never);
  if (!sameBinding(runtime.retryPolicy, retry)
    || !sameBinding(runtime.heartbeatPolicy, heartbeat)) {
    fail('OPERATIONAL_POLICY_RESOLUTION_MISMATCH');
  }
}

async function resolveFinancePolicy(
  locator: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV2>,
  authorization: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2
  >,
) {
  if (authorization.ownerId
    !== MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1) {
    fail('FINANCE_AUTHORIZATION_OWNER_INVALID');
  }
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    await locator.resolve({
      ownerId: authorization.ownerId,
      ownerVersion: authorization.ownerVersion,
      policySha256: authorization.policySha256,
    }),
  );
  if (!sameBinding(authorization, policy)) {
    fail('FINANCE_POLICY_LOOKUP_MISMATCH');
  }
  return policy;
}

function defaultFinance(now: Date): FinanceV2 {
  const policyLocator =
    createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1();
  return Object.freeze({
    policyLocator,
    ledgerOwner:
      createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2({
        ledger: createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2(),
        policyLocator,
        now: () => now.toISOString(),
      }),
  });
}

function isDispatchConfigurationUnavailable(error: unknown): boolean {
  if (!(error instanceof MediaProxyMasterTranscodeDurableDispatchErrorV2)) {
    return false;
  }
  return new Set([
    'MISSING_QSTASH_TOKEN',
    'MISSING_QSTASH_SIGNING_KEYS',
    'INVALID_QSTASH_URL',
    'MISSING_PUBLIC_ORIGIN',
    'INVALID_PUBLIC_ORIGIN',
  ]).has(error.code);
}

function sameBinding(
  left: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
  right: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): boolean {
  return left.ownerId === right.ownerId
    && left.ownerVersion === right.ownerVersion
    && left.policySha256 === right.policySha256;
}

function checkedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('CLOCK_INVALID');
  }
  return value;
}

function frozen<const T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value);
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeProductAdmissionErrorV2(code);
}

export class MediaProxyMasterTranscodeProductAdmissionErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodeProductAdmissionErrorV2';
  }
}
