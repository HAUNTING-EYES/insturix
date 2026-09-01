/**
 * Phase 2 (brief §22 Deploy-cycle-1 item 3): VideoTasteContract generation IN SHADOW.
 *
 * Shadow generation is gated by MG_TASTE_CONTRACT_SHADOW (default off). The
 * EDL producer returns the result to the atomic ProjectService completion
 * owner; this module deliberately exposes no project persistence path.
 */
export function tasteContractShadowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.MG_TASTE_CONTRACT_SHADOW ?? env.MG_TASTE_CONTRACT_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Phase 4a live gate: when ON, the resolved contract actually DIRECTS the designer (art-director mode). */
export function tasteContractLiveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.MG_TASTE_CONTRACT_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
