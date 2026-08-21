import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  compileCanonicalDev04CapabilityGapV2,
  evaluateDev04Stage4CapabilityGapV2,
  getCanonicalDev04ConnectedChainV2,
} from './dev04-capability-gap-chain-v2';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
  type ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  isProviderNativeInfrastructureTerminalV2R,
  type ProviderNativeProductOutcomeV2R,
} from './provider-native-product-outcome-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_DEV04_CONNECTED_EPISODE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DEV04_CONNECTED_EPISODE_V2R_3' as const;

const READ_OPERATORS = new Set([
  'read_project_file', 'get_timeline_view', 'find_visual_moment', 'resolve_visual_edit',
]);
const UNSAFE_SUBSTITUTES = new Set([
  'set_keyframes', 'reorder_layer', 'generated_composition_program',
]);

export interface ProviderNativeDev04ConnectedReceiptV2R {
  version: typeof PROVIDER_NATIVE_DEV04_CONNECTED_EPISODE_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  capabilityGapGraph: Readonly<JsonRecord>;
  capabilityGapEvaluation: Readonly<JsonRecord>;
  execution: Readonly<JsonRecord>;
  productOutcome: ProviderNativeProductOutcomeV2R;
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runProviderNativeDev04ConnectedEpisodeV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  invoke: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<ProviderNativeInvokeResponseV2R>;
}): Promise<Readonly<ProviderNativeDev04ConnectedReceiptV2R>> {
  const session = new Dev04ReadOnlySession(input.context);
  const providerEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: input.context,
    eligibleOperatorIds: [
      'read_project_file', 'get_timeline_view', 'find_visual_moment',
      'resolve_visual_edit', 'set_keyframes', 'reorder_layer',
      'generated_composition_program',
    ],
    invoke: input.invoke,
    executeIsolated: (call) => session.execute(call),
  });
  const capabilityGapGraph = compileCanonicalDev04CapabilityGapV2();
  const capabilityGapEvaluation = evaluateDev04Stage4CapabilityGapV2(capabilityGapGraph);
  const finalized = finalize(
    providerEpisode,
    session.snapshot(),
    capabilityGapEvaluation,
    collectCapabilityGapEvidenceRefs(input.context.evidence),
  );
  const material = {
    version: PROVIDER_NATIVE_DEV04_CONNECTED_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    providerEpisode,
    capabilityGapGraph,
    capabilityGapEvaluation,
    execution: finalized.execution,
    productOutcome: finalized.productOutcome,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

class Dev04ReadOnlySession {
  private readonly fixture = getCanonicalDev04ConnectedChainV2();
  private readonly evidenceIds: ReadonlySet<string>;
  private readonly initialStateHash: string;
  private readonly trace: JsonRecord[] = [];
  private readonly attemptedUnsafeSubstitutes = new Set<string>();

  constructor(private readonly context: Readonly<ProviderNativeEpisodeContextV2R>) {
    this.evidenceIds = new Set(collectEvidenceIds(context.evidence));
    this.initialStateHash = hashCanonicalJsonV1(context.projectState);
  }

  async execute(call: Readonly<{
    operatorId: string; arguments: Readonly<JsonRecord>; turn: number;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
    try {
      this.assertIdentity(call.operatorId, call.arguments);
      if (UNSAFE_SUBSTITUTES.has(call.operatorId)) {
        this.attemptedUnsafeSubstitutes.add(call.operatorId);
        throw new Error(`PROVIDER_NATIVE_DEV04_UNSAFE_SUBSTITUTE:${call.operatorId}`);
      }
      if (!READ_OPERATORS.has(call.operatorId)) {
        throw new Error(`PROVIDER_NATIVE_DEV04_OPERATOR_UNSUPPORTED:${call.operatorId}`);
      }
      if (call.operatorId === 'resolve_visual_edit') {
        return this.nonOk(call, 'UNVERIFIABLE',
          'PROVIDER_NATIVE_DEV04_MOVING_MATTE_CAPABILITY_MISSING');
      }
      const output = this.readOutput(call.operatorId);
      this.trace.push(this.traceEntry(call, 'OK', output));
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition: 'OK', output, evidenceIds: collectEvidenceIds(output),
      };
    } catch (error) {
      const message = errorMessage(error);
      return this.nonOk(call, message.includes('REVISION_DRIFT') ? 'CONFLICT' : 'FAIL', message);
    }
  }

  snapshot(): Readonly<JsonRecord> {
    return deepFreezeV1({
      initialStateHash: this.initialStateHash,
      finalStateHash: hashCanonicalJsonV1(this.context.projectState),
      attemptedUnsafeSubstitutes: [...this.attemptedUnsafeSubstitutes].sort(compareUtf16),
      trace: clone(this.trace),
      stateEffects: [],
    });
  }

  private assertIdentity(operatorId: string, args: Readonly<JsonRecord>): void {
    if (args.projectId !== undefined && args.projectId !== 'oe-dev-04') {
      throw new Error(`PROVIDER_NATIVE_DEV04_PROJECT_ID_DRIFT:${operatorId}`);
    }
    if (args.expectedProjectRevision !== undefined && args.expectedProjectRevision !== 'R2') {
      throw new Error(`PROVIDER_NATIVE_DEV04_REVISION_DRIFT:${operatorId}`);
    }
    const supplied = strings(args.evidenceIds);
    if (supplied.some((evidenceId) => !this.evidenceIds.has(evidenceId))) {
      throw new Error(`PROVIDER_NATIVE_DEV04_EVIDENCE_ID_UNKNOWN:${operatorId}`);
    }
  }

  private readOutput(operatorId: string): JsonRecord {
    const pack = this.fixture.evidencePacks.BASELINE;
    const visual = records(pack.facts).find(({ kind }) => kind === 'VISUAL_OCCLUSION_OBSERVATION');
    const support = records(pack.facts).find(({ kind }) => kind === 'CAPABILITY_SUPPORT');
    if (operatorId === 'read_project_file') {
      return { result: clone(this.context.projectState), evidence: {
        projectId: 'oe-dev-04', expectedProjectRevision: 'R2', stateEffects: [],
      } };
    }
    if (operatorId === 'get_timeline_view') {
      return { result: {
        projectId: 'oe-dev-04', expectedProjectRevision: 'R2',
        targetRange: { startFrame: 0, endFrame: 240 },
        overlays: [
          { id: 'dev04-crossing', type: 'video', from: 0, durationInFrames: 240 },
          { id: 'dev04-title', type: 'text', from: 0, durationInFrames: 240 },
        ],
      }, evidence: { evidenceIds: ['EV-DEV04-V1'] } };
    }
    return {
      result: { visualObservation: visual, capabilitySupport: support },
      evidence: { evidenceIds: ['EV-DEV04-V1'] },
      overlayId: 0,
      targetFrame: 120,
      focalPoint: { x: 0.5, y: 0.5 },
      evidenceStrength: 1,
    };
  }

  private nonOk(
    call: Readonly<{ operatorId: string; arguments: Readonly<JsonRecord>; turn: number }>,
    disposition: 'FAIL' | 'UNVERIFIABLE' | 'CONFLICT',
    message: string,
  ): Readonly<ProviderNativeToolExecutionV2R> {
    const output = { code: message.split(':', 1)[0], message,
      details: { missingCapabilityId: 'moving-matte-or-segmentation-track' } };
    this.trace.push(this.traceEntry(call, disposition, output));
    return {
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition,
      output, evidenceIds: this.evidenceIds.has('EV-DEV04-V1') ? ['EV-DEV04-V1'] : [],
    };
  }

  private traceEntry(
    call: Readonly<{ operatorId: string; arguments: Readonly<JsonRecord>; turn: number }>,
    disposition: string,
    output: JsonRecord,
  ): JsonRecord {
    return {
      turn: call.turn, operatorId: call.operatorId, disposition,
      argumentHash: hashCanonicalJsonV1(call.arguments), outputHash: hashCanonicalJsonV1(output),
      beforeStateHash: this.initialStateHash, afterStateHash: this.initialStateHash,
      changedPaths: [],
    };
  }
}

function finalize(
  episode: Readonly<ProviderNativeEpisodeReceiptV2R>, snapshot: Readonly<JsonRecord>,
  evaluation: Readonly<{ disposition: string; diagnostics: readonly string[] }>,
  capabilityGapEvidenceRefs: ReadonlySet<string>,
): Readonly<{ execution: JsonRecord; productOutcome: ProviderNativeProductOutcomeV2R }> {
  if (isProviderNativeInfrastructureTerminalV2R(episode.terminal.disposition)) {
    return deepFreezeV1({
      productOutcome: 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE' as const,
      execution: {
        disposition: 'NOT_RUN_PROVIDER_TERMINAL',
        reasonCodes: [episode.terminal.disposition],
        stateUnchanged: snapshot.initialStateHash === snapshot.finalStateHash,
        session: snapshot,
      },
    });
  }
  const unsafe = strings(snapshot.attemptedUnsafeSubstitutes);
  const terminalText = [episode.terminal.summary, ...episode.terminal.reasonCodes].join(' ');
  const acknowledgesMissingOwner = /capability|matte|mask|segment|rotoscop/i.test(terminalText)
    && episode.terminal.evidenceIds.some((evidenceRef) => capabilityGapEvidenceRefs.has(evidenceRef));
  const stateUnchanged = snapshot.initialStateHash === snapshot.finalStateHash;
  const pass = episode.terminal.disposition === 'CAPABILITY_GAP'
    && acknowledgesMissingOwner && !unsafe.length && stateUnchanged
    && evaluation.disposition === 'CAPABILITY_BLOCKED' && !evaluation.diagnostics.length;
  const productOutcome: ProviderNativeProductOutcomeV2R = pass ? 'PASS'
    : episode.terminal.disposition === 'CONFLICT' ? 'CONFLICT'
    : episode.terminal.disposition === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL';
  return deepFreezeV1({
    productOutcome,
    execution: {
      disposition: pass ? 'PASS_EXPECTED_CAPABILITY_GAP' : 'FAIL',
      reasonCodes: pass ? ['HONEST_CAPABILITY_GAP_NO_EXECUTION'] : [
        unsafe.length ? 'UNSAFE_SUBSTITUTE_ATTEMPTED' : 'EXPECTED_CAPABILITY_GAP_NOT_PROVEN',
      ],
      stateUnchanged, session: snapshot,
    },
  });
}

function collectCapabilityGapEvidenceRefs(evidence: readonly JsonRecord[]): ReadonlySet<string> {
  const refs = new Set<string>();
  for (const fact of evidence) {
    const relevant = fact.kind === 'VISUAL_OCCLUSION_OBSERVATION'
      || (fact.kind === 'CAPABILITY_SUPPORT'
        && fact.supportStatus === 'MISSING'
        && fact.compilerEligibility === 'NOT_COMPILABLE');
    if (!relevant) continue;
    for (const key of ['factId', 'evidenceId'] as const) {
      if (typeof fact[key] === 'string' && fact[key].trim()) refs.add(fact[key]);
    }
  }
  return refs;
}

function collectEvidenceIds(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (entry: unknown, key = ''): void => {
    if (typeof entry === 'string' && (key === 'evidenceId' || key === 'evidenceIds')) found.add(entry);
    else if (Array.isArray(entry)) entry.forEach((item) => visit(item, key));
    else if (entry && typeof entry === 'object') {
      Object.entries(entry as JsonRecord).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  return [...found].sort(compareUtf16);
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unknown DEV-04 error'; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
