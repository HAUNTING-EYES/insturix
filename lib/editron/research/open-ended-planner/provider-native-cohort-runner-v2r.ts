import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertProviderNativeCohortManifestV2R,
  type ProviderNativeCohortCaseV2R,
  type ProviderNativeCohortManifestV2R,
  type ProviderNativeCohortRouteV2R,
} from './provider-native-cohort-manifest-v2r';
import { runProviderNativeDev01ConnectedEpisodeV2R } from './provider-native-dev01-connected-episode-v2r';
import { runProviderNativeDev02ConnectedEpisodeV2R } from './provider-native-dev02-connected-episode-v2r';
import { generateProviderNativeDev02SourceV2R } from './provider-native-dev02-source-adapter-v2r';
import { runProviderNativeDev03ConnectedEpisodeV2R } from './provider-native-dev03-connected-episode-v2r';
import { runProviderNativeDev04ConnectedEpisodeV2R } from './provider-native-dev04-connected-episode-v2r';
import { createProviderNativeLiveTransportV2R } from './provider-native-live-transport-v2r';

type JsonRecord = Record<string, unknown>;
export type ProviderNativeCohortRowAssessmentV2R =
  | 'PASS'
  | 'FAIL'
  | 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE'
  | 'HARNESS_ERROR';

export interface ProviderNativeCohortExecutionReceiptV2R {
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  manifestSha256: string;
  repetitions: number;
  rows: readonly Readonly<JsonRecord>[];
  passCount: number;
  failCount: number;
  providerInfrastructureUnverifiableCount: number;
  harnessErrorCount: number;
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runProviderNativeCohortV2R(input: {
  manifest: Readonly<ProviderNativeCohortManifestV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  outputRoot: string;
  apiImplementationHash: string;
  repetitions?: number;
  routeIds?: readonly string[];
  caseIds?: readonly string[];
}): Promise<Readonly<ProviderNativeCohortExecutionReceiptV2R>> {
  const manifest = assertProviderNativeCohortManifestV2R(input.manifest);
  if (manifest.blockerCodes.length) throw new Error('PROVIDER_NATIVE_COHORT_DISPATCH_BLOCKED');
  const repetitions = input.repetitions ?? manifest.repetitionsPerRouteCase;
  if (!Number.isSafeInteger(repetitions) || repetitions < 1
    || repetitions > manifest.repetitionsPerRouteCase) {
    throw new Error('PROVIDER_NATIVE_COHORT_REPETITION_INVALID');
  }
  const routes = select(manifest.routes, input.routeIds, ({ route }) => route.routeId, 'ROUTE');
  const cases = select(manifest.cases, input.caseIds, ({ caseId }) => caseId, 'CASE');
  await mkdir(path.dirname(input.outputRoot), { recursive: true });
  await mkdir(input.outputRoot, { recursive: false });
  const rows: JsonRecord[] = [];
  for (const routeEntry of routes) for (const caseEntry of cases) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const row = await runOne({ ...input, routeEntry, caseEntry, repetition });
      rows.push(row);
      await writeJson(path.join(input.outputRoot, 'rows', rowId(routeEntry, caseEntry, repetition), 'row.json'), row);
    }
  }
  const counts = summarizeProviderNativeCohortRowsV2R(rows);
  const material = {
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256, repetitions, rows,
    ...counts, stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
  await writeJson(path.join(input.outputRoot, 'cohort-receipt.json'), receipt);
  return receipt;
}

async function runOne(input: {
  manifest: Readonly<ProviderNativeCohortManifestV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  outputRoot: string;
  apiImplementationHash: string;
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>;
  caseEntry: Readonly<ProviderNativeCohortCaseV2R>;
  repetition: number;
}): Promise<JsonRecord> {
  const { routeEntry, caseEntry, repetition } = input;
  const id = rowId(routeEntry, caseEntry, repetition);
  const rowRoot = path.join(input.outputRoot, 'rows', id);
  await mkdir(rowRoot, { recursive: true });
  const transport = createProviderNativeLiveTransportV2R({ environment: input.environment });
  const generatedCalls: JsonRecord[] = [];
  const createdAt = new Date().toISOString();
  try {
    const receipt = await dispatch({
      routeEntry, caseEntry, rowRoot, id, createdAt, invoke: transport.invoke,
      generateSource: async (request) => {
        const result = await generateProviderNativeDev02SourceV2R({
          routeEntry, environment: input.environment,
          apiImplementationHash: input.apiImplementationHash, request,
        });
        generatedCalls.push(result.generationReceipt as JsonRecord);
        return result;
      },
    });
    const actualOutcome = text(record(receipt).productOutcome);
    const expectedOutcome = expectedProviderNativeOutcomeV2R(caseEntry.caseId);
    const assessment = assessProviderNativeCohortRowV2R(expectedOutcome, actualOutcome);
    const row = {
      rowId: id, routeId: routeEntry.route.routeId, model: routeEntry.route.model,
      caseId: caseEntry.caseId, repetition, expectedOutcome, actualOutcome, assessment,
      receipt, transport: transport.snapshot(), generatedCalls,
      stateEffects: [],
    };
    await writeJson(path.join(rowRoot, 'episode-receipt.json'), row);
    return row;
  } catch (error) {
    return {
      rowId: id, routeId: routeEntry.route.routeId, model: routeEntry.route.model,
      caseId: caseEntry.caseId, repetition,
      expectedOutcome: expectedProviderNativeOutcomeV2R(caseEntry.caseId),
      actualOutcome: 'HARNESS_ERROR', assessment: 'HARNESS_ERROR',
      error: boundedError(error), transport: transport.snapshot(), generatedCalls,
      stateEffects: [],
    };
  }
}

