import {
  getSaasExplainerKnowledgeGraph,
  type SaasExplainerStoryStructureId,
} from "@/lib/editron/saas-explainer/knowledge-graph";
import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";
import type { SaasExplainerReferenceStyleBrief } from "@/lib/editron/saas-explainer/reference-analysis";
import type {
  SaasProductEvidenceClaim,
  SaasProductEvidencePack,
} from "@/lib/editron/saas-explainer/product-evidence-pack";

export const SAAS_DIRECTOR_CONTRACT_VERSION = "saas-director-contract/v1";

export type SaasDirectorNarrationMode =
  | "vo"
  | "founder_vo"
  | "talking_head"
  | "testimonial_led"
  | "text_driven"
  | "ambient_demo";

export type SaasDirectorSceneFamily =
  | "hook"
  | "problem"
  | "promise"
  | "workflow_demo"
  | "feature_demo"
  | "ui_proof"
  | "proof_metric"
  | "comparison"
  | "social_proof"
  | "objection_handling"
  | "cta"
  | "logo_outro"
  | "section_header";

export type SaasDirectorVisualArchetype =
  | "TYPE_ONLY"
  | "TYPE_OVER_MEDIA"
  | "UI_FULL_BLEED"
  | "UI_FRAMED"
  | "UI_CROP_ZOOM"
  | "CURSOR_HERO"
  | "UI_FLOAT_STACK"
  | "DEVICE_CONTEXT"
  | "HUMAN_FRAME"
  | "BENTO_GRID"
  | "DIAGRAM_SCHEMATIC"
  | "DATA_VIZ"
  | "SPLIT_COMPARE"
  | "ICON_CONSTELLATION"
  | "LOGO_FIELD";

export type SaasDirectorEvidenceStatus = "satisfied" | "substituted" | "degraded" | "disabled";
export type SaasDirectorClaimPolicy = "evidence_backed" | "claim_locked" | "synthetic_demo_only";
export type SaasDirectorDegradationSeverity = "info" | "warning" | "blocker";

export interface SaasDirectorSceneBeat {
  index: number;
  family: SaasDirectorSceneFamily;
  sourceFamilyExpression: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  visualArchetype: SaasDirectorVisualArchetype;
  claimPolicy: SaasDirectorClaimPolicy;
  evidenceStatus: SaasDirectorEvidenceStatus;
  evidenceDuty: string[];
  admissibleClaimIds: string[];
  productAssetUse: {
    logo: boolean;
    productImage: boolean;
    productUrl: boolean;
  };
  copyRole: string;
  directorNotes: string[];
}

export interface SaasDirectorSubstitution {
  sceneIndex?: number;
  from: string;
  to: SaasDirectorSceneFamily | "cut";
  reason: string;
}

export interface SaasDirectorDegradation {
  code:
    | "core_floor_no_real_product_evidence"
    | "duration_structure_degraded"
    | "proof_metric_substituted"
    | "social_proof_disabled"
    | "objection_handling_cut"
    | "logo_outro_without_logo"
    | "reference_style_only";
  severity: SaasDirectorDegradationSeverity;
  message: string;
}

export interface SaasDirectorContract {
  schemaVersion: typeof SAAS_DIRECTOR_CONTRACT_VERSION;
  doctrineVersion: string;
  selectedStructure: {
    id: SaasExplainerStoryStructureId | string;
    sourceStructureId: string;
    requestedDurationSec: number;
    targetDurationSec: number;
    selectionReason: string;
    variant?: string;
    degradedFromStructureId?: string;
  };
  narrationMode: SaasDirectorNarrationMode;
  evidenceAudit: {
    realProductEvidence: boolean;
    syntheticModeRequired: boolean;
    proofMetricEnabled: boolean;
    socialProofEnabled: boolean;
    productDemoEnabled: boolean;
    disabledFamilies: string[];
    substitutions: SaasDirectorSubstitution[];
    degradations: SaasDirectorDegradation[];
  };
  sequence: SaasDirectorSceneBeat[];
  hardGateIds: string[];
  antiPatternsToAvoid: string[];
  referenceUsage: {
    provided: boolean;
    policy: "style_parameters_only";
    summary?: string;
  };
  directives: string[];
}

