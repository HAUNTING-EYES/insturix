/**
 * Phase 2 (brief §22 Deploy-cycle-1 item 3): VideoTasteContract generation IN SHADOW.
 *
 * Shadow = produce + persist + log, but NEVER change live behavior (the designer/judge don't see it yet —
 * that's the Phase-4 wiring, cycle-2). Gated by MG_TASTE_CONTRACT_SHADOW (default off). Non-fatal on any error.
 */
import { buildVideoTasteContract, type TasteContractBuildInput, type TasteContractBuildResult } from './contract-resolver';

export function tasteContractShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.MG_TASTE_CONTRACT_SHADOW ?? env.MG_TASTE_CONTRACT_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export async function maybePersistTasteContractShadow(
  projectId: string,
  userId: string,
  input: TasteContractBuildInput,
): Promise<{ result: TasteContractBuildResult; persisted: boolean } | null> {
  if (!tasteContractShadowEnabled()) return null;
  const result = buildVideoTasteContract(input);
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const projects = (await getDatabase()).collection('projects');
    await projects.updateOne(
      { projectId, userId },
      {
        $set: {
          'intelligence.mgTasteContract': result.contract,
          updatedAt: new Date(),
        },
      },
    );
    console.log(
      `[MG-Taste] shadow contract persisted ${result.contract.id} hash=${result.hash.slice(0, 12)} ` +
      `src=${result.sourcePrecedenceApplied.join(',')} personal=${result.contract.personalTasteConfidence}`,
    );
    return { result, persisted: true };
  } catch (error) {
    console.warn('[MG-Taste] shadow persist failed (non-fatal):', error instanceof Error ? error.message : error);
    return { result, persisted: false };
  }
}
