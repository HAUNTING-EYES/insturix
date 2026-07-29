import bundledManifestJson from '@/public/sfx/manifest.json';
import {
  evaluateAtomicSfxAssetCandidate,
  type AtomicSfxCompatibilityToken,
  type AtomicSfxForm,
} from '@/lib/editron/services/sfx-form';
import { sfxAcousticMeasurementSchema } from '@/lib/pipeline/sfx-acoustic-measurement';
import { z } from 'zod';

const catalogEventRoleSchema = z.enum([
  'whoosh',
  'impact',
  'tick',
  'pop',
  'riser',
  'logo-sting',
  'ambience',
  'foley',
  'shimmer',
]);

const catalogSurfaceSchema = z.enum([
  'transition',
  'motion-graphic',
  'ui',
  'scene',
  'logo',
  'caption',
  'chapter',
]);

const catalogDirectionSchema = z.enum([
  'neutral',
  'left',
  'right',
  'up',
  'down',
  'in',
  'out',
]);

const catalogLayerRoleSchema = z.enum([
  'oneshot',
  'riser',
  'impact',
  'loop',
  'bed',
  'sting',
]);

const audioRightsSchema = z.object({
  mediaRole: z.literal('sfx'),
  source: z.literal('library'),
  userChoice: z.literal('attested'),
  licensed: z.literal(true),
  evidence: z.object({
    kind: z.literal('library-license'),
    sourceAssetId: z.string().min(1),
    licenseId: z.string().min(1),
  }).strict(),
}).strict();

export const SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION =
  'sfx-catalog-semantic-evidence-v2' as const;

const semanticRiskScoreSchema = z.object({
  risk: z.enum(['speech', 'music', 'noise']),
  cosineSimilarity: z.number().min(-1).max(1),
}).strict();

export const sfxCatalogSemanticEvidenceSchema = z.object({
  version: z.literal(SFX_CATALOG_SEMANTIC_EVIDENCE_VERSION),
  provider: z.literal('clap-audio-classifier'),
  model: z.object({
    modelId: z.string().min(1),
    modelRevision: z.string().min(1),
    embeddingDimension: z.number().int().positive(),
  }).strict(),
  embeddingAnalysisDigestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  candidateDigestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  embeddingSourceHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
  catalogContentHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
  selectedRole: catalogEventRoleSchema,
  selectedRoleCosineSimilarity: z.number().min(-1).max(1),
  selectedRoleRank: z.number().int().min(1).max(catalogEventRoleSchema.options.length),
  topRole: catalogEventRoleSchema,
  topRoleCosineSimilarity: z.number().min(-1).max(1),
  roleAgreement: z.boolean(),
  riskScores: z.array(semanticRiskScoreSchema).max(3),
}).strict().superRefine((evidence, context) => {
  const expectedAgreement = evidence.selectedRole === evidence.topRole;
  if (evidence.roleAgreement !== expectedAgreement) {
    addManifestIssue(context, ['roleAgreement'], 'role agreement does not match selected and top roles');
  }
  if (
    (evidence.roleAgreement && evidence.selectedRoleRank !== 1)
    || (!evidence.roleAgreement && evidence.selectedRoleRank === 1)
  ) {
    addManifestIssue(context, ['selectedRoleRank'], 'selected role rank contradicts role agreement');
  }
  if (evidence.topRoleCosineSimilarity < evidence.selectedRoleCosineSimilarity) {
    addManifestIssue(context, ['topRoleCosineSimilarity'], 'top role score is below selected role score');
  }
  const risks = new Set<string>();
  evidence.riskScores.forEach((score, index) => {
    if (risks.has(score.risk)) {
      addManifestIssue(context, ['riskScores', index, 'risk'], 'duplicate semantic risk score');
    }
    risks.add(score.risk);
  });
});

