import { verifyWriterOutputBinding } from './writer-output-binding';

export type PersistedWriterOutputErrorCode =
  | 'writer-output-unbound'
  | 'writer-output-stale'
  | 'writer-output-integrity-invalid'
  | 'writer-output-payload-invalid';

export class PersistedWriterOutputError extends Error {
  constructor(
    public readonly code: PersistedWriterOutputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PersistedWriterOutputError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function requireCurrentPersistedWriterOutput(input: {
  metadata: unknown;
  documentContent: unknown;
  documentVersion: unknown;
}): Record<string, unknown> | undefined {
  const metadata = asRecord(input.metadata);
  const writerOutput = asRecord(metadata?.writerOutput);
  if (!writerOutput || (writerOutput.writerType !== 'post' && writerOutput.writerType !== 'script')) {
    return undefined;
  }
  if (typeof input.documentContent !== 'string'
    || typeof input.documentVersion !== 'number'
    || !Number.isInteger(input.documentVersion)
    || input.documentVersion < 0
    || !asRecord(writerOutput.visualPrompts)) {
    throw new PersistedWriterOutputError(
      'writer-output-payload-invalid',
      'The persisted writer output or document identity is malformed.',
    );
  }

  let verification;
  try {
    verification = verifyWriterOutputBinding({
      binding: writerOutput.artifactBinding,
      documentContent: input.documentContent,
      documentVersion: input.documentVersion,
      writerOutput,
    });
  } catch {
    throw new PersistedWriterOutputError(
      'writer-output-payload-invalid',
      'The persisted writer output is not valid JSON artifact data.',
    );
  }
  if (verification.current) return writerOutput;
  if (verification.reason === 'binding_missing') {
    throw new PersistedWriterOutputError(
      'writer-output-unbound',
      'The persisted writer output is not bound to this document revision.',
    );
  }
  if (verification.reason === 'binding_stale') {
    throw new PersistedWriterOutputError(
      'writer-output-stale',
      'The visible document changed after its hidden writer output was generated.',
    );
  }
  throw new PersistedWriterOutputError(
    'writer-output-integrity-invalid',
    'The persisted writer output does not match this document revision.',
  );
}
