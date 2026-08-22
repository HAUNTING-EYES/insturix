import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertStage25ProviderDependencyCohortManifestV1,
  type Stage25ProviderDependencyCohortManifestV1,
} from './stage25-provider-dependency-cohort-v1';
import {
  buildStage25ProviderDependencyToolSetV1,
  buildStage25ProviderDependencyTraceV1,
  evaluateStage25ProviderDependencyHoldoutV1,
  STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1,
} from './stage25-provider-dependency-holdout-v1';
import { Stage25ProviderDependencyOwnerV1 }
  from './stage25-provider-dependency-owner-v1';
import { projectProviderTraceForStage25ScheduleV1 }
  from './stage25-provider-trace-schedule-binding-v1';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export type Stage25ProviderDependencyTransportFactoryV1 = (input: Readonly<{
  route: Readonly<ProviderNativeRouteV2R>;
  rowId: string;
  presentationOrdinal: number;
}>) => Readonly<{
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>;
  snapshot: () => unknown;
}>;

export async function runStage25ProviderDependencyCohortV1(input: {
  manifest: Readonly<Stage25ProviderDependencyCohortManifestV1>;
  outputRoot: string;
  createTransport: Stage25ProviderDependencyTransportFactoryV1;
  routeIds?: readonly string[];
  presentationOrdinals?: readonly number[];
}): Promise<Readonly<JsonRecord>> {
  const manifest = assertStage25ProviderDependencyCohortManifestV1(input.manifest);
  const routes = selectRoutes(manifest, input.routeIds);
  const presentations = selectPresentations(manifest, input.presentationOrdinals);
  await mkdir(path.dirname(input.outputRoot), { recursive: true });
  await mkdir(input.outputRoot, { recursive: false });
  const rows: JsonRecord[] = [];
  for (const routeEntry of routes) for (const presentation of presentations) {
    const rowId = `${routeEntry.route.routeId.toLowerCase()}-p${presentation.ordinal}`;
    const rowRoot = path.join(input.outputRoot, 'rows', rowId);
    await mkdir(rowRoot, { recursive: true });
    const startedAt = Date.now();
    let transport: ReturnType<Stage25ProviderDependencyTransportFactoryV1> | undefined;
    try {
      transport = input.createTransport({
        route: routeEntry.route,
        rowId,
        presentationOrdinal: presentation.ordinal,
      });
      const owner = new Stage25ProviderDependencyOwnerV1();
      const episode = await runProviderNativeToolEpisodeV2R({
        route: routeEntry.route,
        context: manifest.context,
        eligibleOperatorIds: presentation.operatorOrder,
        argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
        invoke: transport.invoke,
        executeIsolated: (call) => owner.execute(call),
      });
      const trace = buildStage25ProviderDependencyTraceV1({
        providerEpisode: episode,
        context: manifest.context,
      });
      const ownerSnapshot = owner.snapshot();
      const evaluation = evaluateStage25ProviderDependencyHoldoutV1({
        providerEpisode: episode,
        context: manifest.context,
        trace,
        ownerSnapshot,
      });
      let schedule: Readonly<JsonRecord> | null = null;
      let scheduleRejection: string | null = null;
      if (evaluation.assessment === 'PASS') {
        try {
          schedule = projectProviderTraceForStage25ScheduleV1({
            taskId: STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1,
            providerEpisode: episode,
            selectedOperationTrace: trace,
            episodeContext: manifest.context,
            toolSet: buildStage25ProviderDependencyToolSetV1(
              presentation.operatorOrder,
            ),
          });
        } catch (error) {
          const rejection = boundedError(error);
          if (!isProviderScheduleRejection(rejection)) throw error;
          scheduleRejection = rejection;
        }
      }
      const assessment = assessRow(episode.terminal.disposition, evaluation, schedule);
      const row = {
        rowId,
        routeId: routeEntry.route.routeId,
        model: routeEntry.route.model,
        presentationOrdinal: presentation.ordinal,
        operatorOrderPresented: presentation.operatorOrder,
        assessment,
        elapsedMs: Date.now() - startedAt,
        episode,
        trace,
        ownerSnapshot,
        evaluation,
        schedule,
        scheduleRejection,
        transport: transport.snapshot(),
        stateEffects: [] as const,
      };
      rows.push(row);
      await writeJson(path.join(rowRoot, 'row.json'), row);
    } catch (error) {
      const row = {
        rowId,
        routeId: routeEntry.route.routeId,
        model: routeEntry.route.model,
        presentationOrdinal: presentation.ordinal,
        operatorOrderPresented: presentation.operatorOrder,
        assessment: 'HARNESS_ERROR',
        elapsedMs: Date.now() - startedAt,
        error: boundedError(error),
        transport: transport?.snapshot() ?? null,
        stateEffects: [] as const,
      };
      rows.push(row);
      await writeJson(path.join(rowRoot, 'row.json'), row);
    }
  }
  const material = {
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    rowCount: rows.length,
    rows,
    passCount: count(rows, 'PASS'),
    failCount: count(rows, 'FAIL'),
    providerInfrastructureUnverifiableCount: count(
      rows, 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE',
    ),
    harnessErrorCount: count(rows, 'HARNESS_ERROR'),
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
  await writeJson(path.join(input.outputRoot, 'cohort-receipt.json'), receipt);
  return receipt;
}

function assessRow(
  terminal: string,
  evaluation: Readonly<JsonRecord>,
  schedule: Readonly<JsonRecord> | null,
): 'PASS' | 'FAIL' | 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE' {
  if (['PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR'].includes(terminal)) {
    return 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE';
  }
  if (evaluation.assessment !== 'PASS' || !schedule) return 'FAIL';
  const receipt = record(schedule.receipt);
  return receipt.zeroAdd === true && receipt.zeroDrop === true ? 'PASS' : 'FAIL';
}

function selectRoutes(
  manifest: Readonly<Stage25ProviderDependencyCohortManifestV1>,
  requested: readonly string[] | undefined,
) {
  if (!requested?.length) return [...manifest.routes];
  const wanted = new Set(requested);
  const selected = manifest.routes.filter(({ route }) => wanted.has(route.routeId));
  if (selected.length !== wanted.size) fail('ROUTE_SELECTION_INVALID');
  return selected;
}

function selectPresentations(
  manifest: Readonly<Stage25ProviderDependencyCohortManifestV1>,
  requested: readonly number[] | undefined,
) {
  if (!requested?.length) return [...manifest.presentations];
  const wanted = new Set(requested);
  const selected = manifest.presentations.filter(({ ordinal }) => wanted.has(ordinal));
  if (selected.length !== wanted.size) fail('PRESENTATION_SELECTION_INVALID');
  return selected;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}
function count(rows: readonly JsonRecord[], assessment: string): number {
  return rows.filter((row) => row.assessment === assessment).length;
}
function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
function isProviderScheduleRejection(message: string): boolean {
  return [
    'REFERENCE_TARGET_INVALID',
    'REFERENCE_ORIGIN_MISSING',
    'REFERENCE_ORIGIN_NOT_PRIOR',
    'REFERENCE_BINDING_INVALID',
    'WRITER_REVISION_HANDOFF_INVALID',
    'BASE_REVISION_INPUT_INVALID',
    'WRITER_REVISION_NOT_ADVANCED',
  ].some((code) => message.includes(`STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_${code}`));
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function fail(code: string): never {
  throw new Error(`STAGE25_PROVIDER_DEPENDENCY_RUNNER_${code}`);
}