export interface BuildSaasDirectorContractInput {
  input: NormalizedSaasExplainerIntake;
  productEvidencePack: SaasProductEvidencePack;
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief;
  referenceProvided: boolean;
}

type RawGraphStoryStructure = {
  id: string;
  duration?: number | { min?: number; max?: number; reference?: number };
  scenes?: RawGraphSceneSpec[];
  scenesProportional?: RawGraphProportionalSceneSpec[];
  evidenceBill?: string[];
  degradeTo?: string;
  unavailableWhenProofThin?: boolean;
  featureParadeVariant?: {
    scenes?: RawGraphSceneSpec[];
    evidenceBill?: string[];
  };
};

type RawGraphSceneSpec = {
  family?: string;
  start?: number;
  end?: number;
  count?: number | string;
  fallback?: string;
  variant?: string;
  note?: string;
  repeatGroup?: {
    n?: { min?: number; max?: number };
    unit?: string[];
  };
};

type RawGraphProportionalSceneSpec = {
  family?: string;
  share?: number;
  note?: string;
};

interface SelectedStructure {
  structure: RawGraphStoryStructure;
  sourceStructureId: string;
  targetDurationSec: number;
  selectionReason: string;
  variant?: string;
  degradedFromStructureId?: string;
  degradations: SaasDirectorDegradation[];
}

export function buildSaasDirectorContract(input: BuildSaasDirectorContractInput): SaasDirectorContract {
  const graph = getSaasExplainerKnowledgeGraph();
  const structures = graph.storyStructures as unknown as RawGraphStoryStructure[];
  const selected = selectStructure({
    requestedDurationSec: input.input.durationSec,
    productEvidencePack: input.productEvidencePack,
    structures,
  });
  const narrationMode = selectNarrationMode(input.input, graph.narrationModes.default);
  const substitutionLog: SaasDirectorSubstitution[] = [];
  const sequence = buildSceneSequence({
    selected,
    productEvidencePack: input.productEvidencePack,
    substitutionLog,
  });
  const disabledFamilies = collectDisabledFamilies(input.productEvidencePack);
  const degradations = [
    ...selected.degradations,
    ...directorDegradationsFromEvidence(input.productEvidencePack, disabledFamilies),
    ...(input.referenceProvided
      ? [{
          code: "reference_style_only" as const,
          severity: "info" as const,
          message: "Reference video may influence style parameters only, never claims, words, layouts, colors, or assets.",
        }]
      : []),
  ];

  return {
    schemaVersion: SAAS_DIRECTOR_CONTRACT_VERSION,
    doctrineVersion: graph.meta.version,
    selectedStructure: {
      id: selected.sourceStructureId,
      sourceStructureId: selected.sourceStructureId,
      requestedDurationSec: input.input.durationSec,
      targetDurationSec: selected.targetDurationSec,
      selectionReason: selected.selectionReason,
      ...(selected.variant ? { variant: selected.variant } : {}),
      ...(selected.degradedFromStructureId ? { degradedFromStructureId: selected.degradedFromStructureId } : {}),
    },
    narrationMode,
    evidenceAudit: {
      realProductEvidence: input.productEvidencePack.coverage.realProductEvidence,
      syntheticModeRequired: input.productEvidencePack.coverage.syntheticModeRequired,
      proofMetricEnabled: hasMetricProof(input.productEvidencePack),
      socialProofEnabled: hasSocialProof(input.productEvidencePack),
      productDemoEnabled: input.productEvidencePack.coverage.canShowProductDemo,
      disabledFamilies,
      substitutions: substitutionLog,
      degradations,
    },
    sequence,
    hardGateIds: graph.qualityGates.stage1HardGates.map((gate) => gate.id),
    antiPatternsToAvoid: graph.antiPatterns.map((pattern) => pattern.id),
    referenceUsage: {
      provided: input.referenceProvided,
      policy: "style_parameters_only",
      ...(input.referenceStyleBrief?.summary ? { summary: input.referenceStyleBrief.summary } : {}),
    },
    directives: buildDirectorDirectives(input.productEvidencePack),
  };
}