const catalogEntrySchema = z.object({
  assetId: z.string().regex(/^sfx_catalog_[a-z0-9_-]+$/),
  title: z.string().min(1),
  audioUrl: z.string().refine(isSafeCatalogAudioUrl, {
    message: 'audioUrl must be HTTPS or a root-relative /sfx/ path',
  }),
  storagePath: z.string().min(1).optional(),
  durationMs: z.number().int().positive(),
  contentHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg']),
  eventRoles: z.array(catalogEventRoleSchema).min(1),
  surfaces: z.array(catalogSurfaceSchema).min(1),
  layerRole: catalogLayerRoleSchema,
  tags: z.array(z.string().min(1)).min(1),
  negativeTags: z.array(z.string().min(1)),
  energy: z.number().min(0).max(1),
  brightness: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  transientSharpness: z.number().min(0).max(1),
  material: z.string().min(1),
  tailMs: z.number().int().nonnegative(),
  loopable: z.boolean(),
  direction: catalogDirectionSchema,
  motionSpeed: z.enum(['still', 'slow', 'medium', 'fast']),
  trendTag: z.string().min(1).optional(),
  measurement: sfxAcousticMeasurementSchema,
  semanticEvidence: sfxCatalogSemanticEvidenceSchema.optional(),
  provenance: z.object({
    provider: z.string().min(1),
    providerAssetId: z.string().min(1),
    licenseId: z.string().min(1),
    licenseUrl: z.string().url().optional(),
    attributionRequired: z.boolean(),
    attributionText: z.string().min(1).optional(),
  }).strict(),
  audioRights: audioRightsSchema,
}).strict();

const catalogManifestSchema = z.object({
  version: z.literal('sfx-catalog-v1'),
  generatedAt: z.string().datetime(),
  knowledgeGraphRefs: z.array(z.string().min(1)).min(1),
  qualityPolicy: z.object({
    minimumSelectionScore: z.number().min(0).max(1),
    silenceFloorLufs: z.number().min(-100).max(0),
    maxTruePeakDbtp: z.number().min(-20).max(0),
    minSampleRateHz: z.number().int().positive(),
    allowedChannelCounts: z.array(z.number().int().positive()).min(1),
    blockedTags: z.array(z.string().min(1)).min(1),
  }).strict(),
  entries: z.array(catalogEntrySchema),
}).strict().superRefine((manifest, context) => {
  const assetIds = new Set<string>();
  const contentHashes = new Set<string>();

  manifest.entries.forEach((entry, index) => {
    if (assetIds.has(entry.assetId)) {
      addManifestIssue(context, ['entries', index, 'assetId'], 'duplicate catalog assetId');
    }
    if (contentHashes.has(entry.contentHashSha256)) {
      addManifestIssue(context, ['entries', index, 'contentHashSha256'], 'duplicate catalog audio content');
    }
    assetIds.add(entry.assetId);
    contentHashes.add(entry.contentHashSha256);

    if (entry.measurement.sourceHashSha256 !== entry.contentHashSha256) {
      addManifestIssue(context, ['entries', index, 'measurement', 'sourceHashSha256'], 'measurement hash does not match audio content');
    }
    if (entry.measurement.durationMs !== entry.durationMs) {
      addManifestIssue(context, ['entries', index, 'measurement', 'durationMs'], 'measurement duration does not match catalog audio');
    }
    if (
      entry.semanticEvidence
      && entry.semanticEvidence.catalogContentHashSha256 !== entry.contentHashSha256
    ) {
      addManifestIssue(
        context,
        ['entries', index, 'semanticEvidence', 'catalogContentHashSha256'],
        'semantic evidence catalog hash does not match audio content',
      );
    }
    if (
      entry.semanticEvidence
      && !entry.eventRoles.includes(entry.semanticEvidence.selectedRole)
    ) {
      addManifestIssue(
        context,
        ['entries', index, 'semanticEvidence', 'selectedRole'],
        'semantic evidence role is not declared by the catalog entry',
      );
    }
    if (entry.measurement.loudnessDb <= manifest.qualityPolicy.silenceFloorLufs) {
      addManifestIssue(context, ['entries', index, 'measurement', 'loudnessDb'], 'asset is silent or below the catalog loudness floor');
    }
    if (entry.measurement.truePeakDbtp > manifest.qualityPolicy.maxTruePeakDbtp) {
      addManifestIssue(context, ['entries', index, 'measurement', 'truePeakDbtp'], 'asset exceeds the catalog true-peak ceiling');
    }
    if (entry.measurement.sampleRateHz < manifest.qualityPolicy.minSampleRateHz) {
      addManifestIssue(context, ['entries', index, 'measurement', 'sampleRateHz'], 'asset sample rate is below the catalog floor');
    }
    if (!manifest.qualityPolicy.allowedChannelCounts.includes(entry.measurement.channelCount)) {
      addManifestIssue(context, ['entries', index, 'measurement', 'channelCount'], 'asset channel count is not render-safe');
    }
    if (entry.audioRights.evidence.sourceAssetId !== entry.assetId) {
      addManifestIssue(context, ['entries', index, 'audioRights', 'evidence', 'sourceAssetId'], 'rights receipt belongs to another asset');
    }
    if (entry.audioRights.evidence.licenseId !== entry.provenance.licenseId) {
      addManifestIssue(context, ['entries', index, 'audioRights', 'evidence', 'licenseId'], 'rights receipt does not match provenance');
    }
    if (entry.provenance.attributionRequired && !entry.provenance.attributionText) {
      addManifestIssue(context, ['entries', index, 'provenance', 'attributionText'], 'required attribution text is missing');
    }
    if (!entry.eventRoles.some(role => eventRoleAllowsLayer(role, entry.layerRole))) {
      addManifestIssue(context, ['entries', index, 'layerRole'], 'layer role is incompatible with every declared event role');
    }
    if (entry.layerRole === 'loop' && !entry.loopable) {
      addManifestIssue(context, ['entries', index, 'loopable'], 'loop layer must be marked loopable');
    }
    if (entry.tailMs > entry.durationMs) {
      addManifestIssue(context, ['entries', index, 'tailMs'], 'tail cannot exceed asset duration');
    }
  });
});

