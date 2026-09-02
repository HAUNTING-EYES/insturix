import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_ID_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_ID_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_VERSION_V1,
  assertMediaProxyMasterTranscodeHeartbeatPolicyV1,
  assertMediaProxyMasterTranscodeRetryPolicyV1,
  type MediaProxyMasterTranscodeHeartbeatPolicyV1,
  type MediaProxyMasterTranscodeRetryPolicyV1,
} from './media-proxy-master-transcode-operational-policy-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_V1' as const;

const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodeRetryPolicyBindingV1 = Readonly<{
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_ID_V1;
  ownerVersion: typeof MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_VERSION_V1;
  policySha256: string;
}>;

export type MediaProxyMasterTranscodeHeartbeatPolicyBindingV1 = Readonly<{
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_ID_V1;
  ownerVersion: typeof MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_VERSION_V1;
  policySha256: string;
}>;

export type MediaProxyMasterTranscodeOperationalPolicyRegistryManifestV1 =
Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_KIND_V1;
  activeRetryPolicyBinding: MediaProxyMasterTranscodeRetryPolicyBindingV1;
  activeHeartbeatPolicyBinding: MediaProxyMasterTranscodeHeartbeatPolicyBindingV1;
  retainedRetryPolicyBindings:
    readonly MediaProxyMasterTranscodeRetryPolicyBindingV1[];
  retainedHeartbeatPolicyBindings:
    readonly MediaProxyMasterTranscodeHeartbeatPolicyBindingV1[];
  registrySha256: string;
}>;

export interface MediaProxyMasterTranscodeOperationalPolicyRegistryV1
  extends MediaProxyMasterTranscodeOperationalPolicyRegistryManifestV1 {
  activeRetryPolicy: MediaProxyMasterTranscodeRetryPolicyV1;
  activeHeartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  resolveRetry(
    binding: MediaProxyMasterTranscodeRetryPolicyBindingV1,
  ): MediaProxyMasterTranscodeRetryPolicyV1;
  resolveHeartbeat(
    binding: MediaProxyMasterTranscodeHeartbeatPolicyBindingV1,
  ): MediaProxyMasterTranscodeHeartbeatPolicyV1;
}

export function createMediaProxyMasterTranscodeOperationalPolicyRegistryV1(
  inputValue: Readonly<{
    activeRetryPolicy: MediaProxyMasterTranscodeRetryPolicyV1;
    activeHeartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
    retainedRetryPolicies: readonly MediaProxyMasterTranscodeRetryPolicyV1[];
    retainedHeartbeatPolicies:
      readonly MediaProxyMasterTranscodeHeartbeatPolicyV1[];
  }>,
): Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1> {
  const input = object(inputValue, 'INPUT');
  exactKeys(input, [
    'activeHeartbeatPolicy', 'activeRetryPolicy',
    'retainedHeartbeatPolicies', 'retainedRetryPolicies',
  ], 'INPUT');
  if (!Array.isArray(input.retainedRetryPolicies)) {
    fail('RETAINED_RETRY_POLICIES_INVALID');
  }
  if (!Array.isArray(input.retainedHeartbeatPolicies)) {
    fail('RETAINED_HEARTBEAT_POLICIES_INVALID');
  }

  const activeRetryPolicy = assertRetryPolicy(input.activeRetryPolicy);
  const activeHeartbeatPolicy = assertHeartbeatPolicy(
    input.activeHeartbeatPolicy,
  );
  const retainedRetryPolicies = input.retainedRetryPolicies.map(
    assertRetryPolicy,
  );
  const retainedHeartbeatPolicies = input.retainedHeartbeatPolicies.map(
    assertHeartbeatPolicy,
  );
  const retryPolicies = policyMap(
    [activeRetryPolicy, ...retainedRetryPolicies],
    retryBindingFromPolicy,
    'RETRY',
  );
  const heartbeatPolicies = policyMap(
    [activeHeartbeatPolicy, ...retainedHeartbeatPolicies],
    heartbeatBindingFromPolicy,
    'HEARTBEAT',
  );

  const activeRetryPolicyBinding = retryBindingFromPolicy(activeRetryPolicy);
  const activeHeartbeatPolicyBinding = heartbeatBindingFromPolicy(
    activeHeartbeatPolicy,
  );
  const retainedRetryPolicyBindings = retainedRetryPolicies
    .map(retryBindingFromPolicy)
    .sort(compareBindings);
  const retainedHeartbeatPolicyBindings = retainedHeartbeatPolicies
    .map(heartbeatBindingFromPolicy)
    .sort(compareBindings);
  const material = deepFreezeEditronJsonV1({
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_KIND_V1,
    activeRetryPolicyBinding,
    activeHeartbeatPolicyBinding,
    retainedRetryPolicyBindings,
    retainedHeartbeatPolicyBindings,
  });
  const manifest = deepFreezeEditronJsonV1({
    ...material,
    registrySha256: hashEditronCanonicalJsonV1(material),
  });

  return Object.freeze({
    ...manifest,
    activeRetryPolicy,
    activeHeartbeatPolicy,
    resolveRetry(bindingValue: MediaProxyMasterTranscodeRetryPolicyBindingV1) {
      const binding = assertRetryBinding(bindingValue);
      const policy = retryPolicies.get(bindingKey(binding));
      if (!policy) fail('RETRY_POLICY_NOT_FOUND');
      return policy;
    },
    resolveHeartbeat(
      bindingValue: MediaProxyMasterTranscodeHeartbeatPolicyBindingV1,
    ) {
      const binding = assertHeartbeatBinding(bindingValue);
      const policy = heartbeatPolicies.get(bindingKey(binding));
      if (!policy) fail('HEARTBEAT_POLICY_NOT_FOUND');
      return policy;
    },
  });
}