export function formatSaasDirectorPromptBlock(contract: SaasDirectorContract): string {
  const scenes = contract.sequence.map((scene) => {
    return [
      `${scene.index + 1}. ${scene.startSec}-${scene.endSec}s ${scene.family}`,
      `archetype=${scene.visualArchetype}`,
      `claimPolicy=${scene.claimPolicy}`,
      `evidence=${scene.evidenceStatus}`,
      `claims=${scene.admissibleClaimIds.join(",") || "none"}`,
      `duty=${scene.evidenceDuty.join(" | ")}`,
    ].join(" ; ");
  });
  const substitutions = contract.evidenceAudit.substitutions.map((substitution) => {
    const prefix = typeof substitution.sceneIndex === "number" ? `scene ${substitution.sceneIndex + 1}: ` : "";
    return `- ${prefix}${substitution.from} -> ${substitution.to}: ${substitution.reason}`;
  });
  const degradations = contract.evidenceAudit.degradations.map((degradation) => {
    return `- ${degradation.severity}/${degradation.code}: ${degradation.message}`;
  });

  return [
    "<saas_director_contract>",
    `Schema: ${contract.schemaVersion}`,
    `Doctrine graph version: ${contract.doctrineVersion}`,
    `Selected structure: ${contract.selectedStructure.id}`,
    contract.selectedStructure.variant ? `Variant: ${contract.selectedStructure.variant}` : null,
    contract.selectedStructure.degradedFromStructureId
      ? `Degraded from: ${contract.selectedStructure.degradedFromStructureId}`
      : null,
    `Requested duration: ${contract.selectedStructure.requestedDurationSec}s`,
    `Target duration: ${contract.selectedStructure.targetDurationSec}s`,
    `Selection reason: ${contract.selectedStructure.selectionReason}`,
    `Narration mode: ${contract.narrationMode}`,
    `Real product evidence: ${contract.evidenceAudit.realProductEvidence ? "yes" : "no"}`,
    `Synthetic mode required: ${contract.evidenceAudit.syntheticModeRequired ? "yes" : "no"}`,
    "Scene sequence:",
    scenes.join("\n"),
    "Substitutions:",
    substitutions.length > 0 ? substitutions.join("\n") : "- none",
    "Degradations:",
    degradations.length > 0 ? degradations.join("\n") : "- none",
    `Hard gates: ${contract.hardGateIds.join(", ")}`,
    `Anti-patterns to avoid: ${contract.antiPatternsToAvoid.slice(0, 12).join(", ")}`,
    "Directives:",
    contract.directives.map((directive) => `- ${directive}`).join("\n"),
    "</saas_director_contract>",
  ].filter(Boolean).join("\n");
}

function selectStructure(input: {
  requestedDurationSec: number;
  productEvidencePack: SaasProductEvidencePack;
  structures: RawGraphStoryStructure[];
}): SelectedStructure {
  const requestedCandidate = candidateStructureIdForDuration(input.requestedDurationSec);
  const degradations: SaasDirectorDegradation[] = [];

  if (!input.productEvidencePack.coverage.realProductEvidence) {
    const structure = requireStructure(input.structures, "teaser_30s");
    degradations.push({
      code: "core_floor_no_real_product_evidence",
      severity: "warning",
      message: "No verified product UI evidence is available; director downgraded to declared-abstract teaser floor.",
    });
    if (requestedCandidate !== "teaser_30s") {
      degradations.push({
        code: "duration_structure_degraded",
        severity: "warning",
        message: `Requested ${requestedCandidate} needs real product evidence, so target duration is reduced to 30s.`,
      });
    }
    return {
      structure,
      sourceStructureId: "teaser_30s",
      targetDurationSec: 30,
      selectionReason: "coreFloor: no_real_product_evidence -> teaser_30s_declared_abstract_only",
      variant: "declared_abstract_only",
      ...(requestedCandidate === "teaser_30s" ? {} : { degradedFromStructureId: requestedCandidate }),
      degradations,
    };
  }

  if (shouldUseFeatureParade(input.requestedDurationSec, input.productEvidencePack)) {
    const structure = requireStructure(input.structures, "demo_90s");
    return {
      structure,
      sourceStructureId: "demo_90s",
      targetDurationSec: 90,
      selectionReason: "feature parade: release/launch brief plus enough product evidence for repeated feature beats",
      variant: "featureParadeVariant",
      degradations,
    };
  }

  let selectedId = requestedCandidate;
  if (selectedId === "demo_90s" && !hasDemo90Evidence(input.productEvidencePack)) {
    degradations.push({
      code: "duration_structure_degraded",
      severity: "warning",
      message: "90s demo requested without enough distinct product evidence; director downgraded to launch_60s.",
    });
    selectedId = "launch_60s";
  }

  const structure = requireStructure(input.structures, selectedId);
  return {
    structure,
    sourceStructureId: selectedId,
    targetDurationSec: numericStructureDuration(structure),
    selectionReason: `duration_and_platform_pick_candidates -> ${selectedId}; evidence audit passed with substitutions as needed`,
    ...(selectedId === requestedCandidate ? {} : { degradedFromStructureId: requestedCandidate }),
    degradations,
  };
}

