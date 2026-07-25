/**
 * SFX Library Service
 *
 * Searches provider sound-effect APIs and materializes only the selected asset.
 * Tier 2 approach: deterministic SFX from vetted libraries instead of AI generation
 * when possible.
 *
 * Primary provider: Freesound API (filter CC0 only)
 * Storage: uploadMedia, which is R2-first when Cloudflare is configured.
 *
 * Usage:
 *   const sfx = await searchSFXLibrary("whoosh futuristic");
 *   // Returns { url, filename, duration, source }
 */

import { uploadMedia } from '@/lib/editron/services/upload-service';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import {
  evaluateAtomicSfxAssetCandidate,
  type AtomicSfxCandidateEvaluation,
  type AtomicSfxForm,
} from '@/lib/editron/services/sfx-form';
import {
  BUNDLED_SFX_CATALOG,
  selectSfxCatalogEntry,
  type SfxCatalogManifest,
  type SfxCatalogSelectionReport,
} from '@/lib/pipeline/sfx-catalog';
import { nanoid } from 'nanoid';

export interface SFXLibraryResult {
  audioUrl: string;
  gcsPath: string | null;
  audioAssetId: string;
  durationMs: number;
  audioRights: AudioRightsContract;
  source: 'catalog' | 'pixabay' | 'freesound';
  originalTitle?: string;
}

export type SFXLibrarySearchFailureReason =
  | 'no-provider-candidates'
  | 'all-candidates-rejected'
  | 'form-resolved-silence'
  | 'download-failed'
  | 'non-audio-download'
  | 'upload-failed';

export interface SFXLibraryCandidateReport {
  providerId?: string;
  source: SFXLibraryResult['source'];
  title: string;
  durationMs: number;
  rating?: number;
  score: number;
  accepted: boolean;
  decision?: AtomicSfxCandidateEvaluation['decision'];
  qualityScore?: number;
  qualityFloor?: number;
  reasons: string[];
}

export interface SFXLibrarySearchReport {
  version: 'sfx-library-search-report-v1';
  query: string;
  maxDurationSec?: number;
  atomicGate: boolean;
  selectionLane: 'catalog' | 'provider' | 'none';
  catalog: SfxCatalogSelectionReport;
  providerCandidateCount: number;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  selectedCandidate?: SFXLibraryCandidateReport;
  failureReason?: SFXLibrarySearchFailureReason;
  candidates: SFXLibraryCandidateReport[];
}

export type SFXLibrarySearchReporter = (report: SFXLibrarySearchReport) => void;

interface SFXProviderCandidate {
  id: string;
  url: string;
  title: string;
  duration: number;
  source: SFXLibraryResult['source'];
  tags: string[];
  rating?: number;
}

interface SFXSearchProvider {
  source: SFXProviderCandidate['source'];
  search(query: string, maxDuration?: number): Promise<SFXProviderCandidate[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

const SFX_SEARCH_PROVIDERS: SFXSearchProvider[] = [
  {
    source: 'freesound',
    search: searchFreesound,
  },
];

// ─── Freesound API ───────────────────────────────────────────────
// Docs: https://freesound.org/docs/api/
// Filter for CC0 license only — free for commercial, no attribution.

async function searchFreesound(
  query: string,
  maxDuration?: number,
): Promise<SFXProviderCandidate[]> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    console.error('[SFXLib] FREESOUND_API_KEY not set — SFX search unavailable. Set this env var on Vercel to enable sound effects. Free key: https://freesound.org/apiv2/apply/');
    return [];
  }

