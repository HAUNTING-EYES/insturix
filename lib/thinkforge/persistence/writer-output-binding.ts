import { z } from 'zod';
import {
  hashJsonArtifact,
  hashScriptDocumentContent,
  reconcileScriptSidecarMetadata,
} from './script-sidecar-binding';

export const WRITER_OUTPUT_BINDING_VERSION = 1 as const;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_WRITER_TYPES = new Set(['post', 'script']);

export const WriterOutputBindingSchema = z.object({
  bindingVersion: z.number().int(),
  status: z.enum(['current', 'stale']),
  boundDocumentVersion: z.number().int().nonnegative(),
  documentHash: z.string().regex(SHA256_HEX_PATTERN),
  writerOutputHash: z.string().regex(SHA256_HEX_PATTERN),
  staleReason: z.string().min(1).optional(),
  staleAtVersion: z.number().int().nonnegative().optional(),
}).strict().superRefine((binding, ctx) => {
  if (binding.bindingVersion !== WRITER_OUTPUT_BINDING_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bindingVersion'],
      message: `Expected writer output binding version ${WRITER_OUTPUT_BINDING_VERSION}.`,
    });
  }
  if (binding.status === 'current' && (binding.staleReason || binding.staleAtVersion !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'Current writer output bindings cannot carry stale metadata.',
    });
  }
  if (binding.status === 'stale') {
    if (!binding.staleReason || binding.staleAtVersion === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Stale writer output bindings require a reason and stale document version.',
      });
    } else if (binding.staleAtVersion < binding.boundDocumentVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['staleAtVersion'],
        message: 'Writer output cannot become stale before its bound document version.',
      });
    }
  }
});

export type WriterOutputBinding = z.infer<typeof WriterOutputBindingSchema>;

export type WriterOutputBindingVerification =
  | { current: true; binding: WriterOutputBinding }
  | {
      current: false;
      reason:
        | 'binding_missing'
        | 'binding_invalid'
        | 'binding_stale'
        | 'document_version_mismatch'
        | 'document_hash_mismatch'
        | 'writer_output_hash_mismatch';
      binding?: WriterOutputBinding;
    };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function canonicalWriterOutput(value: unknown): Record<string, unknown> | undefined {
  const writerOutput = asRecord(value);
  return typeof writerOutput.writerType === 'string'
    && CANONICAL_WRITER_TYPES.has(writerOutput.writerType)
    ? writerOutput
    : undefined;
}

function writerOutputArtifact(writerOutput: Record<string, unknown>): Record<string, unknown> {
  const artifact = { ...writerOutput };
  delete artifact.artifactBinding;
  delete artifact.sidecarBinding;
  return artifact;
}

function assertFreshWriterOutput(writerOutput: Record<string, unknown>): void {
  if (!canonicalWriterOutput(writerOutput)) {
    throw new Error('Fresh writer output must declare writerType post or script.');
  }
  if (!writerOutput.visualPrompts || typeof writerOutput.visualPrompts !== 'object'
    || Array.isArray(writerOutput.visualPrompts)) {
    throw new Error('Fresh writer output must include structured visualPrompts.');
  }
  if (writerOutput.writerType === 'script' && !hasOwn(writerOutput, 'scriptSidecar')) {
    throw new Error('Fresh script writer output must include scriptSidecar.');
  }
}

export function createCurrentWriterOutputBinding(input: {
  documentContent: string;
  documentVersion: number;
  writerOutput: Record<string, unknown>;
}): WriterOutputBinding {
  return WriterOutputBindingSchema.parse({
    bindingVersion: WRITER_OUTPUT_BINDING_VERSION,
    status: 'current',
    boundDocumentVersion: input.documentVersion,
    documentHash: hashScriptDocumentContent(input.documentContent),
    writerOutputHash: hashJsonArtifact(writerOutputArtifact(input.writerOutput)),
  });
}

function createStaleWriterOutputBinding(input: {
  previousBinding?: unknown;
  previousDocumentContent: string;
  previousDocumentVersion: number;
  writerOutput: Record<string, unknown>;
  staleAtVersion: number;
  reason: string;
}): WriterOutputBinding {
  const previous = WriterOutputBindingSchema.safeParse(input.previousBinding);
  const bound = previous.success
    ? previous.data
    : createCurrentWriterOutputBinding({
        documentContent: input.previousDocumentContent,
        documentVersion: input.previousDocumentVersion,
        writerOutput: input.writerOutput,
      });
  return WriterOutputBindingSchema.parse({
    bindingVersion: WRITER_OUTPUT_BINDING_VERSION,
    status: 'stale',
    boundDocumentVersion: bound.boundDocumentVersion,
    documentHash: bound.documentHash,
    writerOutputHash: bound.writerOutputHash,
    staleReason: input.reason,
    staleAtVersion: input.staleAtVersion,
  });
}