function buildSceneSequence(input: {
  selected: SelectedStructure;
  productEvidencePack: SaasProductEvidencePack;
  substitutionLog: SaasDirectorSubstitution[];
}): SaasDirectorSceneBeat[] {
  const rawSpecs = rawSceneSpecsForSelection(input.selected, input.productEvidencePack);
  const sourceDuration = numericStructureDuration(input.selected.structure);
  const scale = input.selected.targetDurationSec / Math.max(sourceDuration, 1);
  return rawSpecs.map((spec, index) => {
    const resolved = resolveSceneFamily(spec.family || "feature_demo", input.productEvidencePack);
    if (resolved.substitutionReason) {
      input.substitutionLog.push({
        sceneIndex: index,
        from: spec.family || "unknown",
        to: resolved.family,
        reason: resolved.substitutionReason,
      });
    }
    const start = roundTime((spec.start ?? index * 4) * scale);
    const end = roundTime((spec.end ?? (spec.start ?? index * 4) + 4) * scale);
    const evidence = sceneEvidenceDuty(resolved.family, input.productEvidencePack);
    const claimPolicy = claimPolicyForScene(resolved.family, input.productEvidencePack, evidence.claims);
    const synthetic = input.productEvidencePack.coverage.syntheticModeRequired;
    const visualArchetype = visualArchetypeForScene(resolved.family, input.productEvidencePack);

    return {
      index,
      family: resolved.family,
      sourceFamilyExpression: spec.family || resolved.family,
      startSec: start,
      endSec: end,
      durationSec: roundTime(Math.max(1, end - start)),
      visualArchetype,
      claimPolicy,
      evidenceStatus: evidenceStatusForScene(resolved.family, input.productEvidencePack, evidence.claims),
      evidenceDuty: evidence.duty,
      admissibleClaimIds: evidence.claims.map((claim) => claim.id),
      productAssetUse: {
        logo: resolved.family === "logo_outro" && input.productEvidencePack.visualIdentity.hasLogo,
        productImage: !synthetic && usesProductImage(resolved.family),
        productUrl: Boolean(input.productEvidencePack.product.productUrl) && ["cta", "ui_proof", "workflow_demo"].includes(resolved.family),
      },
      copyRole: copyRoleForFamily(resolved.family),
      directorNotes: directorNotesForScene(resolved.family, input.productEvidencePack, spec),
    };
  });
}

function rawSceneSpecsForSelection(
  selected: SelectedStructure,
  productEvidencePack: SaasProductEvidencePack,
): RawGraphSceneSpec[] {
  if (selected.variant === "featureParadeVariant" && selected.structure.featureParadeVariant?.scenes) {
    return expandRepeatGroups(selected.structure.featureParadeVariant.scenes, productEvidencePack);
  }
  if (selected.structure.scenes?.length) return selected.structure.scenes;
  if (selected.structure.scenesProportional?.length) {
    let cursor = 0;
    return selected.structure.scenesProportional.map((scene) => {
      const start = cursor;
      const end = cursor + (scene.share ?? 0.1) * numericStructureDuration(selected.structure);
      cursor = end;
      return {
        ...(scene.family ? { family: scene.family } : {}),
        start,
        end,
        ...(scene.note ? { note: scene.note } : {}),
      };
    });
  }
  return [
    { family: "hook", start: 0, end: 4 },
    { family: "workflow_demo", start: 4, end: 18 },
    { family: "cta", start: 18, end: 27 },
    { family: "logo_outro", start: 27, end: 30 },
  ];
}

