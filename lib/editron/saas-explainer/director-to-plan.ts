/**
 * SaaS Explainer — director/evidence → craft-worker inputs (Phase 2 seam).
 *
 * The craft worker (explainer-remotion/scripts/agent-craft.mjs) reads two files: `out/plan.json` (the scene
 * plan) and `out/product-model.json` (the brand + product model). This module maps Editron's real contracts —
 * `SaasDirectorContract` (the shot-list) and `SaasProductEvidencePack` (the Brand Vault model) — into those
 * exact shapes. `form` is only a LOOSE vibe hint to the uncaged agent (it designs bespoke; it does not fill a
 * template), so we pass the director's archetype/family through as a suggestion, never a constraint.
 */
import type { SaasDirectorContract } from '@/lib/editron/saas-explainer/director-contract';
import type { SaasProductEvidencePack } from '@/lib/editron/saas-explainer/product-evidence-pack';

/** The `out/plan.json` shape agent-craft.mjs consumes. */
export interface ExplainerPlan {
  fps: number;
  transitionFrames: number;
  message: string;
  scenes: ExplainerPlanScene[];
}

export interface ExplainerPlanScene {
  /** Loose vibe hint only (uncaged agent designs bespoke). */
  form: string;
  durationInFrames: number;
  /** The VO line this beat must land visually (from the script step). */
  vo: string;
  /** Everything else the director decided, as context for the agent. */
  props: Record<string, unknown>;
}

export interface DirectorToPlanOptions {
  fps?: number;
  transitionFrames?: number;
  message?: string;
  /** VO line per beat index (from the generated/edited script). Missing entries fall back to the copy role. */
  narrationByIndex?: Record<number, string>;
}

/** Map a director contract (+ narration) into the plan.json the craft worker reads. */
export function directorContractToPlan(
  contract: SaasDirectorContract,
  opts: DirectorToPlanOptions = {},
): ExplainerPlan {
  const fps = opts.fps ?? 60;
  const scenes: ExplainerPlanScene[] = contract.sequence.map((beat) => ({
    // vibe hint = archetype + family (a suggestion; the agent improves on it).
    form: `${beat.visualArchetype}/${beat.family}`,
    durationInFrames: Math.max(1, Math.round(beat.durationSec * fps)),
    vo: opts.narrationByIndex?.[beat.index] ?? beat.copyRole ?? '',
    props: {
      family: beat.family,
      visualArchetype: beat.visualArchetype,
      copyRole: beat.copyRole,
      directorNotes: beat.directorNotes,
      productAssetUse: beat.productAssetUse,
      claimPolicy: beat.claimPolicy,
      evidenceStatus: beat.evidenceStatus,
      admissibleClaimIds: beat.admissibleClaimIds,
    },
  }));
  return {
    fps,
    transitionFrames: opts.transitionFrames ?? Math.round(fps * 0.37),
    message: opts.message ?? '',
    scenes,
  };
}

/** The loose `out/product-model.json` the agent reads as its brand+product context. */
export interface ExplainerProductModel {
  brand: SaasProductEvidencePack['visualIdentity'];
  positioning: SaasProductEvidencePack['brief'];
  coverage: SaasProductEvidencePack['coverage'];
  /** R2 URLs of real product screenshots the agent may recreate/reference (the socialPreviewImages/productImages feed). */
  productImageUrls: string[];
  admissibleClaims: string[];
}

/** Map the Brand Vault evidence pack into the agent's product-model.json. */
export function evidencePackToProductModel(
  pack: SaasProductEvidencePack,
  extraProductImageUrls: string[] = [],
): ExplainerProductModel {
  // ONLY real product UI screenshots feed "recreate this product screen". Social-preview images (Instagram/
  // LinkedIn posts) get merged into brand.productImages upstream (brand-context), but they are NOT product UI —
  // feeding them as "recreate this UI" produces junk (and those social CDN URLs 403 anyway). Drop them here; a
  // brand with no real screenshots then honestly gets none, and the craft agent recreates the UI from the model.
  const packImages = pack.visualIdentity.productImages
    .filter((a) => a.kind !== 'social_media' && a.signalPath !== 'assets.socialPreviewImages')
    .map((a) => a.url)
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u));
  return {
    brand: pack.visualIdentity,
    positioning: pack.brief,
    coverage: pack.coverage,
    productImageUrls: [...new Set([...packImages, ...extraProductImageUrls])],
    admissibleClaims: pack.claimLedger.filter((c) => c.admissible).map((c) => c.text),
  };
}