export function verifyWriterOutputBinding(input: {
  binding: unknown;
  documentContent: string;
  documentVersion: number;
  writerOutput: Record<string, unknown>;
}): WriterOutputBindingVerification {
  if (input.binding === undefined || input.binding === null) {
    return { current: false, reason: 'binding_missing' };
  }
  const parsed = WriterOutputBindingSchema.safeParse(input.binding);
  if (!parsed.success) return { current: false, reason: 'binding_invalid' };
  const binding = parsed.data;
  if (binding.status === 'stale') return { current: false, reason: 'binding_stale', binding };
  if (binding.boundDocumentVersion !== input.documentVersion) {
    return { current: false, reason: 'document_version_mismatch', binding };
  }
  if (binding.documentHash !== hashScriptDocumentContent(input.documentContent)) {
    return { current: false, reason: 'document_hash_mismatch', binding };
  }
  if (binding.writerOutputHash !== hashJsonArtifact(writerOutputArtifact(input.writerOutput))) {
    return { current: false, reason: 'writer_output_hash_mismatch', binding };
  }
  return { current: true, binding };
}

function withWriterOutput(
  metadata: Record<string, unknown>,
  writerOutput: Record<string, unknown>,
): Record<string, unknown> {
  return { ...metadata, writerOutput };
}

export function reconcileWriterOutputMetadata(input: {
  existingMetadata: unknown;
  incomingMetadata: unknown;
  nextMetadata: unknown;
  source: 'user' | 'ai';
  previousContent: string;
  nextContent: string;
  previousVersion: number;
}): Record<string, unknown> {
  const sidecarMetadata = reconcileScriptSidecarMetadata(input);
  const existingMetadata = asRecord(input.existingMetadata);
  const incomingMetadata = asRecord(input.incomingMetadata);
  const nextMetadata = asRecord(sidecarMetadata);
  const existingWriterOutput = canonicalWriterOutput(existingMetadata.writerOutput);
  const incomingWriterOutput = canonicalWriterOutput(incomingMetadata.writerOutput);
  const nextWriterOutput = canonicalWriterOutput(nextMetadata.writerOutput);
  const nextVersion = input.previousVersion + 1;
  const hasFreshWriterOutput = input.source === 'ai'
    && hasOwn(incomingMetadata, 'writerOutput')
    && incomingWriterOutput !== undefined;

  if (hasFreshWriterOutput) {
    if (!nextWriterOutput) throw new Error('Fresh writer output was lost during reconciliation.');
    assertFreshWriterOutput(nextWriterOutput);
    return withWriterOutput(nextMetadata, {
      ...nextWriterOutput,
      artifactBinding: createCurrentWriterOutputBinding({
        documentContent: input.nextContent,
        documentVersion: nextVersion,
        writerOutput: nextWriterOutput,
      }),
    });
  }

  if (!existingWriterOutput) return nextMetadata;
  const reconciledWriterOutput = nextWriterOutput ?? asRecord(nextMetadata.writerOutput);
  const preservedWriterOutput = {
    ...existingWriterOutput,
    ...(hasOwn(reconciledWriterOutput, 'sidecarBinding')
      ? { sidecarBinding: reconciledWriterOutput.sidecarBinding }
      : {}),
  };

  if (input.nextContent !== input.previousContent) {
    return withWriterOutput(nextMetadata, {
      ...preservedWriterOutput,
      artifactBinding: createStaleWriterOutputBinding({
        previousBinding: existingWriterOutput.artifactBinding,
        previousDocumentContent: input.previousContent,
        previousDocumentVersion: input.previousVersion,
        writerOutput: existingWriterOutput,
        staleAtVersion: nextVersion,
        reason: 'content_changed_without_fresh_writer_output',
      }),
    });
  }

  const verification = verifyWriterOutputBinding({
    binding: existingWriterOutput.artifactBinding,
    documentContent: input.previousContent,
    documentVersion: input.previousVersion,
    writerOutput: existingWriterOutput,
  });
  if (verification.current) {
    return withWriterOutput(nextMetadata, {
      ...preservedWriterOutput,
      artifactBinding: createCurrentWriterOutputBinding({
        documentContent: input.nextContent,
        documentVersion: nextVersion,
        writerOutput: preservedWriterOutput,
      }),
    });
  }
  if (verification.reason === 'binding_missing' || verification.reason === 'binding_stale') {
    return withWriterOutput(nextMetadata, preservedWriterOutput);
  }
  return withWriterOutput(nextMetadata, {
    ...preservedWriterOutput,
    artifactBinding: createStaleWriterOutputBinding({
      previousBinding: existingWriterOutput.artifactBinding,
      previousDocumentContent: input.previousContent,
      previousDocumentVersion: input.previousVersion,
      writerOutput: existingWriterOutput,
      staleAtVersion: nextVersion,
      reason: 'binding_integrity_failed',
    }),
  });
}