function expandRepeatGroups(
  scenes: RawGraphSceneSpec[],
  productEvidencePack: SaasProductEvidencePack,
): RawGraphSceneSpec[] {
  const expanded: RawGraphSceneSpec[] = [];
  for (const scene of scenes) {
    if (!scene.repeatGroup?.unit?.length) {
      expanded.push(scene);
      continue;
    }
    const max = scene.repeatGroup.n?.max ?? 4;
    const count = Math.max(1, Math.min(max, productEvidencePack.brief.productServices.length || 1));
    const start = scene.start ?? 0;
    const end = scene.end ?? start + count * scene.repeatGroup.unit.length * 4;
    const slot = (end - start) / (count * scene.repeatGroup.unit.length);
    for (let repeat = 0; repeat < count; repeat += 1) {
      for (let unitIndex = 0; unitIndex < scene.repeatGroup.unit.length; unitIndex += 1) {
        const index = repeat * scene.repeatGroup.unit.length + unitIndex;
        const family = scene.repeatGroup.unit[unitIndex];
        expanded.push({
          ...(family ? { family } : {}),
          start: roundTime(start + index * slot),
          end: roundTime(start + (index + 1) * slot),
        });
      }
    }
  }
  return expanded;
}

function resolveSceneFamily(
  expression: string,
  productEvidencePack: SaasProductEvidencePack,
): { family: SaasDirectorSceneFamily; substitutionReason?: string } {
  const candidates = expression.split(/[+|]/).map((part) => part.trim()).filter(Boolean);
  const first = normalizeSceneFamily(candidates[0] || expression);
  const metricAllowed = hasMetricProof(productEvidencePack);
  const socialAllowed = hasSocialProof(productEvidencePack);
  const realUiAllowed = productEvidencePack.coverage.realProductEvidence;

  if (!realUiAllowed && ["workflow_demo", "ui_proof", "proof_metric", "social_proof", "comparison"].includes(first)) {
    return {
      family: first === "comparison" ? "promise" : "feature_demo",
      substitutionReason: "real product UI evidence missing; using declared abstract product-adjacent beat",
    };
  }

  if (candidates.includes("proof_metric") && !metricAllowed) {
    if (candidates.includes("social_proof") && socialAllowed) return { family: "social_proof" };
    if (realUiAllowed) {
      return {
        family: "ui_proof",
        substitutionReason: "proof_metric requires exact sourced numbers; using UI proof instead",
      };
    }
    return {
      family: "feature_demo",
      substitutionReason: "proof_metric lacks exact sourced numbers and real UI proof",
    };
  }

  if (candidates.includes("social_proof") && !socialAllowed) {
    if (realUiAllowed) {
      return {
        family: "ui_proof",
        substitutionReason: "social_proof lacks verified customer/logo/testimonial evidence; using UI proof instead",
      };
    }
    return {
      family: "feature_demo",
      substitutionReason: "social_proof lacks verified trust evidence",
    };
  }

  return { family: first };
}

