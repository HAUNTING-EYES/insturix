import {
  createMediaProxyMasterTranscodeOperationalPolicyRegistryV1,
  type MediaProxyMasterTranscodeOperationalPolicyRegistryV1,
} from './media-proxy-master-transcode-operational-policy-registry-v1';
import type {
  MediaProxyMasterTranscodeHeartbeatPolicyV1,
  MediaProxyMasterTranscodeRetryPolicyV1,
} from './media-proxy-master-transcode-operational-policy-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_ENV_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_JSON' as const;

const MAX_REGISTRY_BYTES = 256 * 1_024;
const MAX_RETAINED_POLICIES_PER_FAMILY = 256;

export type MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1 = Readonly<{
  [key: string]: string | undefined;
  EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_JSON?: string;
}>;

export type MediaProxyMasterTranscodeOperationalPolicyEnvironmentResolutionV1 =
  Readonly<
    | {
        configured: true;
        reason: null;
        registry: Readonly<
          MediaProxyMasterTranscodeOperationalPolicyRegistryV1
        >;
      }
    | {
        configured: false;
        reason: 'MISSING_REGISTRY' | 'REGISTRY_TOO_LARGE' | 'REGISTRY_INVALID';
        registry: null;
      }
  >;

/** Loads the complete active-plus-retained policy set with no implicit policy. */
export function resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1(
  environment: MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1 =
    process.env,
): MediaProxyMasterTranscodeOperationalPolicyEnvironmentResolutionV1 {
  const raw = environment[
    MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_ENV_V1
  ];
  if (typeof raw !== 'string' || raw.length === 0 || raw.trim().length === 0) {
    return unavailable('MISSING_REGISTRY');
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_REGISTRY_BYTES) {
    return unavailable('REGISTRY_TOO_LARGE');
  }
  try {
    const root = record(JSON.parse(raw));
    exactKeys(root, [
      'activeHeartbeatPolicy',
      'activeRetryPolicy',
      'retainedHeartbeatPolicies',
      'retainedRetryPolicies',
    ]);
    const retainedRetryPolicies = policyArray(root.retainedRetryPolicies);
    const retainedHeartbeatPolicies = policyArray(
      root.retainedHeartbeatPolicies,
    );
    const registry =
      createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
        activeRetryPolicy:
          root.activeRetryPolicy as MediaProxyMasterTranscodeRetryPolicyV1,
        activeHeartbeatPolicy:
          root.activeHeartbeatPolicy as MediaProxyMasterTranscodeHeartbeatPolicyV1,
        retainedRetryPolicies: retainedRetryPolicies as
          readonly MediaProxyMasterTranscodeRetryPolicyV1[],
        retainedHeartbeatPolicies: retainedHeartbeatPolicies as
          readonly MediaProxyMasterTranscodeHeartbeatPolicyV1[],
      });
    return Object.freeze({ configured: true, reason: null, registry });
  } catch {
    return unavailable('REGISTRY_INVALID');
  }
}

function policyArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)
    || value.length > MAX_RETAINED_POLICIES_PER_FAMILY) {
    throw new Error('OPERATIONAL_POLICY_ARRAY_INVALID');
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OPERATIONAL_POLICY_REGISTRY_INVALID');
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    throw new Error('OPERATIONAL_POLICY_REGISTRY_FIELDS_INVALID');
  }
}

function unavailable(
  reason: Extract<
    MediaProxyMasterTranscodeOperationalPolicyEnvironmentResolutionV1,
    { configured: false }
  >['reason'],
): Extract<
  MediaProxyMasterTranscodeOperationalPolicyEnvironmentResolutionV1,
  { configured: false }
> {
  return Object.freeze({ configured: false, reason, registry: null });
}
