import { z } from 'zod';

export const THINKFORGE_DOCUMENT_CONTRACT_VERSION = 1;

export const THINKFORGE_DOCUMENT_KINDS = ['post', 'script', 'document'] as const;
export const THINKFORGE_OUTPUT_KINDS = [
  'social_post',
  'carousel',
  'video_script',
  'written_document',
] as const;
export const THINKFORGE_ARTIFACT_TYPES = [
  'social_post',
  'carousel_deck',
  'screenplay',
  'vfx_brief',
  'budget',
  'shot_list',
  'character_bible',
  'world_bible',
  'interview_questions',
  'score_direction',
  'research_brief',
  'custom',
] as const;

export const ThinkForgeDocumentKindSchema = z.enum(THINKFORGE_DOCUMENT_KINDS);
export const ThinkForgeOutputKindSchema = z.enum(THINKFORGE_OUTPUT_KINDS);
export const ThinkForgeArtifactTypeSchema = z.enum(THINKFORGE_ARTIFACT_TYPES);

export type ThinkForgeDocumentKind = z.infer<typeof ThinkForgeDocumentKindSchema>;
export type ThinkForgeOutputKind = z.infer<typeof ThinkForgeOutputKindSchema>;
export type ThinkForgeArtifactType = z.infer<typeof ThinkForgeArtifactTypeSchema>;
export type ThinkForgeWriterKind = Extract<
  ThinkForgeOutputKind,
  'social_post' | 'carousel' | 'video_script'
>;
export type ThinkForgeCanonicalDocumentType =
  | ThinkForgeWriterKind
  | Exclude<ThinkForgeArtifactType, 'social_post' | 'carousel_deck' | 'screenplay'>;
export type ThinkForgeLegacyDocumentType = 'post' | 'screenplay';

export const ThinkForgeDocumentContractSchema = z.object({
  version: z.number().int().default(THINKFORGE_DOCUMENT_CONTRACT_VERSION),
  documentKind: ThinkForgeDocumentKindSchema,
  outputKind: ThinkForgeOutputKindSchema,
  artifactType: ThinkForgeArtifactTypeSchema,
}).superRefine((contract, ctx) => {
  if (contract.version !== THINKFORGE_DOCUMENT_CONTRACT_VERSION) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['version'], message: 'unsupported document contract version' });
  }

  const validPost = contract.documentKind === 'post'
    && ((contract.outputKind === 'social_post' && contract.artifactType === 'social_post')
      || (contract.outputKind === 'carousel' && contract.artifactType === 'carousel_deck'));
  const validScript = contract.documentKind === 'script'
    && contract.outputKind === 'video_script'
    && contract.artifactType === 'screenplay';
  const validDocument = contract.documentKind === 'document'
    && contract.outputKind === 'written_document'
    && !['social_post', 'carousel_deck', 'screenplay'].includes(contract.artifactType);

  if (!validPost && !validScript && !validDocument) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'document kind, output kind, and artifact type are inconsistent',
    });
  }
});

export type ThinkForgeDocumentContract = z.infer<typeof ThinkForgeDocumentContractSchema>;

const TECHNICAL_ARTIFACT_TYPES = new Set<ThinkForgeArtifactType>([
  'vfx_brief',
  'budget',
  'shot_list',
  'character_bible',
  'world_bible',
  'interview_questions',
  'score_direction',
  'research_brief',
  'custom',
]);

function normalizeDocumentLabel(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createThinkForgeWriterContract(kind: ThinkForgeWriterKind): ThinkForgeDocumentContract {
  if (kind === 'social_post') {
    return { version: THINKFORGE_DOCUMENT_CONTRACT_VERSION, documentKind: 'post', outputKind: kind, artifactType: 'social_post' };
  }
  if (kind === 'carousel') {
    return { version: THINKFORGE_DOCUMENT_CONTRACT_VERSION, documentKind: 'post', outputKind: kind, artifactType: 'carousel_deck' };
  }
  return { version: THINKFORGE_DOCUMENT_CONTRACT_VERSION, documentKind: 'script', outputKind: kind, artifactType: 'screenplay' };
}

export function normalizeThinkForgeDocumentContract(value?: string | null): ThinkForgeDocumentContract | null {
  if (!value?.trim()) return null;

  const normalized = normalizeDocumentLabel(value);
  const candidate = normalized.replace(/\s+/g, '_') as ThinkForgeArtifactType;
  if (TECHNICAL_ARTIFACT_TYPES.has(candidate)) {
    return {
      version: THINKFORGE_DOCUMENT_CONTRACT_VERSION,
      documentKind: 'document',
      outputKind: 'written_document',
      artifactType: candidate,
    };
  }

  if (/\bcarousel\b|\bslides?\b/.test(normalized)) return createThinkForgeWriterContract('carousel');
  if (/\b(screenplay|video script|script|reel|short|short form|youtube|tiktok|commercial|brand film|product ad|ugc)\b/.test(normalized)) {
    return createThinkForgeWriterContract('video_script');
  }
  if (/\b(post|caption|article|newsletter|thread|social copy)\b/.test(normalized)) {
    return createThinkForgeWriterContract('social_post');
  }
  return null;
}

export function normalizeThinkForgeDocumentType(value?: string | null): ThinkForgeCanonicalDocumentType | null {
  const contract = normalizeThinkForgeDocumentContract(value);
  if (!contract) return null;
  return contract.documentKind === 'document'
    ? contract.artifactType as ThinkForgeCanonicalDocumentType
    : contract.outputKind as ThinkForgeWriterKind;
}

export function isThinkForgePostKind(
  kind: ThinkForgeCanonicalDocumentType | null | undefined,
): kind is Extract<ThinkForgeWriterKind, 'social_post' | 'carousel'> {
  return kind === 'social_post' || kind === 'carousel';
}

export function isThinkForgeScriptKind(
  kind: ThinkForgeCanonicalDocumentType | null | undefined,
): kind is Extract<ThinkForgeWriterKind, 'video_script'> {
  return kind === 'video_script';
}

export function parseThinkForgeDocumentContract(input: unknown): ThinkForgeDocumentContract {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if ('documentKind' in source || 'outputKind' in source || 'artifactType' in source) {
    return ThinkForgeDocumentContractSchema.parse(source);
  }

  const legacyValue = typeof source.kind === 'string'
    ? source.kind
    : typeof source.documentType === 'string'
      ? source.documentType
      : null;
  const normalized = normalizeThinkForgeDocumentContract(legacyValue);
  return ThinkForgeDocumentContractSchema.parse(normalized ?? source);
}
