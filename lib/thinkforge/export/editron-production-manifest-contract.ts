import { createHash } from 'node:crypto';
import { z } from 'zod';
import { THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS } from '../production/output-duration-capability';

export const THINKFORGE_EDITRON_PRODUCTION_MANIFEST_VERSION = 1;
export const THINKFORGE_EDITRON_PRODUCTION_MANIFEST_MAX_BYTES = 256 * 1_024;

const IdentifierSchema = z.string().trim().min(1).max(200);
const CountSchema = z.number().int().nonnegative().max(10_000);
const TextLengthSchema = z.number().int().nonnegative().max(10_000_000);

const ParserEvidenceSchema = z.object({
  llmAvailable: z.boolean(),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().trim().min(1).max(1_000).optional(),
  inputLength: TextLengthSchema,
  maxInputChars: TextLengthSchema,
  source: z.enum(['request', 'stored-script']),
  storedScriptRecovered: z.boolean(),
  sidecarUsed: z.boolean(),
  sidecarVersion: z.number().int().positive().max(100).optional(),
  sidecarSource: z.literal('stored-script').optional(),
}).strict();

export const ThinkForgeEditronProductionManifestSchema = z.object({
  version: z.number().int().default(THINKFORGE_EDITRON_PRODUCTION_MANIFEST_VERSION).refine(
    (value) => value === THINKFORGE_EDITRON_PRODUCTION_MANIFEST_VERSION,
    'Unsupported ThinkForge Editron production-manifest version.',
  ),
  sourceService: z.literal('thinkforge'),
  sourceSessionId: IdentifierSchema,
  sourceScriptId: IdentifierSchema,
  targetDurationSeconds: z.number().finite().nonnegative().max(THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS).nullable(),
  targetDurationSource: z.enum(['request', 'script-explicit', 'unknown']),
  parsedDurationSeconds: z.number().finite().nonnegative().max(THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS),
  expectedSceneCount: CountSchema,
  expectedStoryboardImages: CountSchema,
  expectedVideoClips: CountSchema,
  coveragePolicy: z.enum(['production-require-all-scenes', 'draft-partial-allowed']),
  parser: ParserEvidenceSchema,
  thinkforgeContext: z.record(z.string(), z.unknown()).optional(),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
}).strict();

export type ThinkForgeEditronProductionManifest = z.infer<
  typeof ThinkForgeEditronProductionManifestSchema
>;

export interface VerifiedThinkForgeEditronProductionManifest {
  manifest: ThinkForgeEditronProductionManifest;
  canonicalJson: string;
  sha256: string;
}

export class InvalidThinkForgeEditronProductionManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidThinkForgeEditronProductionManifestError';
  }
}

function canonicalizeJson(
  value: unknown,
  depth: number,
  state: { nodes: number },
): unknown {
  state.nodes += 1;
  if (state.nodes > 20_000) {
    throw new InvalidThinkForgeEditronProductionManifestError(
      'ThinkForge production manifest exceeds the structural node limit.',
    );
  }
  if (depth > 32) {
    throw new InvalidThinkForgeEditronProductionManifestError(
      'ThinkForge production manifest exceeds the nesting limit.',
    );
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new InvalidThinkForgeEditronProductionManifestError(
        'ThinkForge production manifest contains a non-finite number.',
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item, depth + 1, state));
  }
  if (!value || typeof value !== 'object') {
    throw new InvalidThinkForgeEditronProductionManifestError(
      'ThinkForge production manifest contains a non-JSON value.',
    );
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right))) {
    if (!key || key.length > 200 || key.startsWith('$') || key.includes('.')) {
      throw new InvalidThinkForgeEditronProductionManifestError(
        'ThinkForge production manifest contains an unsafe object key.',
      );
    }
    output[key] = canonicalizeJson(item, depth + 1, state);
  }
  return output;
}

export function verifyThinkForgeEditronProductionManifest(
  value: unknown,
): VerifiedThinkForgeEditronProductionManifest {
  let manifest: ThinkForgeEditronProductionManifest;
  try {
    manifest = ThinkForgeEditronProductionManifestSchema.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'schema validation failed';
    throw new InvalidThinkForgeEditronProductionManifestError(
      `Invalid ThinkForge production manifest: ${message}`,
    );
  }

  const canonical = canonicalizeJson(manifest, 0, { nodes: 0 });
  const canonicalJson = JSON.stringify(canonical);
  if (Buffer.byteLength(canonicalJson, 'utf8') > THINKFORGE_EDITRON_PRODUCTION_MANIFEST_MAX_BYTES) {
    throw new InvalidThinkForgeEditronProductionManifestError(
      'ThinkForge production manifest exceeds the byte limit.',
    );
  }

  return {
    manifest,
    canonicalJson,
    sha256: createHash('sha256').update(canonicalJson).digest('hex'),
  };
}