function sceneEvidenceDuty(
  family: SaasDirectorSceneFamily,
  productEvidencePack: SaasProductEvidencePack,
): { duty: string[]; claims: SaasProductEvidenceClaim[] } {
  const claims = claimsForFamily(family, productEvidencePack);
  const shared = ["Resolve every visible/VO claim to the evidence pack claim ledger."];
  const duties: Record<SaasDirectorSceneFamily, string[]> = {
    hook: ["Use product name plus strongest admissible positioning/outcome claim."],
    problem: ["Use sourced pain point or job-to-be-done; no strawman metrics."],
    promise: ["Compress the product promise into one sourced sentence."],
    workflow_demo: ["Show a real product workflow asset when available; hold long enough for UI proof."],
    feature_demo: ["Show one sourced capability; do not fabricate UI controls."],
    ui_proof: ["Use verified product image/UI asset as the proof subject."],
    proof_metric: ["Use exact numeric proof only; no rounded or invented metrics."],
    comparison: ["Compare before/after state only when both sides are sourced."],
    social_proof: ["Use verified customers, quotes, or logos only."],
    objection_handling: ["Use verified objection fact only; otherwise cut."],
    cta: ["Use supplied/brand CTA or outcome language without adding offers."],
    logo_outro: ["Use approved logo asset only; no recolor, distortion, glow, or invented motion."],
    section_header: ["Header must be immediately proven by the next scene."],
  };
  return { duty: [...duties[family], ...shared], claims };
}

function claimsForFamily(
  family: SaasDirectorSceneFamily,
  productEvidencePack: SaasProductEvidencePack,
): SaasProductEvidenceClaim[] {
  const admissible = productEvidencePack.claimLedger.filter((claim) => claim.admissible);
  if (family === "proof_metric") return admissible.filter((claim) => claim.claimType === "proof" && /\d/.test(claim.text));
  if (family === "social_proof") return admissible.filter((claim) => /customer|trusted|testimonial|quote|logo/i.test(claim.text));
  if (family === "problem") return admissible.filter((claim) => claim.claimType === "pain" || claim.claimType === "job");
  if (family === "workflow_demo") return admissible.filter((claim) => claim.claimType === "capability" || claim.claimType === "job");
  if (family === "feature_demo" || family === "ui_proof") return admissible.filter((claim) => claim.claimType === "capability");
  if (family === "cta") return admissible.filter((claim) => claim.claimType === "outcome" || claim.claimType === "script");
  if (family === "hook" || family === "promise") {
    return admissible.filter((claim) => ["outcome", "proof", "positioning", "capability"].includes(claim.claimType));
  }
  return admissible.slice(0, 2);
}

function evidenceStatusForScene(
  family: SaasDirectorSceneFamily,
  productEvidencePack: SaasProductEvidencePack,
  claims: SaasProductEvidenceClaim[],
): SaasDirectorEvidenceStatus {
  if (productEvidencePack.coverage.syntheticModeRequired && usesProductImage(family)) return "degraded";
  if (family === "proof_metric" && !hasMetricProof(productEvidencePack)) return "disabled";
  if (family === "social_proof" && !hasSocialProof(productEvidencePack)) return "disabled";
  if (family === "logo_outro" && !productEvidencePack.visualIdentity.hasLogo) return "degraded";
  if (claims.length === 0 && ["problem", "feature_demo", "workflow_demo", "proof_metric", "social_proof"].includes(family)) {
    return "substituted";
  }
  return "satisfied";
}

function claimPolicyForScene(
  family: SaasDirectorSceneFamily,
  productEvidencePack: SaasProductEvidencePack,
  claims: SaasProductEvidenceClaim[],
): SaasDirectorClaimPolicy {
  if (productEvidencePack.coverage.syntheticModeRequired) return "synthetic_demo_only";
  if ((family === "proof_metric" || family === "social_proof") && claims.length === 0) return "claim_locked";
  return "evidence_backed";
}

function visualArchetypeForScene(
  family: SaasDirectorSceneFamily,
  productEvidencePack: SaasProductEvidencePack,
): SaasDirectorVisualArchetype {
  if (productEvidencePack.coverage.syntheticModeRequired) {
    if (family === "logo_outro" && productEvidencePack.visualIdentity.hasLogo) return "LOGO_FIELD";
    if (["hook", "promise", "cta", "logo_outro"].includes(family)) return "TYPE_ONLY";
    return "DIAGRAM_SCHEMATIC";
  }
  const archetypes: Record<SaasDirectorSceneFamily, SaasDirectorVisualArchetype> = {
    hook: "UI_FRAMED",
    problem: "SPLIT_COMPARE",
    promise: "TYPE_OVER_MEDIA",
    workflow_demo: "UI_FRAMED",
    feature_demo: "UI_CROP_ZOOM",
    ui_proof: "UI_FULL_BLEED",
    proof_metric: hasMetricProof(productEvidencePack) ? "DATA_VIZ" : "UI_FRAMED",
    comparison: "SPLIT_COMPARE",
    social_proof: "BENTO_GRID",
    objection_handling: "TYPE_OVER_MEDIA",
    cta: "TYPE_OVER_MEDIA",
    logo_outro: productEvidencePack.visualIdentity.hasLogo ? "LOGO_FIELD" : "TYPE_ONLY",
    section_header: "TYPE_ONLY",
  };
  return archetypes[family];
}

