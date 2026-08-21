import { hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ProviderNativeEpisodeContextV2R,
  ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

const READ_OR_RESOLVE = new Set([
  'read_project_file', 'get_timeline_view', 'list_user_assets', 'search_user_assets',
  'inspect_user_asset', 'resolve_user_asset_overlay',
]);
const UNSAFE_NATIVE_SUBSTITUTES = new Set([
  'add_overlay', 'update_overlay', 'set_keyframes', 'reorder_layer', 'move_retime_overlay',
]);

export interface ProviderNativeDev02SessionSnapshotV2R {
  initialStateHash: string;
  finalStateHash: string;
  generatedSucceeded: boolean;
  attemptedUnsafeSubstitutes: readonly string[];
  trace: readonly Readonly<JsonRecord>[];
  stateEffects: readonly [];
}

export class ProviderNativeDev02IsolatedSessionV2R {
  private readonly evidenceIds: ReadonlySet<string>;
  private readonly initialStateHash: string;
  private readonly trace: JsonRecord[] = [];
  private readonly attemptedUnsafeSubstitutes = new Set<string>();
  private generatedSucceeded = false;

  constructor(
    private readonly context: Readonly<ProviderNativeEpisodeContextV2R>,
    private readonly executeGenerated: (
      args: Readonly<JsonRecord>, turn: number,
    ) => Promise<Readonly<ProviderNativeToolExecutionV2R>>,
  ) {
    this.evidenceIds = new Set(collectEvidenceIds(context.evidence));
    this.initialStateHash = hashCanonicalJsonV1(context.projectState);
  }

  async execute(call: Readonly<{
    operatorId: string; arguments: Readonly<JsonRecord>; turn: number;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
    try {
      this.assertIdentity(call.operatorId, call.arguments);
      if (call.operatorId === 'generated_composition_program') {
        if (this.generatedSucceeded) throw new Error('PROVIDER_NATIVE_DEV02_GENERATED_CALL_REPEATED');
        const execution = await this.executeGenerated(call.arguments, call.turn);
        if (execution.disposition === 'OK') this.generatedSucceeded = true;
        this.record(call, execution.disposition, execution.output);
        return execution;
      }
      if (UNSAFE_NATIVE_SUBSTITUTES.has(call.operatorId)) {
        this.attemptedUnsafeSubstitutes.add(call.operatorId);
        throw new Error(`PROVIDER_NATIVE_DEV02_UNAUTHORIZED_NATIVE_SUBSTITUTE:${call.operatorId}`);
      }
      if (!READ_OR_RESOLVE.has(call.operatorId)) {
        throw new Error(`PROVIDER_NATIVE_DEV02_OPERATOR_UNSUPPORTED:${call.operatorId}`);
      }
      const output = this.readOutput(call.operatorId, call.arguments);
      this.record(call, 'OK', output);
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
        output, evidenceIds: collectEvidenceIds(output),
      };
    } catch (error) {
      const message = errorMessage(error);
      const disposition = message.includes('REVISION_DRIFT') || message.includes('PROJECT_ID_DRIFT')
        ? 'CONFLICT' as const : 'FAIL' as const;
      const output = { code: message.split(':', 1)[0], message };
      this.record(call, disposition, output);
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition, output,
        evidenceIds: [],
      };
    }
  }

  snapshot(): Readonly<ProviderNativeDev02SessionSnapshotV2R> {
    return {
      initialStateHash: this.initialStateHash,
      finalStateHash: hashCanonicalJsonV1(this.context.projectState),
      generatedSucceeded: this.generatedSucceeded,
      attemptedUnsafeSubstitutes: [...this.attemptedUnsafeSubstitutes].sort(compareUtf16),
      trace: clone(this.trace), stateEffects: [],
    };
  }

  private assertIdentity(operatorId: string, args: Readonly<JsonRecord>): void {
    if (args.projectId !== undefined && args.projectId !== 'oe-dev-02') {
      throw new Error(`PROVIDER_NATIVE_DEV02_PROJECT_ID_DRIFT:${operatorId}`);
    }
    if (args.expectedProjectRevision !== undefined && args.expectedProjectRevision !== 'R3') {
      throw new Error(`PROVIDER_NATIVE_DEV02_REVISION_DRIFT:${operatorId}`);
    }
    if (strings(args.evidenceIds).some((id) => !this.evidenceIds.has(id))) {
      throw new Error(`PROVIDER_NATIVE_DEV02_EVIDENCE_ID_UNKNOWN:${operatorId}`);
    }
  }

  private readOutput(operatorId: string, args: Readonly<JsonRecord>): JsonRecord {
    const assets = this.sourceFacts().map((fact) => ({
      assetId: fact.assetId, assetVersion: fact.assetVersion,
      rightsStatus: fact.rightsStatus, extent: fact.extent,
    }));
    const evidence = { evidenceIds: ['EV-DEV02-S1', 'EV-DEV02-C1'] };
    if (operatorId === 'read_project_file') {
      return { result: clone(this.context.projectState), evidence };
    }
    if (operatorId === 'get_timeline_view') {
      return { result: {
        projectId: 'oe-dev-02', expectedProjectRevision: 'R3',
        targetRange: { startFrame: 0, endFrame: 345 },
        overlays: [{ id: 'ov-next', assetId: 'dev02-close', from: 180, durationInFrames: 165 }],
      }, evidence };
    }
    if (operatorId === 'list_user_assets' || operatorId === 'search_user_assets') {
      return { assets, evidence };
    }
    if (operatorId === 'inspect_user_asset') {
      const asset = assets.find((candidate) => candidate.assetId === args.assetId);
      if (!asset) throw new Error('PROVIDER_NATIVE_DEV02_ASSET_UNKNOWN');
      return { result: { ...asset, allowedWindows: this.allowedWindows(args.assetId) }, evidence };
    }
    const asset = assets.find((candidate) => candidate.assetId === args.assetId);
    if (!asset) throw new Error('PROVIDER_NATIVE_DEV02_ASSET_UNKNOWN');
    return {
      proposedOperation: {
        targetOperatorId: 'generated_composition_program',
        arguments: { assetId: args.assetId, targetRange: args.targetRange },
      },
      evidence,
    };
  }

  private sourceFacts(): JsonRecord[] {
    return this.context.evidence.filter((fact) => fact.kind === 'SOURCE_MEDIA_IDENTITY') as JsonRecord[];
  }

  private allowedWindows(assetId: unknown): unknown {
    const fact = this.context.evidence.find((candidate) => candidate.kind === 'ALLOWED_SOURCE_WINDOWS');
    return records(fact?.windows).find((entry) => entry.assetId === assetId)?.ranges ?? [];
  }

  private record(call: Readonly<{ operatorId: string; arguments: Readonly<JsonRecord>; turn: number }>, disposition: string, output: JsonRecord): void {
    this.trace.push({
      turn: call.turn, operatorId: call.operatorId, disposition,
      argumentHash: hashCanonicalJsonV1(call.arguments), outputHash: hashCanonicalJsonV1(output),
      beforeStateHash: this.initialStateHash, afterStateHash: this.initialStateHash,
      changedPaths: [],
    });
  }
}

function collectEvidenceIds(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (entry: unknown, key = ''): void => {
    if (typeof entry === 'string' && (key === 'evidenceId' || key === 'evidenceIds')) found.add(entry);
    else if (Array.isArray(entry)) entry.forEach((item) => visit(item, key));
    else if (entry && typeof entry === 'object') Object.entries(entry as JsonRecord)
      .forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value); return [...found].sort(compareUtf16);
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unknown DEV-02 error'; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
