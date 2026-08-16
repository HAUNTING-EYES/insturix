import { createHash } from 'crypto';
import { z } from 'zod';
import { readScriptSidecar } from '../schemas/script-sidecar-v1-adapter';

export const SCRIPT_SIDECAR_BINDING_VERSION = 1 as const;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export const ScriptSidecarBindingSchema = z.object({
  bindingVersion: z.number().int(),
  status: z.enum(['current', 'stale']),
  boundDocumentVersion: z.number().int().nonnegative(),
  documentHash: z.string().regex(SHA256_HEX_PATTERN),
  sidecarHash: z.string().regex(SHA256_HEX_PATTERN),
  staleReason: z.string().min(1).optional(),
  staleAtVersion: z.number().int().nonnegative().optional(),
}).strict().superRefine((binding, ctx) => {
  if (binding.bindingVersion !== SCRIPT_SIDECAR_BINDING_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bindingVersion'],
      message: `Expected script sidecar binding version ${SCRIPT_SIDECAR_BINDING_VERSION}.`,
    });
  }

  if (binding.status === 'current' && (binding.staleReason || binding.staleAtVersion !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'Current script sidecar bindings cannot carry stale metadata.',
    });
  }

  if (binding.status === 'stale') {
    if (!binding.staleReason || binding.staleAtVersion === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Stale script sidecar bindings require a reason and stale document version.',
      });
    } else if (binding.staleAtVersion < binding.boundDocumentVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['staleAtVersion'],
        message: 'A sidecar cannot become stale before its bound document version.',
      });
    }
  }
});

export type ScriptSidecarBinding = z.infer<typeof ScriptSidecarBindingSchema>;

export type ScriptSidecarBindingVerification =
  | { current: true; binding: ScriptSidecarBinding }
  | {
      current: false;
      reason:
        | 'binding_missing'
        | 'binding_invalid'
        | 'binding_stale'
        | 'document_version_mismatch'
        | 'document_hash_mismatch'
        | 'sidecar_hash_mismatch';
      binding?: ScriptSidecarBinding;
    };

