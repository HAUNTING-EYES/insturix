import type { ProviderNativeTerminalDispositionV2R } from './provider-native-tool-episode-v2r';

export type ProviderNativeProductOutcomeV2R =
  | 'PASS'
  | 'FAIL'
  | 'UNVERIFIABLE'
  | 'CAPABILITY_GAP'
  | 'POLICY_BLOCKED'
  | 'CONFLICT'
  | 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';

const PROVIDER_INFRASTRUCTURE_TERMINALS = new Set<ProviderNativeTerminalDispositionV2R>([
  'PROVIDER_RATE_LIMIT',
  'PROVIDER_TIMEOUT',
  'PROVIDER_REFUSAL',
  'PROVIDER_ERROR',
]);

export function isProviderNativeInfrastructureTerminalV2R(
  disposition: ProviderNativeTerminalDispositionV2R,
): boolean {
  return PROVIDER_INFRASTRUCTURE_TERMINALS.has(disposition);
}

export function mapProviderNativeNonProofTerminalToProductOutcomeV2R(
  disposition: ProviderNativeTerminalDispositionV2R,
): Exclude<ProviderNativeProductOutcomeV2R, 'PASS'> {
  if (isProviderNativeInfrastructureTerminalV2R(disposition)) {
    return 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';
  }
  if (disposition === 'UNVERIFIABLE') return 'UNVERIFIABLE';
  if (disposition === 'CAPABILITY_GAP') return 'CAPABILITY_GAP';
  if (disposition === 'POLICY_BLOCKED') return 'POLICY_BLOCKED';
  if (disposition === 'CONFLICT') return 'CONFLICT';
  return 'FAIL';
}