function policyMap<T>(
  policies: readonly T[],
  bindingFromPolicy: (policy: T) => Readonly<{
    ownerId: string;
    ownerVersion: string;
    policySha256: string;
  }>,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const policy of policies) {
    const key = bindingKey(bindingFromPolicy(policy));
    if (result.has(key)) fail(`${label}_POLICY_BINDING_DUPLICATE`);
    result.set(key, policy);
  }
  return result;
}

function assertRetryPolicy(value: unknown): MediaProxyMasterTranscodeRetryPolicyV1 {
  try {
    return assertMediaProxyMasterTranscodeRetryPolicyV1(value);
  } catch {
    fail('RETRY_POLICY_INVALID');
  }
}

function assertHeartbeatPolicy(
  value: unknown,
): MediaProxyMasterTranscodeHeartbeatPolicyV1 {
  try {
    return assertMediaProxyMasterTranscodeHeartbeatPolicyV1(value);
  } catch {
    fail('HEARTBEAT_POLICY_INVALID');
  }
}

function retryBindingFromPolicy(
  policy: MediaProxyMasterTranscodeRetryPolicyV1,
): MediaProxyMasterTranscodeRetryPolicyBindingV1 {
  return deepFreezeEditronJsonV1({
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
  });
}

function heartbeatBindingFromPolicy(
  policy: MediaProxyMasterTranscodeHeartbeatPolicyV1,
): MediaProxyMasterTranscodeHeartbeatPolicyBindingV1 {
  return deepFreezeEditronJsonV1({
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
  });
}

function assertRetryBinding(
  value: unknown,
): MediaProxyMasterTranscodeRetryPolicyBindingV1 {
  const binding = bindingRecord(value, 'RETRY');
  if (binding.ownerId !== MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_ID_V1
    || binding.ownerVersion
      !== MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_VERSION_V1) {
    fail('RETRY_BINDING_IDENTITY_INVALID');
  }
  return deepFreezeEditronJsonV1({
    ownerId: binding.ownerId,
    ownerVersion: binding.ownerVersion,
    policySha256: sha256(binding.policySha256, 'RETRY_BINDING'),
  });
}

function assertHeartbeatBinding(
  value: unknown,
): MediaProxyMasterTranscodeHeartbeatPolicyBindingV1 {
  const binding = bindingRecord(value, 'HEARTBEAT');
  if (binding.ownerId
      !== MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_ID_V1
    || binding.ownerVersion
      !== MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_VERSION_V1) {
    fail('HEARTBEAT_BINDING_IDENTITY_INVALID');
  }
  return deepFreezeEditronJsonV1({
    ownerId: binding.ownerId,
    ownerVersion: binding.ownerVersion,
    policySha256: sha256(binding.policySha256, 'HEARTBEAT_BINDING'),
  });
}

function bindingRecord(value: unknown, label: string): Record<string, unknown> {
  const binding = object(value, `${label}_BINDING`);
  exactKeys(binding, ['ownerId', 'ownerVersion', 'policySha256'],
    `${label}_BINDING`);
  return binding;
}

function bindingKey(binding: Readonly<{
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
}>): string {
  return `${binding.ownerId}\u0000${binding.ownerVersion}\u0000${binding.policySha256}`;
}

function compareBindings(
  left: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
  right: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): number {
  const leftKey = bindingKey(left);
  const rightKey = bindingKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_INVALID`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    fail(`${label}_FIELDS_INVALID`);
  }
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${label}_SHA256_INVALID`);
  }
  return value;
}

function fail(label: string): never {
  throw new Error(
    `MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_${label}`,
  );
}
