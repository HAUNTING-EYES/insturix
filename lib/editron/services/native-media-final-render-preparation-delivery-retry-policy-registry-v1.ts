import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1,
  type NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
} from './native-media-final-render-preparation-delivery-retry-policy-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_V1' as const;

const SHA256 = /^[a-f0-9]{64}$/;

export type NativeMediaFinalRenderPreparationRetryPolicyBindingV1 = Readonly<{
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1;
  ownerVersion: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1;
  policySha256: string;
}>;

export type NativeMediaFinalRenderPreparationRetryPolicyRegistryManifestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_KIND_V1;
  activePolicyBinding: NativeMediaFinalRenderPreparationRetryPolicyBindingV1;
  retainedPolicyBindings: readonly NativeMediaFinalRenderPreparationRetryPolicyBindingV1[];
  registrySha256: string;
}>;

export interface NativeMediaFinalRenderPreparationRetryPolicyRegistryV1
  extends NativeMediaFinalRenderPreparationRetryPolicyRegistryManifestV1 {
  activePolicy: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1;
  resolve(
    binding: NativeMediaFinalRenderPreparationRetryPolicyBindingV1,
  ): NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1;
}

export function createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1(
  inputValue: Readonly<{
    activePolicy: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1;
    retainedPolicies: readonly NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1[];
  }>,
): Readonly<NativeMediaFinalRenderPreparationRetryPolicyRegistryV1> {
  const input = object(inputValue, 'INPUT');
  exactKeys(input, ['activePolicy', 'retainedPolicies'], 'INPUT');
  if (!Array.isArray(input.retainedPolicies)) fail('RETAINED_POLICIES_INVALID');

  const activePolicy = assertPolicy(input.activePolicy);
  const retainedPolicies = input.retainedPolicies.map(assertPolicy);
  const policies = [activePolicy, ...retainedPolicies];
  const policiesByBinding = new Map<
    string,
    NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1
  >();
  for (const policy of policies) {
    const key = bindingKey(bindingFromPolicy(policy));
    if (policiesByBinding.has(key)) fail('POLICY_BINDING_DUPLICATE');
    policiesByBinding.set(key, policy);
  }

  const activePolicyBinding = bindingFromPolicy(activePolicy);
  const retainedPolicyBindings = retainedPolicies
    .map(bindingFromPolicy)
    .sort(compareBindings);
  const material = deepFreezeEditronJsonV1({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_KIND_V1,
    activePolicyBinding,
    retainedPolicyBindings,
  });
  const manifest = deepFreezeEditronJsonV1({
    ...material,
    registrySha256: hashEditronCanonicalJsonV1(material),
  });

  return Object.freeze({
    ...manifest,
    activePolicy,
    resolve(bindingValue: NativeMediaFinalRenderPreparationRetryPolicyBindingV1) {
      const binding = assertBinding(bindingValue);
      const policy = policiesByBinding.get(bindingKey(binding));
      if (!policy) fail('POLICY_NOT_FOUND');
      return policy;
    },
  });
}

function assertPolicy(
  value: unknown,
): NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 {
  try {
    return assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1(value);
  } catch {
    fail('POLICY_INVALID');
  }
}

function bindingFromPolicy(
  policy: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
): NativeMediaFinalRenderPreparationRetryPolicyBindingV1 {
  return deepFreezeEditronJsonV1({
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
  });
}

function assertBinding(
  value: unknown,
): NativeMediaFinalRenderPreparationRetryPolicyBindingV1 {
  const binding = object(value, 'BINDING');
  exactKeys(binding, ['ownerId', 'ownerVersion', 'policySha256'], 'BINDING');
  if (binding.ownerId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1
    || binding.ownerVersion
      !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1) {
    fail('BINDING_IDENTITY_INVALID');
  }
  if (typeof binding.policySha256 !== 'string' || !SHA256.test(binding.policySha256)) {
    fail('BINDING_POLICY_SHA256_INVALID');
  }
  return deepFreezeEditronJsonV1({
    ownerId: binding.ownerId,
    ownerVersion: binding.ownerVersion,
    policySha256: binding.policySha256,
  });
}

function bindingKey(binding: NativeMediaFinalRenderPreparationRetryPolicyBindingV1): string {
  return `${binding.ownerId}\u0000${binding.ownerVersion}\u0000${binding.policySha256}`;
}

function compareBindings(
  left: NativeMediaFinalRenderPreparationRetryPolicyBindingV1,
  right: NativeMediaFinalRenderPreparationRetryPolicyBindingV1,
): number {
  const leftKey = bindingKey(left);
  const rightKey = bindingKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
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

function fail(label: string): never {
  throw new Error(
    `NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_REGISTRY_${label}`,
  );
}
