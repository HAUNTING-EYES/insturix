import {
  readScriptSidecar,
  type ScriptSidecarReadResult,
} from '../schemas/script-sidecar-v1-adapter';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the sidecar stored by ThinkForge writers without mutating its metadata envelope.
 * Documents created before sidecars existed legitimately return no result; once a sidecar
 * property exists, its payload and optional envelope version are strict persistence data.
 */
export function readPersistedScriptSidecar(
  metadata: unknown,
): ScriptSidecarReadResult | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.writerOutput)) return undefined;

  const writerOutput = metadata.writerOutput;
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
