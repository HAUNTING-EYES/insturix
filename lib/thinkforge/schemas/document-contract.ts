import { z } from 'zod';
import {
  THINKFORGE_CAROUSEL_MIN_SLIDES as CAROUSEL_SCHEMA_MIN_SLIDES,
  THINKFORGE_CAROUSEL_SCHEMA_MAX_SLIDES,
} from './carousel-capabilities';

export const THINKFORGE_DOCUMENT_CONTRACT_VERSION = 1;
export const THINKFORGE_CAROUSEL_MIN_SLIDES = 2;
/** @deprecated Use the explicit authoring or renderer capability for execution limits. */
export const THINKFORGE_CAROUSEL_MAX_SLIDES = 7;
const ENGLISH_SLIDE_COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

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

export type ThinkForgeExplicitDocumentRequest =
  | { status: 'absent' }
  | { status: 'supported'; contract: ThinkForgeDocumentContract }
  | { status: 'unsupported'; label: string }
  | { status: 'ambiguous'; labels: string[] };

export const ThinkForgeDocumentContractSchema = z.object({
  version: z.number().int().default(THINKFORGE_DOCUMENT_CONTRACT_VERSION),
  documentKind: ThinkForgeDocumentKindSchema,
  outputKind: ThinkForgeOutputKindSchema,
  artifactType: ThinkForgeArtifactTypeSchema,
  // Typed editorial intent. Destination and executor capacity are validated separately.
  carouselSlideCount: z.number().int().min(CAROUSEL_SCHEMA_MIN_SLIDES).max(THINKFORGE_CAROUSEL_SCHEMA_MAX_SLIDES).optional(),
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
  if (contract.carouselSlideCount !== undefined && contract.outputKind !== 'carousel') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['carouselSlideCount'],
      message: 'carouselSlideCount is only valid for carousel output',
    });
  }
});

export type ThinkForgeDocumentContract = z.infer<typeof ThinkForgeDocumentContractSchema>;

export function thinkForgeDocumentContractsDescribeSameKind(
  left: ThinkForgeDocumentContract,
  right: ThinkForgeDocumentContract,
): boolean {
  return left.version === right.version
    && left.documentKind === right.documentKind
    && left.outputKind === right.outputKind
    && left.artifactType === right.artifactType;
}

export function thinkForgeDocumentContractMatchesClassification(
  contract: ThinkForgeDocumentContract,
  classification: ThinkForgeDocumentContract,
): boolean {
  return thinkForgeDocumentContractsDescribeSameKind(contract, classification)
    && (classification.carouselSlideCount === undefined
      || contract.carouselSlideCount === classification.carouselSlideCount);
}

export function thinkForgeDocumentContractsMatchExactly(
  left: ThinkForgeDocumentContract,
  right: ThinkForgeDocumentContract,
): boolean {
  return thinkForgeDocumentContractsDescribeSameKind(left, right)
    && left.carouselSlideCount === right.carouselSlideCount;
}

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

type ExplicitArtifactCandidate = {
  index: number;
  label: string;
  kind: ThinkForgeWriterKind | 'unsupported';
};

const EXPLICIT_ARTIFACT_PATTERN = /\b(?:slide\s+deck|carousel|(?:video|reel|short\s+form|commercial|brand\s+film|product\s+ad|ugc)\s+script|screenplay|script|video|reel|commercial|brand\s+film|product\s+ad|ugc|social\s+media\s+post|youtube\s+community\s+post|linkedin\s+post|instagram\s+post|facebook\s+post|twitter\s+post|x\s+post|post|caption|newsletter|article|blog\s+post|thread|email)\b/gi;
const AUTHORING_VERB_PATTERN = /\b(?:create|make|write|draft|generate|produce|convert|turn|adapt|rewrite|repurpose|need|want|give)\b/gi;
const SOURCE_CLAUSE_PATTERN = /\b(?:about|for|from|using|based\s+on|inspired\s+by|covering)\b/i;

function classifyExplicitArtifact(label: string): ExplicitArtifactCandidate['kind'] {
  if (/\b(?:carousel|slide\s+deck)\b/i.test(label)) return 'carousel';
  if (/\b(?:newsletter|article|blog\s+post|thread|email)\b/i.test(label)) return 'unsupported';
  if (/\b(?:post|caption)\b/i.test(label)) return 'social_post';
  return 'video_script';
}

function collectExplicitArtifactCandidates(segment: string): ExplicitArtifactCandidate[] {
  return [...segment.matchAll(EXPLICIT_ARTIFACT_PATTERN)].map((match) => ({
    index: match.index ?? 0,
    label: normalizeDocumentLabel(match[0]),
    kind: classifyExplicitArtifact(match[0]),
  }));
}