export type SfxCatalogManifest = z.infer<typeof catalogManifestSchema>;
export type SfxCatalogEntry = SfxCatalogManifest['entries'][number];
export type SfxCatalogSurface = z.infer<typeof catalogSurfaceSchema>;
export type SfxCatalogDirection = z.infer<typeof catalogDirectionSchema>;
export type SfxCatalogEventRole = z.infer<typeof catalogEventRoleSchema>;
export type SfxCatalogSemanticEvidence = z.infer<typeof sfxCatalogSemanticEvidenceSchema>;

export interface SfxCatalogSelectionRequest {
  query: string;
  maxDurationSec?: number;
  form?: AtomicSfxForm;
  surface?: SfxCatalogSurface;
  direction?: SfxCatalogDirection;
  motionSpeed?: SfxCatalogEntry['motionSpeed'];
  material?: string;
  semanticSimilarityByAssetId?: ReadonlyMap<string, number>;
}

export interface SfxCatalogCandidateReport {
  assetId: string;
  score: number;
  semanticRoleSimilarity?: number;
  semanticQuerySimilarity?: number;
  accepted: boolean;
  reasons: string[];
}

export interface SfxCatalogSelectionReport {
  version: 'sfx-catalog-selection-report-v2';
  decision: 'selected' | 'silence' | 'no-match';
  requestedRole?: SfxCatalogEventRole;
  requestedSurface?: SfxCatalogSurface;
  catalogEntryCount: number;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  selectedAssetId?: string;
  candidates: SfxCatalogCandidateReport[];
}

export interface SfxCatalogSelection {
  entry: SfxCatalogEntry | null;
  report: SfxCatalogSelectionReport;
}

