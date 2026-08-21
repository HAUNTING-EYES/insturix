import type { ProviderNativeTerminalDispositionV2R } from './provider-native-tool-episode-v2r';

export type ProviderNativeProductOutcomeV2R =
  | 'PASS'
  | 'FAIL'
  | 'UNVERIFIABLE'
  | 'CLARIFICATION_REQUIRED'
  | 'CAPABILITY_GAP'
  | 'POLICY_BLOCKED'
  | 'CONFLICT'
  | 'NOT_EVALUATED_RESOURCE_GUARD'
  | 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';

const PROVIDER_INFRASTRUCTURE_TERMINALS = new Set<ProviderNativeTerminalDispositionV2R>([
  'PROVIDER_RATE_LIMIT',
  'PROVIDER_TIMEOUT',
  'PROVIDER_REFUSAL',
  'PROVIDER_ERROR',
]);

const RESOURCE_GUARD_TERMINALS = new Set<ProviderNativeTerminalDispositionV2R>([
  'RESOURCE_BUDGET_EXHAUSTED',
  'RESOURCE_ACCOUNTING_UNVERIFIABLE',
]);

export function isProviderNativeInfrastructureTerminalV2R(
  disposition: ProviderNativeTerminalDispositionV2R,
): boolean {
  return PROVIDER_INFRASTRUCTURE_TERMINALS.has(disposition);
}

export function isProviderNativeResourceGuardTerminalV2R(
  disposition: ProviderNativeTerminalDispositionV2R,
): boolean {
  return RESOURCE_GUARD_TERMINALS.has(disposition);
}

export function mapProviderNativeNonProofTerminalToProductOutcomeV2R(
  disposition: ProviderNativeTerminalDispositionV2R,
): Exclude<ProviderNativeProductOutcomeV2R, 'PASS'> {
  if (isProviderNativeResourceGuardTerminalV2R(disposition)) {
    return 'NOT_EVALUATED_RESOURCE_GUARD';
  }
  if (isProviderNativeInfrastructureTerminalV2R(disposition)) {
    return 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';
  }
  if (disposition === 'UNVERIFIABLE') return 'UNVERIFIABLE';
  if (disposition === 'CLARIFICATION_REQUIRED') return 'CLARIFICATION_REQUIRED';
  if (disposition === 'CAPABILITY_GAP') return 'CAPABILITY_GAP';
  if (disposition === 'POLICY_BLOCKED') return 'POLICY_BLOCKED';
  if (disposition === 'CONFLICT') return 'CONFLICT';
  return 'FAIL';
}
