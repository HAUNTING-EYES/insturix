import {
  readScriptSidecar,
  type ScriptSidecarReadResult,
} from '../schemas/script-sidecar-v1-adapter';
import {
  type ScriptSidecarBinding,
  verifyScriptSidecarBinding,
} from './script-sidecar-binding';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writerOutputFromMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.writerOutput)) return undefined;
  return metadata.writerOutput;
}

export type ThinkForgeScriptSidecarAuthorityCode =
  | 'script-sidecar-unbound'
  | 'script-sidecar-stale'
  | 'script-sidecar-payload-invalid'
  | 'script-sidecar-binding-invalid';

export class ThinkForgeScriptSidecarAuthorityError extends Error {
  readonly code: ThinkForgeScriptSidecarAuthorityCode;
  readonly bindingReason: string;

  constructor(code: ThinkForgeScriptSidecarAuthorityCode, bindingReason: string) {
    super(
      code === 'script-sidecar-stale'
        ? 'The saved script changed after its production contract was authored. Regenerate or revise the script before exporting.'
        : code === 'script-sidecar-unbound'
          ? 'This saved script predates production-contract lineage. Refresh the script before exporting.'
          : code === 'script-sidecar-payload-invalid'
            ? 'The saved script production contract is malformed and cannot be used safely.'
            : 'The saved script production-contract lineage failed integrity validation.',
    );
    this.name = 'ThinkForgeScriptSidecarAuthorityError';
    this.code = code;
    this.bindingReason = bindingReason;
  }
}

export interface AuthoritativePersistedScriptSidecar {
  readResult: ScriptSidecarReadResult;
  rawSidecar: unknown;
  binding: ScriptSidecarBinding;
}

/**
 * Reads the sidecar stored by ThinkForge writers without mutating its metadata envelope.
 * Documents created before sidecars existed legitimately return no result; once a sidecar
 * property exists, its payload and optional envelope version are strict persistence data.
 */
export function readPersistedScriptSidecar(
  metadata: unknown,
): ScriptSidecarReadResult | undefined {
  const writerOutput = writerOutputFromMetadata(metadata);
  if (!writerOutput) return undefined;
  if (!hasOwn(writerOutput, 'scriptSidecar')) return undefined;

  let result: ScriptSidecarReadResult;
  try {
    result = readScriptSidecar(writerOutput.scriptSidecar);
  } catch (error) {
    throw new Error(`Invalid persisted ThinkForge script sidecar: ${errorMessage(error)}`);
  }

  if (hasOwn(writerOutput, 'sidecarVersion')) {
    const envelopeVersion = writerOutput.sidecarVersion;
    if (typeof envelopeVersion !== 'number' || !Number.isInteger(envelopeVersion)) {
      throw new Error('Invalid persisted ThinkForge sidecar envelope version: expected an integer.');
    }
    if (envelopeVersion !== result.sourceVersion) {
      throw new Error(
        `Persisted ThinkForge sidecar version mismatch: envelope ${envelopeVersion}, payload ${result.sourceVersion}.`,
      );
    }
  }

  return result;
}

export function requireCurrentPersistedScriptSidecar(input: {
  metadata: unknown;
  documentContent: string;
  documentVersion: number;
}): AuthoritativePersistedScriptSidecar | undefined {
  const writerOutput = writerOutputFromMetadata(input.metadata);
  if (!writerOutput || !hasOwn(writerOutput, 'scriptSidecar')) return undefined;

  let readResult: ScriptSidecarReadResult;
  try {
    const persisted = readPersistedScriptSidecar(input.metadata);
    if (!persisted) return undefined;
    readResult = persisted;
  } catch {
    throw new ThinkForgeScriptSidecarAuthorityError(
      'script-sidecar-payload-invalid',
      'sidecar_schema_invalid',
    );
  }

  const rawSidecar = writerOutput.scriptSidecar;
  const verification = verifyScriptSidecarBinding({
    binding: writerOutput.sidecarBinding,
    documentContent: input.documentContent,
    documentVersion: input.documentVersion,
    sidecar: rawSidecar,
  });
  if (!verification.current) {
    const code = verification.reason === 'binding_missing'
      ? 'script-sidecar-unbound'
      : verification.reason === 'binding_stale'
        ? 'script-sidecar-stale'
        : 'script-sidecar-binding-invalid';
    throw new ThinkForgeScriptSidecarAuthorityError(code, verification.reason);
  }

  return { readResult, rawSidecar, binding: verification.binding };
}
