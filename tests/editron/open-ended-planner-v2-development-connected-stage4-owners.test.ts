import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import dev02BoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildConnectedDev01Stage4OwnerV2,
  buildConnectedDev02Stage4OwnerV2,
  buildConnectedDev03Stage4OwnerV2,
  buildConnectedDev04Stage4OwnerV2,
} from '@/lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import type { ConnectedDevelopmentStage4CompilerInputV2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage4-delegator-v2';
import {
  buildCanonicalDev03MeasuredEvidenceV2,
  buildCanonicalDev03BeatWithheldEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { getCanonicalDev04ConnectedChainV2 } from '@/lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2';

type JsonRecord = Record<string, unknown>;

const AUDIO_PATH = '.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav';
const ANALYZER_PATH = 'lib/editron/services/media/beat-detection-service.ts';

let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(AUDIO_PATH),
    readFile(ANALYZER_PATH),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('open-ended planner V2 connected Stage-4 task owners', () => {
  it('compiles DEV-01 from noncanonical but semantically valid actual artifacts', async () => {
    const canonical = getCanonicalDev01Stage123V2();
    const blueprint = structuredClone(canonical.referenceBlueprints.BASELINE) as JsonRecord;
    (blueprint.globalEditorialLanguage as JsonRecord[])[0].observation += ' Candidate wording.';
    const intent = structuredClone(canonical.editorialIntent) as JsonRecord;
    (intent.preservationIntents as JsonRecord[])[0].rule += ' Candidate wording.';
    const source = compilerInput({
      taskId: 'DEV-01',
      referenceBlueprint: blueprint,
      editorialIntent: intent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: canonical.evidenceBoundIntents.BASELINE,
    });
    expect(source.sourceEditorialIntentHash).not.toBe(hashCanonicalJsonV1(canonical.editorialIntent));
    const owner = buildConnectedDev01Stage4OwnerV2();
    const graph = await owner.compile(source);
    expect(graph).toMatchObject({
      artifactType: 'CompiledOperationGraphV2', taskId: 'DEV-01',
      sourceEditorialIntentHash: source.sourceEditorialIntentHash,
      sourceEvidenceBoundIntentHash: source.sourceEvidenceBoundIntentHash,
      evidencePackHash: source.evidencePackHash,
    });
    expect(owner.evaluate(graph, source)).toMatchObject({ disposition: 'PASS', diagnostics: [] });
  });

  it('binds DEV-02 generated measurements to alpha-renamed source claims', async () => {
    const symbols = new Map([
      ['claim-ref-five-panels', 'TC-owner-five-panels'],
      ['claim-ref-black-gutters', 'TC-owner-black-gutters'],
      ['claim-ref-yellow-two-line-title', 'TC-owner-title-form'],
      ['claim-ref-opposed-motion', 'TC-owner-opposed-motion'],
      ['claim-ref-green-centre-takeover', 'TC-owner-centre-takeover'],
      ['claim-ref-temporal-progression', 'TC-owner-temporal-progression'],
    ]);
    const source = compilerInput({
      taskId: 'DEV-02',
      referenceBlueprint: renameSymbols(dev02BlueprintJson, symbols),
      editorialIntent: renameSymbols(dev02IntentJson, symbols),
      evidencePack: renameSymbols(dev02EvidencePackJson, symbols),
      evidenceBoundIntent: renameSymbols(dev02BoundJson, symbols),
    });
    const owner = buildConnectedDev02Stage4OwnerV2();
    const graph = await owner.compile(source);
    expect(graph).toMatchObject({
      artifactType: 'CompiledDev02HybridResearchGraphV2',
      taskId: 'DEV-02',
      sourceEditorialIntentHash: source.sourceEditorialIntentHash,
      sourceEvidenceBoundIntentHash: source.sourceEvidenceBoundIntentHash,
      evidencePackHash: source.evidencePackHash,
    });
    expect(owner.evaluate(graph, source)).toMatchObject({ disposition: 'PASS', diagnostics: [] });
  });

  it('delegates DEV-03 to its existing measured native compiler and evaluator', async () => {
    const canonical = getCanonicalDev03Stage123V2({
      measuredEvidence: measured,
      withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
    });
    const source = compilerInput({
      taskId: 'DEV-03',
      referenceBlueprint: canonical.referenceBlueprints.BASELINE,
      editorialIntent: canonical.editorialIntent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: canonical.evidenceBoundIntents.BASELINE,
    });
    const owner = buildConnectedDev03Stage4OwnerV2(measured);
    const graph = await owner.compile(source);
    expect(graph).toMatchObject({
      artifactType: 'CompiledOperationGraphV2',
      taskId: 'DEV-03',
      sourceEditorialIntentHash: source.sourceEditorialIntentHash,
      sourceEvidenceBoundIntentHash: source.sourceEvidenceBoundIntentHash,
      evidencePackHash: source.evidencePackHash,
    });
    expect(owner.evaluate(graph, source)).toMatchObject({
      disposition: 'PASS', diagnostics: [],
    });
  });

  it('evaluates DEV-04 relative to alpha-renamed but semantically valid actual artifacts', async () => {
    const canonical = getCanonicalDev04ConnectedChainV2();
    const symbols = new Map([
      ['claim-selective-moving-occlusion', 'TC-owner-occlusion'],
      ['claim-title-visible-outside-overlap', 'TC-owner-visible'],
      ['claim-source-and-timing-preserved', 'TC-owner-source'],
      ['node-current-scene-inspection', 'IN-owner-inspection'],
      ['node-selective-occlusion', 'IN-owner-gap'],
      ['req-moving-matte-or-segmentation-track', 'UR-owner-gap'],
      ['bind-project-and-source', 'EB-owner-project'],
      ['bind-selective-occlusion-gap', 'EB-owner-gap'],
    ]);
    const blueprint = renameSymbols(canonical.referenceBlueprint, symbols);
    const intent = renameSymbols(canonical.editorialIntent, symbols);
    const bound = renameSymbols(canonical.evidenceBoundIntent, symbols);
    const source = compilerInput({
      taskId: 'DEV-04',
      referenceBlueprint: blueprint,
      editorialIntent: intent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: bound,
    });
    expect(source.sourceEditorialIntentHash).not.toBe(hashCanonicalJsonV1(canonical.editorialIntent));
    const owner = buildConnectedDev04Stage4OwnerV2();
    const graph = await owner.compile(source);
    expect(graph).toMatchObject({
      artifactType: 'CompiledOperationGraphV2',
      taskId: 'DEV-04',
      sourceEditorialIntentHash: source.sourceEditorialIntentHash,
      sourceEvidenceBoundIntentHash: source.sourceEvidenceBoundIntentHash,
      evidencePackHash: source.evidencePackHash,
      unresolvedIntentNodeIds: ['IN-owner-gap'],
    });
    expect(owner.evaluate(graph, source)).toMatchObject({
      disposition: 'EXPECTED_CAPABILITY_GAP', diagnostics: [],
    });
  });

  it('fails DEV-04 evaluation when a compiled graph drifts from its actual source', async () => {
    const canonical = getCanonicalDev04ConnectedChainV2();
    const source = compilerInput({
      taskId: 'DEV-04',
      referenceBlueprint: canonical.referenceBlueprint,
      editorialIntent: canonical.editorialIntent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: canonical.evidenceBoundIntent,
    });
    const owner = buildConnectedDev04Stage4OwnerV2();
    const graph = structuredClone(await owner.compile(source)) as JsonRecord;
    graph.sourceEditorialIntentHash = '0'.repeat(64);
    expect(owner.evaluate(graph, source)).toMatchObject({ disposition: 'FAIL' });
  });

  it('rejects cross-task owner use instead of compiling a substitute', () => {
    const canonical = getCanonicalDev04ConnectedChainV2();
    const source = compilerInput({
      taskId: 'DEV-04',
      referenceBlueprint: canonical.referenceBlueprint,
      editorialIntent: canonical.editorialIntent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: canonical.evidenceBoundIntent,
    });
    expect(() => buildConnectedDev03Stage4OwnerV2(measured).compile(source))
      .toThrow('CONNECTED_STAGE4_OWNER_TASK_MISMATCH:DEV-03/DEV-04');
  });
});

function compilerInput(input: {
  taskId: string;
  referenceBlueprint: Readonly<JsonRecord>;
  editorialIntent: Readonly<JsonRecord>;
  evidencePack: Readonly<JsonRecord>;
  evidenceBoundIntent: Readonly<JsonRecord>;
}): Readonly<ConnectedDevelopmentStage4CompilerInputV2> {
  return {
    taskId: input.taskId,
    conditionId: 'BASELINE',
    referenceBlueprint: input.referenceBlueprint,
    editorialIntent: input.editorialIntent,
    evidencePack: input.evidencePack,
    evidenceBoundIntent: input.evidenceBoundIntent,
    sourceReferenceBlueprintHash: hashCanonicalJsonV1(input.referenceBlueprint),
    sourceEditorialIntentHash: hashCanonicalJsonV1(input.editorialIntent),
    evidencePackHash: hashCanonicalJsonV1(input.evidencePack),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(input.evidenceBoundIntent),
  };
}

function renameSymbols<T>(value: T, symbols: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') return (symbols.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((entry) => renameSymbols(entry, symbols)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .map(([key, entry]) => [key, renameSymbols(entry, symbols)])) as T;
  }
  return value;
}