async function dispatch(input: {
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>;
  caseEntry: Readonly<ProviderNativeCohortCaseV2R>;
  rowRoot: string;
  id: string;
  createdAt: string;
  invoke: ReturnType<typeof createProviderNativeLiveTransportV2R>['invoke'];
  generateSource: Parameters<typeof runProviderNativeDev02ConnectedEpisodeV2R>[0]['generateSource'];
}): Promise<unknown> {
  const common = {
    route: input.routeEntry.route, context: input.caseEntry.context,
    invoke: input.invoke, executionId: input.id, createdAt: input.createdAt,
  };
  if (input.caseEntry.taskId === 'DEV-01') return runProviderNativeDev01ConnectedEpisodeV2R({
    ...common, outputDir: path.join(input.rowRoot, 'render'),
  });
  if (input.caseEntry.taskId === 'DEV-02') return runProviderNativeDev02ConnectedEpisodeV2R({
    ...common, outputRoot: path.join(input.rowRoot, 'render'), generateSource: input.generateSource,
  });
  if (input.caseEntry.taskId === 'DEV-03') return runProviderNativeDev03ConnectedEpisodeV2R({
    ...common, outputDir: path.join(input.rowRoot, 'render'),
  });
  if (input.caseEntry.taskId === 'DEV-04') return runProviderNativeDev04ConnectedEpisodeV2R(common);
  throw new Error(`PROVIDER_NATIVE_COHORT_TASK_UNSUPPORTED:${input.caseEntry.taskId}`);
}

export function expectedProviderNativeOutcomeV2R(caseId: string): string {
  if (caseId === 'DEV-01:VISUAL_EVIDENCE_WITHHELD'
    || caseId === 'DEV-03:BEAT_EVIDENCE_WITHHELD') return 'UNVERIFIABLE';
  return 'PASS';
}

export function assessProviderNativeCohortRowV2R(
  expectedOutcome: string,
  actualOutcome: string,
): ProviderNativeCohortRowAssessmentV2R {
  if (actualOutcome === 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE') {
    return 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE';
  }
  return actualOutcome === expectedOutcome ? 'PASS' : 'FAIL';
}

export function summarizeProviderNativeCohortRowsV2R(
  rows: readonly Readonly<JsonRecord>[],
): Readonly<{
  passCount: number;
  failCount: number;
  providerInfrastructureUnverifiableCount: number;
  harnessErrorCount: number;
}> {
  return {
    passCount: count(rows, 'PASS'),
    failCount: count(rows, 'FAIL'),
    providerInfrastructureUnverifiableCount: count(
      rows,
      'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE',
    ),
    harnessErrorCount: count(rows, 'HARNESS_ERROR'),
  };
}

function select<T>(values: readonly T[], requested: readonly string[] | undefined, id: (value: T) => string, label: string): T[] {
  if (!requested?.length) return [...values];
  const wanted = new Set(requested);
  const selected = values.filter((value) => wanted.has(id(value)));
  if (selected.length !== wanted.size) throw new Error(`PROVIDER_NATIVE_COHORT_${label}_SELECTION_INVALID`);
  return selected;
}
function rowId(route: Readonly<ProviderNativeCohortRouteV2R>, taskCase: Readonly<ProviderNativeCohortCaseV2R>, repetition: number): string {
  return `${route.route.routeId.toLowerCase()}-${taskCase.caseId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-r${repetition}`;
}
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
function boundedError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 2_000); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function count(rows: readonly Readonly<JsonRecord>[], assessment: ProviderNativeCohortRowAssessmentV2R): number {
  return rows.filter((row) => row.assessment === assessment).length;
}
