import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNTIME_POLICY_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNTIME_POLICY_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_V1' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type NativeMediaFinalRenderPreparationPolicyOwnerBindingV1 = Readonly<{
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
}>;

export type NativeMediaFinalRenderPreparationRuntimePolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNTIME_POLICY_KIND_V1;
  executionBudget: NativeMediaFinalRenderPreparationPolicyOwnerBindingV1;
  retryPolicy: NativeMediaFinalRenderPreparationPolicyOwnerBindingV1;
  heartbeatPolicy: Readonly<{
    ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1;
    ownerVersion:
      typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1;
    policySha256: string;
  }>;
  bindingSha256: string;
}>;

export function createNativeMediaFinalRenderPreparationRuntimePolicyV1(
  input: Readonly<{
    executionBudget: NativeMediaFinalRenderPreparationPolicyOwnerBindingV1;
    retryPolicy: NativeMediaFinalRenderPreparationPolicyOwnerBindingV1;
    heartbeatPolicySha256: string;
  }>,
): NativeMediaFinalRenderPreparationRuntimePolicyV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNTIME_POLICY_KIND_V1,
    executionBudget: normalizeOwnerBinding(input.executionBudget, 'BUDGET'),
    retryPolicy: normalizeOwnerBinding(input.retryPolicy, 'RETRY'),
    heartbeatPolicy: {
      ownerId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1,
      ownerVersion: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
      policySha256: sha256(
        input.heartbeatPolicySha256,
        'NATIVE_MEDIA_FINAL_RENDER_HEARTBEAT_POLICY_SHA256_INVALID',
      ),
    },
  };
  return deepFreezeEditronJsonV1({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNativeMediaFinalRenderPreparationRuntimePolicyV1(
  value: unknown,
): NativeMediaFinalRenderPreparationRuntimePolicyV1 {
  const record = object(value, 'NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_INVALID');
  exactKeys(record, [
    'bindingSha256', 'executionBudget', 'heartbeatPolicy', 'kind', 'retryPolicy',
    'schemaVersion',
  ], 'NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNTIME_POLICY_KIND_V1) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_KIND_INVALID');
  }
  const heartbeat = object(
    record.heartbeatPolicy,
    'NATIVE_MEDIA_FINAL_RENDER_HEARTBEAT_POLICY_BINDING_INVALID',
  );
  exactKeys(heartbeat, ['ownerId', 'ownerVersion', 'policySha256'],
    'NATIVE_MEDIA_FINAL_RENDER_HEARTBEAT_POLICY_BINDING_FIELDS_INVALID');
  if (heartbeat.ownerId
      !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1
    || heartbeat.ownerVersion
      !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_HEARTBEAT_POLICY_OWNER_INVALID');
  }
  const rebuilt = createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: normalizeOwnerBinding(record.executionBudget, 'BUDGET'),
    retryPolicy: normalizeOwnerBinding(record.retryPolicy, 'RETRY'),
    heartbeatPolicySha256: sha256(
      heartbeat.policySha256,
      'NATIVE_MEDIA_FINAL_RENDER_HEARTBEAT_POLICY_SHA256_INVALID',
    ),
  });
  if (rebuilt.bindingSha256 !== sha256(
    record.bindingSha256,
    'NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_BINDING_SHA256_INVALID',
  )) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_BINDING_MISMATCH');
  }
  return rebuilt;
}

function normalizeOwnerBinding(
  value: unknown,
  label: 'BUDGET' | 'RETRY',
): NativeMediaFinalRenderPreparationPolicyOwnerBindingV1 {
  const record = object(
    value,
    `NATIVE_MEDIA_FINAL_RENDER_${label}_POLICY_BINDING_INVALID`,
  );
  exactKeys(record, ['ownerId', 'ownerVersion', 'policySha256'],
    `NATIVE_MEDIA_FINAL_RENDER_${label}_POLICY_BINDING_FIELDS_INVALID`);
  return deepFreezeEditronJsonV1({
    ownerId: identity(
      record.ownerId,
      `NATIVE_MEDIA_FINAL_RENDER_${label}_POLICY_OWNER_ID_INVALID`,
    ),
    ownerVersion: identity(
      record.ownerVersion,
      `NATIVE_MEDIA_FINAL_RENDER_${label}_POLICY_OWNER_VERSION_INVALID`,
    ),
    policySha256: sha256(
      record.policySha256,
      `NATIVE_MEDIA_FINAL_RENDER_${label}_POLICY_SHA256_INVALID`,
    ),
  });
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) throw new Error(code);
}

function identity(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) throw new Error(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(code);
  return value;
}