  try {
    const params = new URLSearchParams({
      query,
      token: apiKey,
      fields: 'id,name,duration,previews,license,tags,avg_rating',
      filter: 'license:"Creative Commons 0"', // CC0 only
      page_size: '8',
      sort: 'rating_desc',
    });

    if (maxDuration) {
      params.set('filter', `license:"Creative Commons 0" duration:[0 TO ${maxDuration + 2}]`);
    }

    const res = await fetch(`https://freesound.org/apiv2/search/?${params}`);
    if (!res.ok) {
      console.warn(`[SFXLib] Freesound search failed: ${res.status}`);
      return [];
    }

    const data = await res.json() as { results?: unknown };
    const results = Array.isArray(data.results) ? data.results : [];
    return results
      .map((item): SFXProviderCandidate | null => {
        if (!isRecord(item)) return null;
        const previews = isRecord(item.previews) ? item.previews : {};
        const previewUrl = stringValue(previews['preview-hq-mp3']) || stringValue(previews['preview-lq-mp3']);
        if (!previewUrl) return null;
        if (item.id === undefined || item.id === null) return null;
        return {
          id: String(item.id),
          url: previewUrl,
          title: stringValue(item.name) || query,
          duration: Math.max(0.1, Number(item.duration) || 5),
          source: 'freesound',
          tags: Array.isArray(item.tags) ? item.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
          rating: typeof item.avg_rating === 'number' ? item.avg_rating : undefined,
        };
      })
      .filter((candidate): candidate is SFXProviderCandidate => Boolean(candidate));
  } catch (err: unknown) {
    console.error(`[SFXLib] Freesound error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Search for a sound effect from provider APIs.
 * Atomic forms score provider candidates before any download/upload happens.
 *
 * @param query - Search keywords (e.g., "whoosh futuristic", "city ambient", "UI click")
 * @param userId - For upload scoping
 * @param maxDurationSec - Maximum clip duration in seconds
 * @param atomicForm - Optional atomic SFX form used as the quality gate
 * @returns SFX result with playable CDN URL, or null if nothing acceptable was found
 */
export async function searchAndDownloadSFX(
  query: string,
  userId: string,
  maxDurationSec?: number,
  atomicForm?: AtomicSfxForm,
  reportSearch?: SFXLibrarySearchReporter,
  catalogManifest: SfxCatalogManifest = BUNDLED_SFX_CATALOG,
): Promise<SFXLibraryResult | null> {
  const catalogSelection = selectSfxCatalogEntry(catalogManifest, {
    query,
    maxDurationSec,
    form: atomicForm,
  });
  if (catalogSelection.entry) {
    const entry = catalogSelection.entry;
    const candidateReport = catalogSelection.report.candidates.find(candidate => candidate.assetId === entry.assetId);
    reportSearch?.({
      version: 'sfx-library-search-report-v1',
      query,
      maxDurationSec,
      atomicGate: Boolean(atomicForm),
      selectionLane: 'catalog',
      catalog: catalogSelection.report,
      providerCandidateCount: 0,
      acceptedCandidateCount: 1,
      rejectedCandidateCount: catalogSelection.report.rejectedCandidateCount,
      selectedCandidate: {
        providerId: entry.provenance.providerAssetId,
        source: 'catalog',
        title: entry.title,
        durationMs: entry.durationMs,
        score: candidateReport?.score ?? 0,
        accepted: true,
        decision: 'accept',
        reasons: candidateReport?.reasons ?? ['catalog-candidate-accepted'],
      },
      candidates: [],
    });
    console.log(`[SFXLib] Selected catalog asset: "${entry.title}" (${entry.durationMs}ms)`);
    return {
      audioUrl: entry.audioUrl,
      gcsPath: entry.storagePath ?? null,
      audioAssetId: entry.assetId,
      durationMs: entry.durationMs,
      audioRights: entry.audioRights,
      source: 'catalog',
      originalTitle: entry.title,
    };
  }

  if (catalogSelection.report.decision === 'silence') {
    reportSearch?.({
      version: 'sfx-library-search-report-v1',
      query,
      maxDurationSec,
      atomicGate: Boolean(atomicForm),
      selectionLane: 'none',
      catalog: catalogSelection.report,
      providerCandidateCount: 0,
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 0,
      failureReason: 'form-resolved-silence',
      candidates: [],
    });
    return null;
  }

  console.log(`[SFXLib] Searching providers: "${query}" (maxDuration=${maxDurationSec || 'any'}s)`);

  const candidates = await searchProviderCandidates(query, maxDurationSec);

  // NOTE: Pixabay fallback REMOVED — their general API (/api/) returns images, not audio.
  // The image URLs (previewURL, webformatURL) were being downloaded as "audio" files,
  // resulting in JPEG data stored with audio/mpeg content type. These never play.
  // Pixabay's actual audio API (/api/music/) requires special access we don't have.

  const ranked = rankProviderCandidates(query, candidates, maxDurationSec, atomicForm);
  const threshold = atomicForm ? 0 : 0.52;
  const selected = ranked.find((item) => item.score >= threshold) ?? null;
  let report = buildSfxSearchReport(
    query,
    maxDurationSec,
    atomicForm,
    catalogSelection.report,
    ranked,
    selected,
  );
  if (!selected) {
    report = {
      ...report,
      failureReason: candidates.length === 0 ? 'no-provider-candidates' : 'all-candidates-rejected',
    };
    reportSearch?.(report);
    console.warn(`[SFXLib] No acceptable provider candidates for "${query}"`);
    return null;
  }
  reportSearch?.(report);

  const { candidate, quality } = selected;
  console.log(`[SFXLib] Selected ${candidate.source}: "${candidate.title}" (${candidate.duration}s, score=${selected.score.toFixed(2)})`);

  // Download and upload through the existing media service. That service is R2-first
  // when Cloudflare credentials are configured, with GCS as fallback.
  try {
    const response = await fetch(candidate.url);
    if (!response.ok) {
      reportSearch?.({ ...report, failureReason: 'download-failed' });
      console.error(`[SFXLib] Failed to download from ${candidate.source}: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Validate the downloaded content is actually audio, not an image or HTML error page
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
      // Check first bytes for common non-audio signatures
      const header = buffer.slice(0, 4).toString('hex');
      const isJPEG = header.startsWith('ffd8ff');
      const isPNG = header === '89504e47';
      const isHTML = buffer.slice(0, 20).toString('utf-8').trim().startsWith('<');
      if (isJPEG || isPNG || isHTML) {
        reportSearch?.({ ...report, failureReason: 'non-audio-download' });
        console.error(`[SFXLib] Downloaded file is NOT audio (${isJPEG ? 'JPEG' : isPNG ? 'PNG' : 'HTML'}). Source returned wrong content. Skipping.`);
        return null;
      }
    }

    const assetId = `sfx_lib_${nanoid(8)}`;
    const ext = candidate.url.includes('.wav') ? 'wav' : 'mp3';
    const uploadResult = await uploadMedia(buffer, userId, `${assetId}.${ext}`, `audio/${ext === 'wav' ? 'wav' : 'mpeg'}`, { customAssetId: assetId });
    const audioRights: AudioRightsContract = {
      mediaRole: 'sfx',
      source: 'library',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'library-license',
        sourceAssetId: uploadResult.assetId,
        licenseId: `freesound:${candidate.id}:creative-commons-0`,
      },
    };

