import canonicalBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import {
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

import { cloneCanonicalJsonV1, hashCanonicalJsonV1 } from './contracts-v1';
import { compileDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-compiler-v2';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2 } from './generated-composition-research-proxy-capability-v2';
import type { GeneratedCompositionProgramV1 } from './generated-composition-program-v1';
import { compileStage4DeterministicBaselineV2 } from './stage4-deterministic-compiler-v2';
import { compileStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-compiler-v2';

/**
 * Assembles the current DEV-02 research fixture through existing sole owners.
 * It supplies versioned inputs only; it does not lower, resolve, or mutate form.
 */
export function buildCurrentDev02HybridResearchGraphV2(): Readonly<Record<string, unknown>> {
  const sourceCompilationSource = {
    referenceBlueprint: canonicalReferenceJson,
    editorialIntent: canonicalIntentJson,
    evidenceBoundIntent: canonicalBoundJson,
    evidencePack: evidencePackJson,
  };
  const sourceBlockedGraph = compileStage4DeterministicBaselineV2(sourceCompilationSource);
  const program = cloneCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_PROGRAM_V1) as GeneratedCompositionProgramV1;
  program.projectBinding = {
    ...program.projectBinding,
    evidencePackHash: hashCanonicalJsonV1(evidencePackJson),
  };
  program.referenceBinding = {
    ...program.referenceBinding,
    blueprintHash: hashCanonicalJsonV1(canonicalReferenceJson),
  };
  const islandEvaluationSource = { sourceBlockedGraph, sourceCompilationSource };
  const islandGraph = compileStage4ResearchProxyPreviewV2({
    program,
    sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack: evidencePackJson,
    referenceBlueprint: canonicalReferenceJson,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2,
    sourceBlockedGraph,
    sourceCompilationSource,
  });
  return compileDev02HybridStage4GraphV2({ islandGraph, islandEvaluationSource });
}