function resolveExplicitCandidateSegment(segment: string): ThinkForgeExplicitDocumentRequest {
  const sourceBoundary = segment.search(SOURCE_CLAUSE_PATTERN);
  const targetSegment = sourceBoundary >= 0 ? segment.slice(0, sourceBoundary) : segment;
  const candidates = collectExplicitArtifactCandidates(targetSegment);
  if (candidates.length === 0) return { status: 'absent' };

  const distinctKinds = [...new Set(candidates.map((candidate) => candidate.kind))];
  if (distinctKinds.length > 1) {
    return {
      status: 'ambiguous',
      labels: [...new Set(candidates.map((candidate) => candidate.label))],
    };
  }

  const candidate = candidates[0];
  if (candidate.kind === 'unsupported') {
    return { status: 'unsupported', label: candidate.label };
  }
  return {
    status: 'supported',
    contract: createThinkForgeWriterContract(candidate.kind),
  };
}

/**
 * Resolve only an explicit output request. Topic/platform mentions are not
 * authority: "a post about video scripts" remains a post. Conversion targets
 * after "into"/"as" take priority over the source artifact.
 */
export function resolveExplicitThinkForgeDocumentRequest(
  value?: string | null,
): ThinkForgeExplicitDocumentRequest {
  if (!value?.trim()) return { status: 'absent' };
  const normalized = normalizeDocumentLabel(value);

  const conversionMatches = [...normalized.matchAll(/\b(?:into|as)\b/g)];
  const conversion = conversionMatches.at(-1);
  if (conversion?.index !== undefined) {
    const result = resolveExplicitCandidateSegment(normalized.slice(conversion.index + conversion[0].length));
    if (result.status !== 'absent') {
      if (result.status === 'supported' && result.contract.outputKind === 'carousel') {
        return {
          status: 'supported',
          contract: createThinkForgeWriterContract('carousel', {
            carouselSlideCount: resolveCarouselSlideCount(normalized),
          }),
        };
      }
      return result;
    }
  }

  const verbMatch = AUTHORING_VERB_PATTERN.exec(normalized);
  AUTHORING_VERB_PATTERN.lastIndex = 0;
  if (!verbMatch?.index && verbMatch?.index !== 0) return { status: 'absent' };
  const result = resolveExplicitCandidateSegment(
    normalized.slice(verbMatch.index + verbMatch[0].length, verbMatch.index + verbMatch[0].length + 180),
  );
  if (result.status === 'supported' && result.contract.outputKind === 'carousel') {
    return {
      status: 'supported',
      contract: createThinkForgeWriterContract('carousel', {
        carouselSlideCount: resolveCarouselSlideCount(normalized),
      }),
    };
  }
  return result;
}

export function resolveCarouselSlideCount(value?: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const normalized = normalizeDocumentLabel(value);
  const numericMatch = normalized.match(/\b(\d+)\s*slides?\b/);
  const wordMatch = normalized.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*slides?\b/);
  const slideCount = numericMatch
    ? Number(numericMatch[1])
    : wordMatch
      ? ENGLISH_SLIDE_COUNT_WORDS[wordMatch[1]]
      : undefined;
  if (slideCount === undefined) return undefined;
  if (!Number.isInteger(slideCount) || slideCount < CAROUSEL_SCHEMA_MIN_SLIDES || slideCount > THINKFORGE_CAROUSEL_SCHEMA_MAX_SLIDES) {
    throw new Error(`carousel slide count must be between ${CAROUSEL_SCHEMA_MIN_SLIDES} and ${THINKFORGE_CAROUSEL_SCHEMA_MAX_SLIDES}`);
  }
  return slideCount;
}

export function createThinkForgeWriterContract(
  kind: ThinkForgeWriterKind,
  options?: { carouselSlideCount?: number },
): ThinkForgeDocumentContract {
  if (kind === 'social_post') {
    return { version: THINKFORGE_DOCUMENT_CONTRACT_VERSION, documentKind: 'post', outputKind: kind, artifactType: 'social_post' };
  }
  if (kind === 'carousel') {
    return ThinkForgeDocumentContractSchema.parse({
      version: THINKFORGE_DOCUMENT_CONTRACT_VERSION,
      documentKind: 'post',
      outputKind: kind,
      artifactType: 'carousel_deck',
      ...(options?.carouselSlideCount !== undefined ? { carouselSlideCount: options.carouselSlideCount } : {}),
    });
  }
  return { version: THINKFORGE_DOCUMENT_CONTRACT_VERSION, documentKind: 'script', outputKind: kind, artifactType: 'screenplay' };
}

export function normalizeThinkForgeDocumentContract(value?: string | null): ThinkForgeDocumentContract | null {
  if (!value?.trim()) return null;

  const carouselSlideCount = resolveCarouselSlideCount(value);
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

  if (/\bcarousel\b|\bslides?\b/.test(normalized)) {
    return createThinkForgeWriterContract('carousel', { carouselSlideCount });
  }
  if (/\b(screenplay|video script|script|reel|short|short form|video|commercial|brand film|product ad|ugc)\b/.test(normalized)) {
    return createThinkForgeWriterContract('video_script');
  }
  if (/\b(post|caption|social copy)\b/.test(normalized)) {
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