function normalizeDocumentContent(content: string): string {
  return content.normalize('NFC').replace(/\r\n?/g, '\n');
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Script sidecar contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Script sidecar must contain plain JSON data.');
    }
    const record = value as Record<string, unknown>;
    const pairs = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`);
    return `{${pairs.join(',')}}`;
  }
  throw new Error('Script sidecar must contain JSON-serializable data.');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashScriptDocumentContent(content: string): string {
  return sha256(normalizeDocumentContent(content));
}

export function hashScriptSidecar(sidecar: unknown): string {
  return sha256(stableSerialize(sidecar).normalize('NFC'));
}

export function parseScriptSidecarBinding(input: unknown): ScriptSidecarBinding {
  return ScriptSidecarBindingSchema.parse(input);
}

export function createCurrentScriptSidecarBinding(input: {
  documentContent: string;
  documentVersion: number;
  sidecar: unknown;
}): ScriptSidecarBinding {
  return parseScriptSidecarBinding({
    bindingVersion: SCRIPT_SIDECAR_BINDING_VERSION,
    status: 'current',
    boundDocumentVersion: input.documentVersion,
    documentHash: hashScriptDocumentContent(input.documentContent),
    sidecarHash: hashScriptSidecar(input.sidecar),
  });
}

export function createStaleScriptSidecarBinding(input: {
  previousBinding?: unknown;
  previousDocumentContent: string;
  previousDocumentVersion: number;
  sidecar: unknown;
  staleAtVersion: number;
  reason: string;
}): ScriptSidecarBinding {
  const previous = ScriptSidecarBindingSchema.safeParse(input.previousBinding);
  const bound = previous.success
    ? previous.data
    : createCurrentScriptSidecarBinding({
        documentContent: input.previousDocumentContent,
        documentVersion: input.previousDocumentVersion,
        sidecar: input.sidecar,
      });

  return parseScriptSidecarBinding({
    bindingVersion: SCRIPT_SIDECAR_BINDING_VERSION,
    status: 'stale',
    boundDocumentVersion: bound.boundDocumentVersion,
    documentHash: bound.documentHash,
    sidecarHash: bound.sidecarHash,
    staleReason: input.reason,
    staleAtVersion: input.staleAtVersion,
  });
}

export function verifyScriptSidecarBinding(input: {
  binding: unknown;
  documentContent: string;
  documentVersion: number;
  sidecar: unknown;
}): ScriptSidecarBindingVerification {
  if (input.binding === undefined || input.binding === null) {
    return { current: false, reason: 'binding_missing' };
  }

  const parsed = ScriptSidecarBindingSchema.safeParse(input.binding);
  if (!parsed.success) return { current: false, reason: 'binding_invalid' };
  const binding = parsed.data;

  if (binding.status === 'stale') return { current: false, reason: 'binding_stale', binding };
  if (binding.boundDocumentVersion !== input.documentVersion) {
    return { current: false, reason: 'document_version_mismatch', binding };
  }
  if (binding.documentHash !== hashScriptDocumentContent(input.documentContent)) {
    return { current: false, reason: 'document_hash_mismatch', binding };
  }
  if (binding.sidecarHash !== hashScriptSidecar(input.sidecar)) {
    return { current: false, reason: 'sidecar_hash_mismatch', binding };
  }

  return { current: true, binding };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function withWriterOutput(
  metadata: Record<string, unknown>,
  writerOutput: Record<string, unknown>,
): Record<string, unknown> {
  return { ...metadata, writerOutput };
}

export function reconcileScriptSidecarMetadata(input: {
  existingMetadata: unknown;
  incomingMetadata: unknown;
  nextMetadata: unknown;
  source: 'user' | 'ai';
  previousContent: string;
  nextContent: string;
  previousVersion: number;
}): Record<string, unknown> {
  const existingMetadata = asRecord(input.existingMetadata);
  const incomingMetadata = asRecord(input.incomingMetadata);
  const nextMetadata = asRecord(input.nextMetadata);
  const existingWriterOutput = asRecord(existingMetadata.writerOutput);
  const incomingWriterOutput = asRecord(incomingMetadata.writerOutput);
  const nextWriterOutput = asRecord(nextMetadata.writerOutput);
  const nextVersion = input.previousVersion + 1;
  const hasFreshSidecar = input.source === 'ai'
    && hasOwn(incomingWriterOutput, 'scriptSidecar');

  if (hasFreshSidecar) {
    const persistedRead = readScriptSidecar(nextWriterOutput.scriptSidecar);
    if (hasOwn(nextWriterOutput, 'sidecarVersion')) {
      const envelopeVersion = nextWriterOutput.sidecarVersion;
      if (typeof envelopeVersion !== 'number' || !Number.isInteger(envelopeVersion)) {
        throw new Error('Fresh script sidecar envelope version must be an integer.');
      }
      if (envelopeVersion !== persistedRead.sourceVersion) {
        throw new Error(
          `Fresh script sidecar version mismatch: envelope ${envelopeVersion}, payload ${persistedRead.sourceVersion}.`,
        );
      }
    }
    return withWriterOutput(nextMetadata, {
      ...nextWriterOutput,
      sidecarBinding: createCurrentScriptSidecarBinding({
        documentContent: input.nextContent,
        documentVersion: nextVersion,
        sidecar: nextWriterOutput.scriptSidecar,
      }),
    });
  }

  if (!hasOwn(existingWriterOutput, 'scriptSidecar')) return nextMetadata;

  const historicalSidecar = existingWriterOutput.scriptSidecar;
  const preservedWriterOutput = {
    ...existingWriterOutput,
    ...nextWriterOutput,
    scriptSidecar: historicalSidecar,
    ...(hasOwn(existingWriterOutput, 'sidecarVersion')
      ? { sidecarVersion: existingWriterOutput.sidecarVersion }
      : {}),
  };

  if (input.nextContent !== input.previousContent) {
    return withWriterOutput(nextMetadata, {
      ...preservedWriterOutput,
      sidecarBinding: createStaleScriptSidecarBinding({
        previousBinding: existingWriterOutput.sidecarBinding,
        previousDocumentContent: input.previousContent,
        previousDocumentVersion: input.previousVersion,
        sidecar: historicalSidecar,
        staleAtVersion: nextVersion,
        reason: 'content_changed_without_fresh_sidecar',
      }),
    });
  }

  const verification = verifyScriptSidecarBinding({
    binding: existingWriterOutput.sidecarBinding,
    documentContent: input.previousContent,
    documentVersion: input.previousVersion,
    sidecar: historicalSidecar,
  });
  if (verification.current) {
    return withWriterOutput(nextMetadata, {
      ...preservedWriterOutput,
      sidecarBinding: createCurrentScriptSidecarBinding({
        documentContent: input.nextContent,
        documentVersion: nextVersion,
        sidecar: historicalSidecar,
      }),
    });
  }
  if (verification.reason === 'binding_missing' || verification.reason === 'binding_stale') {
    return withWriterOutput(nextMetadata, preservedWriterOutput);
  }

  return withWriterOutput(nextMetadata, {
    ...preservedWriterOutput,
    sidecarBinding: createStaleScriptSidecarBinding({
      previousBinding: existingWriterOutput.sidecarBinding,
      previousDocumentContent: input.previousContent,
      previousDocumentVersion: input.previousVersion,
      sidecar: historicalSidecar,
      staleAtVersion: nextVersion,
      reason: 'binding_integrity_failed',
    }),
  });
}