function directorNotesForScene(
  family: SaasDirectorSceneFamily,
  productEvidencePack: SaasProductEvidencePack,
  spec: RawGraphSceneSpec,
): string[] {
  return [
    spec.variant ? `Variant: ${spec.variant}.` : null,
    spec.note ? `Graph note: ${spec.note}.` : null,
    spec.count ? `Graph count hint: ${spec.count}.` : null,
    productEvidencePack.coverage.syntheticModeRequired ? "Declare abstraction; do not costume generated UI as the real product." : null,
    family === "section_header" ? "Next scene must prove this header immediately." : null,
  ].filter((note): note is string => Boolean(note));
}

function buildDirectorDirectives(productEvidencePack: SaasProductEvidencePack): string[] {
  return [
    "Write viewer-facing scene text only; never include labels like Visual:, Narration:, metadata, source map, or LLM instructions on screen.",
    "Structure degrades before it fabricates; every downgrade must stay visible in metadata.",
    "Reference video contributes style parameters only, with zero words, layouts, colors, assets, or claims copied.",
    "Use Brand Vault identity as law when accepted; do not recolor, distort, glow, or invent logo variants.",
    productEvidencePack.coverage.realProductEvidence
      ? "At least one UI-family scene must use verified product evidence."
      : "No framed real-product demo scenes are allowed; use declared abstract diagrams or type-led scenes.",
    "Proof metrics, customers, testimonials, integrations, pricing, and compliance claims require exact admissible ledger entries.",
  ];
}

function collectDisabledFamilies(productEvidencePack: SaasProductEvidencePack): string[] {
  return [
    productEvidencePack.coverage.realProductEvidence ? null : "real_product_ui_families",
    hasMetricProof(productEvidencePack) ? null : "proof_metric",
    hasSocialProof(productEvidencePack) ? null : "social_proof",
    productEvidencePack.visualIdentity.hasLogo ? null : "logo_outro_logo_asset",
  ].filter((family): family is string => Boolean(family));
}

function directorDegradationsFromEvidence(
  productEvidencePack: SaasProductEvidencePack,
  disabledFamilies: string[],
): SaasDirectorDegradation[] {
  const degradations: SaasDirectorDegradation[] = [];
  if (disabledFamilies.includes("proof_metric")) {
    degradations.push({
      code: "proof_metric_substituted",
      severity: "warning",
      message: "No exact numeric proof claim is available; proof_metric scenes must become UI proof or be cut.",
    });
  }
  if (disabledFamilies.includes("social_proof")) {
    degradations.push({
      code: "social_proof_disabled",
      severity: "warning",
      message: "No verified customer/logo/testimonial evidence is available; social proof is disabled.",
    });
  }
  if (disabledFamilies.includes("logo_outro_logo_asset")) {
    degradations.push({
      code: "logo_outro_without_logo",
      severity: "warning",
      message: "No approved logo asset is available; logo outro may use product name text only.",
    });
  }
  return degradations;
}

function selectNarrationMode(
  input: NormalizedSaasExplainerIntake,
  defaultMode: string,
): SaasDirectorNarrationMode {
  if (input.script) return "vo";
  if (input.durationSec >= 75 && /founder|walkthrough|loom|voice/i.test(input.outcome ?? "")) return "founder_vo";
  if (input.durationSec <= 35 && !input.script) return "text_driven";
  return normalizeNarrationMode(defaultMode);
}

