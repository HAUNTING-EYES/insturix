import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
} from './canonical-json-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  MediaProxyMasterTranscodeDurableDispatchErrorV1,
  dispatchMediaProxyMasterTranscodeDurableJobV1,
  type MediaProxyMasterTranscodeDurableDispatchEnvironmentV1,
  type MediaProxyMasterTranscodeQStashPublisherV1,
} from './media-proxy-master-transcode-durable-dispatch-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
  assertMediaProxyMasterTranscodeDurableJobInputV1,
  assertMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
  type MediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1,
} from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1 }
  from './media-proxy-master-transcode-execution-budget-mongo-ledger-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1 }
  from './media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1,
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV1,
  type MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
} from './media-proxy-master-transcode-execution-budget-reservation-v1';
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
import { assertMediaProxyMasterR2PrivatePublicationPolicyV1,
  type MediaProxyMasterR2PrivatePublicationPolicyV1 }
  from './media-proxy-master-r2-private-publication-policy-v1';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import {
  assertMediaProxyMasterTranscodeCommandV1,
  type MediaProxyMasterTranscodeCommandV1,
} from './media-proxy-master-trusted-transcode-v1';

type JobStoreV1 = Pick<
  DurableWorkflowJobStoreV1,
  'createOrGet' | 'recordDispatch'
>;
type DispatchV1 = typeof dispatchMediaProxyMasterTranscodeDurableJobV1;

export type MediaProxyMasterTranscodeProductAdmissionEnvironmentV1 =
  MediaSourcePtsCadenceR2RuntimeEnvironmentV1
  & MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1
  & MediaProxyMasterTranscodeDurableDispatchEnvironmentV1;

type PrivateRuntimeV1 = Readonly<{
  proxyMasterTranscodePublication: Readonly<{
    publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV1;
  }>;
}>;

type FinanceV1 = Readonly<{
  policyLocator: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1
  >;
  ledgerOwner: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1
  >;
}>;

export type MediaProxyMasterTranscodeProductAdmissionRequestV1 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  command: MediaProxyMasterTranscodeCommandV1;
  runtimePolicy: MediaProxyMasterTranscodeDurableRuntimePolicyV1;
  authorization: MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1;
}>;

export type MediaProxyMasterTranscodeProductAdmissionResultV1 = Readonly<
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

export type MediaProxyMasterTranscodeProductAdmissionDependenciesV1 = Readonly<{
  environment?: MediaProxyMasterTranscodeProductAdmissionEnvironmentV1;
  jobStore?: JobStoreV1;
  policyRegistry?: Readonly<
    MediaProxyMasterTranscodeOperationalPolicyRegistryV1
  >;
  finance?: FinanceV1;
  createPrivateRuntime?: (
    environment: MediaProxyMasterTranscodeProductAdmissionEnvironmentV1,
  ) => PrivateRuntimeV1;
  dispatch?: DispatchV1;
  publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>;
  clock?: () => Date;
}>;

/**
 * Admits a Finance-authorized proxy command before signed durable delivery.
 * Creative route selection and transcode-policy authorship remain upstream.
 */
export async function admitMediaProxyMasterTranscodeProductV1(
  input: MediaProxyMasterTranscodeProductAdmissionRequestV1,
  dependencies: MediaProxyMasterTranscodeProductAdmissionDependenciesV1 = {},
): Promise<MediaProxyMasterTranscodeProductAdmissionResultV1> {
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
  const publicationPolicy =
    assertMediaProxyMasterR2PrivatePublicationPolicyV1(
      privateRuntime.proxyMasterTranscodePublication.publicationPolicy,
    );
  const finance = dependencies.finance ?? defaultFinance(now);
  const financePolicy = await resolveFinancePolicy(
    finance.policyLocator,
    input.authorization,
  );
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
      input.authorization,
      financePolicy,
    );
  const expectedAuthorization =
    createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1({
      policy: financePolicy,
      evidence: {
        tenantId: input.tenantId,
        userId: input.userId,
        orgId: input.orgId,
        assetId: input.assetId,
        command,
        runtimePolicy,
        publicationPolicy,
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
    mediaProxyMasterTranscodeExecutionBudgetReservationRefV1(reservation);
  const resolvedReservation = await finance.ledgerOwner.resolve(
    budgetReservation,
  );
  if (!sameBinding(financePolicy, resolvedReservation.policy)) {
    fail('FINANCE_RESERVATION_POLICY_MISMATCH');
  }

  const jobInput = assertMediaProxyMasterTranscodeDurableJobInputV1({
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
    tenantId: input.tenantId,
    userId: input.userId,
    orgId: input.orgId,
    assetId: input.assetId,
    command,
    commandSha256: command.commandSha256,
    publicationPolicy,
    runtimePolicy,
    budgetReservation,
  });
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1(
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
  const prepared = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
    jobStore,
    request,
    now,
  });

  let dispatched: Awaited<ReturnType<DispatchV1>>;
  try {
    dispatched = await (dependencies.dispatch
      ?? dispatchMediaProxyMasterTranscodeDurableJobV1)({
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
  environment: MediaProxyMasterTranscodeProductAdmissionEnvironmentV1,
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
  locator: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyLocatorV1>,
  authorization: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1
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

function defaultFinance(now: Date): FinanceV1 {
  const policyLocator =
    createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1();
  return Object.freeze({
    policyLocator,
    ledgerOwner:
      createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1({
        ledger: createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1(),
        policyLocator,
        now: () => now.toISOString(),
      }),
  });
}

function isDispatchConfigurationUnavailable(error: unknown): boolean {
  if (!(error instanceof MediaProxyMasterTranscodeDurableDispatchErrorV1)) {
    return false;
  }
  return new Set([
    'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_MISSING_QSTASH_TOKEN',
    'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
    'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_INVALID_QSTASH_URL',
    'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_MISSING_PUBLIC_ORIGIN',
    'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_INVALID_PUBLIC_ORIGIN',
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
  throw new MediaProxyMasterTranscodeProductAdmissionErrorV1(code);
}

export class MediaProxyMasterTranscodeProductAdmissionErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_${code}`);
    this.name = 'MediaProxyMasterTranscodeProductAdmissionErrorV1';
  }
}