    // Persist to media_assets so asset-resolver can find it later.
    // Without this, SFX overlays reference assetIds that don't exist in MongoDB
    // → "[AssetResolver] Asset NOT FOUND in media_assets: sfx_lib_*"
    try {
      const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
      const db = await getDatabase();
      await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        { assetId: uploadResult.assetId },
        {
          $set: {
            audioRights,
          },
          $setOnInsert: {
            assetId: uploadResult.assetId,
            userId,
            type: 'audio',
            filename: `${assetId}.${ext}`,
            source: `sfx-provider-${candidate.source}`,
            cachedUrl: uploadResult.signedUrl,
            gcsPath: uploadResult.gcsPath,
            r2Key: uploadResult.r2Key,
            duration: candidate.duration,
            size: buffer.length,
            originalTitle: candidate.title,
            sfxQuery: query,
            sfxProviderId: candidate.id,
            sfxLibrarySource: candidate.source,
            tags: normalizedSfxQueryTerms(`${query} ${candidate.title} ${candidate.tags.join(' ')}`),
            providerCandidateAccepted: true,
            assetQualityScore: quality?.score,
            assetQualityFloor: quality?.qualityFloor,
            assetQualityReasons: quality?.reasons,
            uploadedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (dbErr: unknown) {
      const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.warn(`[SFXLib] media_assets persist failed (non-fatal): ${dbMsg}`);
    }

    return {
      audioUrl: uploadResult.signedUrl,
      gcsPath: uploadResult.gcsPath ?? null,
      audioAssetId: uploadResult.assetId,
      durationMs: Math.round(candidate.duration * 1000),
      audioRights,
      source: candidate.source,
      originalTitle: candidate.title,
    };
  } catch (err: any) {
    reportSearch?.({ ...report, failureReason: 'upload-failed' });
    console.error(`[SFXLib] Download/upload failed: ${err.message}`);
    return null;
  }
}

function rankProviderCandidates(
  query: string,
  candidates: SFXProviderCandidate[],
  maxDurationSec?: number,
  atomicForm?: AtomicSfxForm,
): Array<{ candidate: SFXProviderCandidate; score: number; quality?: AtomicSfxCandidateEvaluation }> {
  if (candidates.length === 0) return [];

  return candidates
    .map((candidate) => {
      if (atomicForm) {
        const quality = evaluateAtomicSfxAssetCandidate(atomicForm, {
          source: candidate.source,
          originalTitle: candidate.title,
          durationMs: Math.round(candidate.duration * 1000),
          tags: candidate.tags,
          providerId: candidate.id,
          rating: candidate.rating,
        });
        return {
          candidate,
          quality,
          score: quality.accepted ? quality.score + providerRatingScore(candidate) * 0.04 : -1,
        };
      }

      return {
        candidate,
        score: scoreProviderCandidateByQuery(query, candidate, maxDurationSec),
        quality: undefined,
      };
    })
    .sort((a, b) =>
      b.score - a.score
      || providerRatingScore(b.candidate) - providerRatingScore(a.candidate)
      || a.candidate.duration - b.candidate.duration
      || a.candidate.title.localeCompare(b.candidate.title),
    );
}

function buildSfxSearchReport(
  query: string,
  maxDurationSec: number | undefined,
  atomicForm: AtomicSfxForm | undefined,
  catalog: SfxCatalogSelectionReport,
  ranked: Array<{ candidate: SFXProviderCandidate; score: number; quality?: AtomicSfxCandidateEvaluation }>,
  selected: { candidate: SFXProviderCandidate; score: number; quality?: AtomicSfxCandidateEvaluation } | null,
): SFXLibrarySearchReport {
  const threshold = atomicForm ? 0 : 0.52;
  const candidateReports = ranked.slice(0, 8).map((item) => summarizeProviderCandidate(item, threshold));
  const selectedReport = selected ? summarizeProviderCandidate(selected, threshold) : undefined;
  return {
    version: 'sfx-library-search-report-v1',
    query,
    maxDurationSec,
    atomicGate: Boolean(atomicForm),
    selectionLane: selected ? 'provider' : 'none',
    catalog,
    providerCandidateCount: ranked.length,
    acceptedCandidateCount: ranked.filter((item) => item.score >= threshold).length,
    rejectedCandidateCount: ranked.filter((item) => item.score < threshold).length,
    selectedCandidate: selectedReport,
    candidates: candidateReports,
  };
}

function summarizeProviderCandidate(
  item: { candidate: SFXProviderCandidate; score: number; quality?: AtomicSfxCandidateEvaluation },
  threshold: number,
): SFXLibraryCandidateReport {
  const quality = item.quality;
  return {
    providerId: item.candidate.id,
    source: item.candidate.source,
    title: item.candidate.title,
    durationMs: Math.round(item.candidate.duration * 1000),
    rating: item.candidate.rating,
    score: round4(item.score),
    accepted: item.score >= threshold,
    decision: quality?.decision,
    qualityScore: quality ? round4(quality.score) : undefined,
    qualityFloor: quality ? round4(quality.qualityFloor) : undefined,
    reasons: quality?.reasons.slice(0, 8) ?? [],
  };
}

async function searchProviderCandidates(
  query: string,
  maxDurationSec?: number,
): Promise<SFXProviderCandidate[]> {
  const providerResults = await Promise.all(
    SFX_SEARCH_PROVIDERS.map(async (provider) => {
      try {
        return await provider.search(query, maxDurationSec);
      } catch (err: unknown) {
        console.warn(`[SFXLib] ${provider.source} provider failed: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    }),
  );
  return providerResults.flat();
}

function scoreProviderCandidateByQuery(
  query: string,
  candidate: SFXProviderCandidate,
  maxDurationSec?: number,
): number {
  const text = candidateSearchText(candidate);
  const terms = normalizedSfxQueryTerms(query);
  const matchedTerms = terms.filter((term) => termMatchesText(term, text));
  const durationOk = !maxDurationSec || candidate.duration <= maxDurationSec + 1;
  const badAudioRole = /\b(voiceover|narration|bgm|music|song|vocal|meme|distorted|clipping|noisy)\b/.test(text);

  let score = 0;
  if (candidate.url) score += 0.18;
  if (durationOk) score += 0.18;
  if (matchedTerms.length > 0) score += 0.36;
  score += Math.min(0.18, Math.max(0, matchedTerms.length - 1) * 0.06);
  score += providerRatingScore(candidate) * 0.08;
  if (badAudioRole) score -= 0.42;
  if (!durationOk) score -= 0.36;

  return score;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function providerRatingScore(candidate: SFXProviderCandidate): number {
  if (typeof candidate.rating !== 'number' || !Number.isFinite(candidate.rating)) return 0;
  return Math.max(0, Math.min(1, candidate.rating / 5));
}

function candidateSearchText(candidate: SFXProviderCandidate): string {
  return [
    candidate.id,
    candidate.title,
    candidate.source,
    candidate.tags.join(' '),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function normalizedSfxQueryTerms(query: string): string[] {
  const terms = new Set<string>();
  const normalized = (query || '').toLowerCase().replace(/[^\w\s-]/g, ' ');
  for (const word of normalized.split(/\s+/)) {
    const term = word.trim();
    if (term.length >= 3 && !SFX_STOP_WORDS.has(term)) terms.add(term);
    if (terms.size >= 6) break;
  }
  return [...terms];
}

function termMatchesText(term: string, text: string): boolean {
  if (!term || !text) return false;
  return new RegExp(`\\b${escapeRegExp(term.toLowerCase())}`).test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * KB atomic tokens for SFX library search.
 *
 * BACKGROUND (why this changed 2026-04-16):
 * The previous implementation joined up to 5 filtered keywords into a compound
 * query like "climactic whoosh strong impact hit crowd cheering". Pixabay/Freesound
 * index sounds by single-word tags — compound phrases return zero matches.
 * Nike test (proj_o0IBr1ParZJQ, 2026-04-14): 3 searches, 0 hits, silent output.
 *
 * NEW STRATEGY (rule-driven per Rule 18N — reduce LLM dependency):
 * Extract ONE atomic token from the description using DIRECTOR_KB Part 9 vocabulary
 * first, fallback to ambient tokens for environment beds, last resort to generic 'ambient'.
 *
 * WHY THIS WORKS: SFX libraries are indexed by single-word descriptors. A sound
 * designer searching for a transition whoosh types "whoosh", not
 * "climactic whoosh, strong impact hit, subtle crowd cheering". We do the same.
 */

// Primary SFX primitives from DIRECTOR_KNOWLEDGE_BASE.md Part 9 (rules A-001 to A-021).
// Stem-match via \bTOKEN catches TOKEN, TOKENs, TOKENing, TOKENful, etc.
// Order = priority: earlier tokens win if multiple match in the same description.
const KB_PRIMARY_TOKENS: string[] = [
  // A-001: transition SFX (dissolve/wipe/slide/swish-pan/film-burn)
  'whoosh',        // primary
  'swoosh',        // common synonym
  'swish',         // scripts often use "swish" for fabric/movement
  // A-002: zoom-punch / flash transitions (impact-hit)
  'impact',        // stem covers impactful, impacting
  'thud',          // related percussive
  'boom',          // low-frequency impact
  // A-010: pre-reveal tension
  'riser',
  // A-011: pre-beat-drop anticipation
  'cymbal',        // matches "reverse-cymbal" via stem
  // A-020: graphic entrance (non-cinematic)
  'pop',
  'notification',
  // A-021: stat-counter landing
  'click',
  'ding',
  'chime',
  'bell',
  // Orchestral/musical stingers
  'stinger',
  'flourish',
  // Generic percussive fallback
  'hit',
];

// Ambient / environment tokens for scene-level sound beds.
// Checked after primary tokens fail to match.
const KB_AMBIENT_TOKENS: string[] = [
  'crowd',
  'cheer',
  'applause',
  'footstep',
  'footfall',
  'breath',        // stem covers breathing
  'gasp',
  'laugh',
  'rustle',
  'traffic',
  'nature',
  'forest',
  'ocean',
  'waves',
  'rain',
  'wind',
  'river',
  'birds',
  'fire',
  'crackle',
  'typing',
  'chatter',
  'ambient',       // generic bed fallback
];

// Stopwords for the noun-extraction fallback path.
const SFX_STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','as',
  'is','was','are','were','been','be','have','has','had','do','does','did',
  'will','would','could','should','may','might','shall','can',
  'this','that','these','those','it','its','they','them','their',
  'sound','sounds','effect','effects',
  // Qualifiers (not nouns — never useful as search terms)
  'subtle','gentle','soft','faint','slight','quiet','strong','sudden','sharp','clean',
  'climactic','rhythmic','atmospheric','dynamic','cinematic','triumphant','epic',
  'deep','loud','light','heavy','slow','fast','quick','brief',
]);

/**
 * Convert a free-form audio description into a single atomic search token
 * for SFX library lookup.
 *
 * Strategy (rule-based, deterministic — Rule 18N):
 * 1. Match highest-priority KB primary token (DIRECTOR_KB Part 9 primitives).
 * 2. If no primary match, try KB ambient tokens for environment beds.
 * 3. Fallback: extract first meaningful noun after stopword filtering.
 * 4. Last resort: 'ambient' (function never returns empty string).
 *
 * @example
 *   "climactic whoosh, strong impact hit, subtle crowd cheering, triumphant flourish"
 *     → "whoosh"  (A-001 primary)
 *   "sudden impactful hit, sharp punchy sound design, sprinter's footfalls"
 *     → "impact"  (A-002 primary — 'impactful' stem-matches 'impact')
 *   "swish of fabric, impact of feet, rhythmic breathing, athletic environment"
 *     → "swish"   (A-001 synonym wins over 'impact' by priority)
 *   "office chatter with typing sounds"
 *     → "chatter" (ambient token — no primary match)
 *   "soft music swell"
 *     → "ambient" (no KB match, no nouns > 3 chars)
 */
export function audioDescriptionToSearchQuery(audioDescription: string): string {
  const desc = (audioDescription || '').toLowerCase().trim();
  if (!desc) return 'ambient';

  // 1. Primary KB tokens (transition/feature SFX primitives — DIRECTOR_KB Part 9)
  for (const token of KB_PRIMARY_TOKENS) {
    const regex = new RegExp(`\\b${token}`, 'i');
    if (regex.test(desc)) return token;
  }

  // 2. Ambient / environment tokens (scene beds)
  for (const token of KB_AMBIENT_TOKENS) {
    const regex = new RegExp(`\\b${token}`, 'i');
    if (regex.test(desc)) return token;
  }

  // 3. Fallback: first meaningful noun from stopword-filtered description
  const words = desc
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !SFX_STOP_WORDS.has(w));

  // 4. Last resort guarantee: never return empty — 'ambient' always has library matches
  return words[0] || 'ambient';
}

/**
 * Check if SFX library search can return results.
 *
 * Callers must not reserve SFX budget when the only library provider cannot run.
 * Unfulfilled intent belongs in the quality receipt, not a fake capability.
 */
export function isSFXLibraryAvailable(): boolean {
  return BUNDLED_SFX_CATALOG.entries.length > 0 || Boolean(process.env.FREESOUND_API_KEY?.trim());
}