function candidateStructureIdForDuration(durationSec: number): string {
  if (durationSec <= 35) return "teaser_30s";
  if (durationSec <= 52) return "explainer_45s";
  if (durationSec <= 75) return "launch_60s";
  return "demo_90s";
}

function shouldUseFeatureParade(
  durationSec: number,
  productEvidencePack: SaasProductEvidencePack,
): boolean {
  const sourceText = [
    productEvidencePack.brief.productServices.join(" "),
    productEvidencePack.claimLedger.map((claim) => claim.text).join(" "),
  ].join(" ");
  return (
    durationSec >= 80 &&
    productEvidencePack.coverage.realProductEvidence &&
    productEvidencePack.brief.productServices.length >= 3 &&
    productEvidencePack.visualIdentity.productImages.length >= 3 &&
    /\b(version|release|launch|new|introduc)/i.test(sourceText)
  );
}

function hasDemo90Evidence(productEvidencePack: SaasProductEvidencePack): boolean {
  return (
    productEvidencePack.coverage.realProductEvidence &&
    productEvidencePack.visualIdentity.productImages.length >= 2 &&
    productEvidencePack.brief.productServices.length >= 2
  );
}

function hasMetricProof(productEvidencePack: SaasProductEvidencePack): boolean {
  return productEvidencePack.claimLedger.some((claim) => {
    return claim.admissible && claim.claimType === "proof" && /\d/.test(claim.text);
  });
}

function hasSocialProof(productEvidencePack: SaasProductEvidencePack): boolean {
  return productEvidencePack.claimLedger.some((claim) => {
    return claim.admissible && /customer|trusted|testimonial|quote|logo|teams use|used by/i.test(claim.text);
  });
}

function usesProductImage(family: SaasDirectorSceneFamily): boolean {
  return ["workflow_demo", "feature_demo", "ui_proof", "proof_metric", "comparison"].includes(family);
}

function copyRoleForFamily(family: SaasDirectorSceneFamily): string {
  const copyRoles: Record<SaasDirectorSceneFamily, string> = {
    hook: "earn attention with one product promise",
    problem: "name the grounded pain",
    promise: "compress positioning",
    workflow_demo: "explain the product workflow",
    feature_demo: "explain one sourced capability",
    ui_proof: "make the product evidence readable",
    proof_metric: "state exact sourced metric",
    comparison: "contrast sourced before/after states",
    social_proof: "show verified trust evidence",
    objection_handling: "answer verified objection",
    cta: "ask for the next action",
    logo_outro: "leave brand recall",
    section_header: "set up an immediately proven capability",
  };
  return copyRoles[family];
}

function normalizeSceneFamily(value: string): SaasDirectorSceneFamily {
  const normalized = value.trim();
  const validFamilies: SaasDirectorSceneFamily[] = [
    "hook",
    "problem",
    "promise",
    "workflow_demo",
    "feature_demo",
    "ui_proof",
    "proof_metric",
    "comparison",
    "social_proof",
    "objection_handling",
    "cta",
    "logo_outro",
    "section_header",
  ];
  return validFamilies.includes(normalized as SaasDirectorSceneFamily)
    ? normalized as SaasDirectorSceneFamily
    : "feature_demo";
}

function normalizeNarrationMode(value: string): SaasDirectorNarrationMode {
  const validModes: SaasDirectorNarrationMode[] = [
    "vo",
    "founder_vo",
    "talking_head",
    "testimonial_led",
    "text_driven",
    "ambient_demo",
  ];
  return validModes.includes(value as SaasDirectorNarrationMode) ? value as SaasDirectorNarrationMode : "vo";
}

function requireStructure(structures: RawGraphStoryStructure[], id: string): RawGraphStoryStructure {
  const structure = structures.find((candidate) => candidate.id === id);
  if (!structure) {
    throw new Error(`SaaS director could not find story structure: ${id}`);
  }
  return structure;
}

function numericStructureDuration(structure: RawGraphStoryStructure): number {
  if (typeof structure.duration === "number") return structure.duration;
  return structure.duration?.reference ?? structure.duration?.max ?? structure.duration?.min ?? 60;
}

function roundTime(value: number): number {
  return Math.round(value * 10) / 10;
}