export class InvalidSfxCatalogManifestError extends Error {
  readonly code = 'INVALID_SFX_CATALOG_MANIFEST';
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid SFX catalog manifest: ${issues.join('; ')}`);
    this.name = 'InvalidSfxCatalogManifestError';
    this.issues = issues;
  }
}

export function parseSfxCatalogManifest(value: unknown): SfxCatalogManifest {
  const parsed = catalogManifestSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new InvalidSfxCatalogManifestError(
    parsed.error.issues.map(issue => `${issue.path.join('.') || 'manifest'}: ${issue.message}`),
  );
}

export const BUNDLED_SFX_CATALOG = parseSfxCatalogManifest(bundledManifestJson);

export function selectSfxCatalogEntry(
  manifestValue: unknown,
  request: SfxCatalogSelectionRequest,
): SfxCatalogSelection {
  const manifest = parseSfxCatalogManifest(manifestValue);
  const requestedRole = requestedEventRole(request.form?.compatibilityToken, request.query);
  const requestedSurface = request.surface ?? inferSurface(request.form);

  if (request.form && (!request.form.shouldPlace || request.form.compatibilityToken === 'none')) {
    return {
      entry: null,
      report: emptySelectionReport(manifest, 'silence', requestedRole, requestedSurface),
    };
  }
  if (!requestedRole) {
    return {
      entry: null,
      report: emptySelectionReport(manifest, 'no-match', undefined, requestedSurface),
    };
  }

  const ranked = manifest.entries
    .map(entry => scoreCatalogEntry(manifest, entry, request, requestedRole, requestedSurface))
    .sort(compareCatalogCandidates);
  const selected = ranked.find(candidate => candidate.accepted) ?? null;

  return {
    entry: selected?.entry ?? null,
    report: {
      version: 'sfx-catalog-selection-report-v2',
      decision: selected ? 'selected' : 'no-match',
      requestedRole,
      requestedSurface,
      catalogEntryCount: manifest.entries.length,
      acceptedCandidateCount: ranked.filter(candidate => candidate.accepted).length,
      rejectedCandidateCount: ranked.filter(candidate => !candidate.accepted).length,
      selectedAssetId: selected?.entry.assetId,
      candidates: ranked.slice(0, 12).map(({
        entry,
        score,
        semanticRoleSimilarity,
        semanticQuerySimilarity,
        accepted,
        reasons,
      }) => ({
        assetId: entry.assetId,
        score: round4(score),
        semanticRoleSimilarity: semanticRoleSimilarity === undefined
          ? undefined
          : round4(semanticRoleSimilarity),
        semanticQuerySimilarity: semanticQuerySimilarity === undefined
          ? undefined
          : round4(semanticQuerySimilarity),
        accepted,
        reasons,
      })),
    },
  };
}

function scoreCatalogEntry(
  manifest: SfxCatalogManifest,
  entry: SfxCatalogEntry,
  request: SfxCatalogSelectionRequest,
  requestedRole: SfxCatalogEventRole,
  requestedSurface: SfxCatalogSurface | undefined,
): ScoredCatalogEntry {
  const reasons: string[] = [];
  const maxDurationMs = Math.round(
    (request.maxDurationSec ?? request.form?.asset.maxDurationSec ?? Number.POSITIVE_INFINITY) * 1000,
  );
  const blockedTags = manifest.qualityPolicy.blockedTags.map(normalizeTerm);
  const entryTags = [...entry.tags, ...entry.negativeTags].map(normalizeTerm);
  const blockedHits = [...new Set(
    blockedTags.filter(blocked => entryTags.some(tag => termMatchesText(blocked, tag))),
  )];
  const roleMatch = entry.eventRoles.includes(requestedRole);
  const surfaceMatch = !requestedSurface || entry.surfaces.includes(requestedSurface);
  const directionMatch = !request.direction
    || request.direction === 'neutral'
    || entry.direction === 'neutral'
    || entry.direction === request.direction;
  const requestedMotionSpeed = request.motionSpeed ?? inferMotionSpeed(request.form);
  const durationOk = entry.durationMs <= maxDurationMs;
  const semanticRoleSimilarity = entry.semanticEvidence?.selectedRole === requestedRole
    ? entry.semanticEvidence.selectedRoleCosineSimilarity
    : undefined;
  const semanticQuerySimilarity = semanticSimilarityForEntry(request, entry.assetId);

  if (!roleMatch) reasons.push('event-role-mismatch');
  if (!surfaceMatch) reasons.push('surface-mismatch');
  if (!directionMatch) reasons.push('direction-mismatch');
  if (!durationOk) reasons.push('duration-too-long');
  if (blockedHits.length > 0) reasons.push(`blocked-tags:${blockedHits.join(',')}`);

  const atomicEvaluation = request.form
    ? evaluateAtomicSfxAssetCandidate(request.form, {
      durationMs: entry.durationMs,
      source: 'catalog',
      originalTitle: entry.title,
      tags: [
        ...entry.tags,
        ...entry.eventRoles,
        ...entry.surfaces,
        entry.material,
        entry.layerRole,
      ],
      providerId: entry.provenance.providerAssetId,
    })
    : undefined;
  if (atomicEvaluation && !atomicEvaluation.accepted) {
    reasons.push(...atomicEvaluation.reasons.filter(reason => reason !== 'candidate-rejected'));
  }

  const queryScore = termOverlapScore(request.query, catalogSearchText(entry));
  let score = 0;
  if (roleMatch) score += 0.32;
  score += requestedSurface ? (surfaceMatch ? 0.14 : 0) : 0.1;
  score += queryScore * 0.18;
  score += request.direction
    ? (entry.direction === request.direction ? 0.06 : entry.direction === 'neutral' ? 0.03 : 0)
    : 0.04;
  score += requestedMotionSpeed === entry.motionSpeed ? 0.05 : 0;
  score += request.material && normalizeTerm(request.material) === normalizeTerm(entry.material) ? 0.04 : 0;
  score += request.form
    ? proximityScore(request.form.brightness, entry.brightness) * 0.09
      + proximityScore(request.form.lowEndWeight, entry.weight) * 0.09
      + proximityScore(request.form.intensity, entry.energy) * 0.08
      + proximityScore(request.form.transientSharpness, entry.transientSharpness) * 0.07
      + proximityScore(
        request.form.primitiveAtoms.tail.tailFrames / 30 * 1000,
        entry.tailMs,
        Math.max(250, entry.durationMs),
      ) * 0.05
      + (atomicEvaluation?.score ?? 0) * 0.1
    : 0.12;
  score = clamp01(score);

  const hardRejected = !roleMatch
    || !surfaceMatch
    || !directionMatch
    || !durationOk
    || blockedHits.length > 0
    || Boolean(atomicEvaluation && !atomicEvaluation.accepted);
  const accepted = !hardRejected && score >= manifest.qualityPolicy.minimumSelectionScore;
  reasons.unshift(
    accepted ? 'catalog-candidate-accepted' : 'catalog-candidate-rejected',
    `score:${score.toFixed(2)}`,
    `floor:${manifest.qualityPolicy.minimumSelectionScore.toFixed(2)}`,
    ...(semanticRoleSimilarity === undefined
      ? []
      : [`semantic-role-similarity:${semanticRoleSimilarity.toFixed(4)}`]),
    ...(semanticQuerySimilarity === undefined
      ? []
      : [`semantic-query-similarity:${semanticQuerySimilarity.toFixed(4)}`]),
  );

  return {
    entry,
    score,
    semanticRoleSimilarity,
    semanticQuerySimilarity,
    accepted,
    reasons,
  };
}

interface ScoredCatalogEntry {
  entry: SfxCatalogEntry;
  score: number;
  semanticRoleSimilarity?: number;
  semanticQuerySimilarity?: number;
  accepted: boolean;
  reasons: string[];
}

function compareCatalogCandidates(left: ScoredCatalogEntry, right: ScoredCatalogEntry): number {
  if (left.accepted !== right.accepted) return left.accepted ? -1 : 1;
  if (left.accepted && right.accepted) {
    if (
      left.semanticQuerySimilarity !== undefined
      && right.semanticQuerySimilarity !== undefined
      && left.semanticQuerySimilarity !== right.semanticQuerySimilarity
    ) {
      return right.semanticQuerySimilarity - left.semanticQuerySimilarity;
    }
    const leftHasSemanticEvidence = left.semanticRoleSimilarity !== undefined;
    const rightHasSemanticEvidence = right.semanticRoleSimilarity !== undefined;
    if (leftHasSemanticEvidence !== rightHasSemanticEvidence) {
      return leftHasSemanticEvidence ? -1 : 1;
    }
    if (
      left.semanticRoleSimilarity !== undefined
      && right.semanticRoleSimilarity !== undefined
      && left.semanticRoleSimilarity !== right.semanticRoleSimilarity
    ) {
      return right.semanticRoleSimilarity - left.semanticRoleSimilarity;
    }
  }
  return right.score - left.score || left.entry.assetId.localeCompare(right.entry.assetId);
}

function semanticSimilarityForEntry(
  request: SfxCatalogSelectionRequest,
  assetId: string,
): number | undefined {
  const value = request.semanticSimilarityByAssetId?.get(assetId);
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RangeError(`Invalid semantic SFX similarity for ${assetId}`);
  }
  return value;
}

function requestedEventRole(
  token: AtomicSfxCompatibilityToken | undefined,
  query: string,
): SfxCatalogEventRole | undefined {
  const normalized = normalizeTerm(query);
  if (token === 'tick' && /\bpop\b/.test(normalized)) return 'pop';
  if (token === 'shimmer' && /\b(logo|sting|stinger)\b/.test(normalized)) {
    return 'logo-sting';
  }
  if (token && token !== 'none') return TOKEN_TO_EVENT_ROLE[token];
  if (/\b(whoosh|swoosh|swish|whip|sweep|swoop)\b/.test(normalized)) return 'whoosh';
  if (/\b(impact|hit|boom|thud|slam|punch|drop)\b/.test(normalized)) return 'impact';
  if (/\b(riser|rise|swell|build|cymbal)\b/.test(normalized)) return 'riser';
  if (/\b(pop)\b/.test(normalized)) return 'pop';
  if (/\b(tick|click|ding|beep|blip|chime|notification|snap)\b/.test(normalized)) return 'tick';
  if (/\b(logo|sting|stinger)\b/.test(normalized)) return 'logo-sting';
  if (/\b(shimmer|sparkle|shine|glint|twinkle)\b/.test(normalized)) return 'shimmer';
  if (/\b(ambient|ambience|room|traffic|wind|rain|ocean|forest|crowd|chatter)\b/.test(normalized)) return 'ambience';
  if (/\b(foley|footstep|rustle|cloth|paper|door|typing|breath)\b/.test(normalized)) return 'foley';
  return undefined;
}

function inferSurface(form: AtomicSfxForm | undefined): SfxCatalogSurface | undefined {
  if (!form) return undefined;
  if (form.timing.anchor === 'transition') return 'transition';
  if (form.timing.anchor === 'mg-landing') return 'motion-graphic';
  if (form.timing.anchor === 'scene-bed') return 'scene';
  if (form.intent === 'ui-punctuation') return 'ui';
  return 'scene';
}

function inferMotionSpeed(form: AtomicSfxForm | undefined): SfxCatalogEntry['motionSpeed'] | undefined {
  if (!form) return undefined;
  if (form.compatibilityToken === 'ambient') return 'still';
  if (form.compatibilityToken === 'riser') return form.intensity >= 0.72 ? 'fast' : 'medium';
  if (form.intensity >= 0.72) return 'fast';
  if (form.intensity >= 0.42) return 'medium';
  return 'slow';
}

function emptySelectionReport(
  manifest: SfxCatalogManifest,
  decision: SfxCatalogSelectionReport['decision'],
  requestedRole?: SfxCatalogEventRole,
  requestedSurface?: SfxCatalogSurface,
): SfxCatalogSelectionReport {
  return {
    version: 'sfx-catalog-selection-report-v2',
    decision,
    requestedRole,
    requestedSurface,
    catalogEntryCount: manifest.entries.length,
    acceptedCandidateCount: 0,
    rejectedCandidateCount: 0,
    candidates: [],
  };
}

function catalogSearchText(entry: SfxCatalogEntry): string {
  return [
    entry.title,
    ...entry.tags,
    ...entry.eventRoles,
    ...entry.surfaces,
    entry.layerRole,
    entry.material,
    entry.trendTag,
  ].filter(Boolean).join(' ');
}

function termOverlapScore(query: string, candidateText: string): number {
  const terms = uniqueTerms(query);
  if (terms.length === 0) return 0;
  const haystack = normalizeTerm(candidateText);
  return terms.filter(term => new RegExp(`\\b${escapeRegExp(term)}`).test(haystack)).length / terms.length;
}

function uniqueTerms(value: string): string[] {
  return [...new Set(
    normalizeTerm(value)
      .split(/\s+/)
      .filter(term => term.length >= 3 && !QUERY_STOP_WORDS.has(term)),
  )].slice(0, 8);
}

function normalizeTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function proximityScore(target: number, actual: number, range = 1): number {
  return 1 - Math.min(1, Math.abs(target - actual) / Math.max(Number.EPSILON, range));
}

function isSafeCatalogAudioUrl(value: string): boolean {
  if (value.startsWith('/sfx/')) return !value.includes('..');
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function addManifestIssue(
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  context.addIssue({ code: 'custom', path, message });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termMatchesText(term: string, text: string): boolean {
  return Boolean(term) && new RegExp(`\\b${escapeRegExp(term)}\\b`).test(text);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const TOKEN_TO_EVENT_ROLE: Record<Exclude<AtomicSfxCompatibilityToken, 'none'>, SfxCatalogEventRole> = {
  impact: 'impact',
  whoosh: 'whoosh',
  riser: 'riser',
  tick: 'tick',
  shimmer: 'shimmer',
  ambient: 'ambience',
  foley: 'foley',
};

function eventRoleAllowsLayer(
  role: SfxCatalogEventRole,
  layer: SfxCatalogEntry['layerRole'],
): boolean {
  switch (role) {
    case 'whoosh':
    case 'tick':
    case 'pop':
    case 'foley':
      return layer === 'oneshot';
    case 'impact':
      return layer === 'impact' || layer === 'oneshot';
    case 'riser':
      return layer === 'riser';
    case 'logo-sting':
      return layer === 'sting';
    case 'ambience':
      return layer === 'bed' || layer === 'loop';
    case 'shimmer':
      return layer === 'oneshot' || layer === 'sting';
  }
}

const QUERY_STOP_WORDS = new Set([
  'sound',
  'sounds',
  'effect',
  'effects',
  'audio',
  'with',
  'from',
  'that',
  'this',
]);
