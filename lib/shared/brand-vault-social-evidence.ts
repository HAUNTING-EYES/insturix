import { BRAND_CONFIDENCE } from './brand-confidence';
import { sanitizeEvidenceExcerpt } from './brand-signal-profile';
import type {
  BrandEvidenceCandidate,
  BrandVaultSourceInput,
  BrandVaultSourcePlatform,
} from './brand-website-refinery-types';

export const BRAND_VAULT_SOCIAL_EVIDENCE_EXTRACTOR = 'brand-vault-social-evidence.v1';

export type BrandVaultSocialAccountType =
  | 'company_page'
  | 'creator_profile'
  | 'channel'
  | 'video'
  | 'post'
  | 'page'
  | 'profile'
  | 'unknown';

export interface BrandVaultParsedSocialUrl {
  originalUrl: string;
  normalizedUrl: string;
  platform: BrandVaultSourcePlatform;
  handle?: string;
  contentId?: string;
  accountType: BrandVaultSocialAccountType;
  isPostUrl: boolean;
  confidence: number;
}

export interface BrandVaultSocialCapability {
  evidenceAccess:
    | 'profile_url_only'
    | 'post_url_only'
    | 'manual_post_text'
    | 'connected_profile_metadata'
    | 'connected_post_sample'
    | 'connected_post_read_possible';
  liveFetchStatus: 'adapter_required' | 'available_with_connected_account' | 'metadata_only' | 'public_fallback_available';
  connectedAccountStatus:
    | 'connected'
    | 'connected_different_account'
    | 'scope_missing'
    | 'not_connected'
    | 'scope_audit_required';
  publicFallbackStatus: 'review_only';
  pinnedContentStatus: 'manual_selected_pinned' | 'connected_pinned_read' | 'platform_pinned_supported' | 'not_assumed';
}

export function createBrandVaultSocialEvidenceCandidates(args: {
  brandId?: string;
  jobId: string;
  source: BrandVaultSourceInput;
  sourceField: string;
  startIndex: number;
  observedAt: string;
}): BrandEvidenceCandidate[] {
  if (args.source.kind !== 'social_profile' && args.source.kind !== 'social_post') return [];

  const candidates: BrandEvidenceCandidate[] = [];
  const parsed = parseBrandVaultSocialUrl(args.source.url ?? '', args.source.platform);
  const capability = socialCapability(args.source, parsed);
  candidates.push(
    socialCandidate({
      ...args,
      index: args.startIndex + candidates.length,
      sourceField: `${args.sourceField}.socialIdentity`,
      signalPath: 'voice.recurringPhrases',
      rawValue: {
        url: args.source.url,
        name: args.source.name,
        platform: args.source.platform,
        pinned: args.source.pinned,
        publishedAt: args.source.publishedAt,
        media: args.source.media,
        metrics: args.source.metrics,
        profile: args.source.profile,
        evidenceOrigin: args.source.evidenceOrigin,
        connection: args.source.connection,
      },
      normalizedValue: {
        platform: parsed?.platform ?? normalizeSocialPlatform(args.source.platform),
        url: parsed?.normalizedUrl ?? args.source.url,
        handle: parsed?.handle,
        contentId: parsed?.contentId,
        accountType: parsed?.accountType ?? 'unknown',
        isPostUrl: parsed?.isPostUrl ?? args.source.kind === 'social_post',
        capability,
        pinned: args.source.pinned === true,
        publishedAt: args.source.publishedAt,
        media: args.source.media,
        metrics: args.source.metrics,
        profile: args.source.profile,
        evidenceOrigin: args.source.evidenceOrigin,
        connection: args.source.connection,
      },
      excerpt: socialIdentityExcerpt(args.source, parsed),
      confidence: confidenceForSocialIdentity(args.source, parsed),
    }),
  );

  const text = normalizeSocialText(args.source.text);
  if (!text) return candidates;

  const voicePhrases = extractSocialVoicePhrases(text);
  if (voicePhrases.length > 0) {
    candidates.push(
      socialCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.text.voicePhrases`,
        signalPath: 'voice.recurringPhrases',
        rawValue: socialRawValue(args.source, text),
        normalizedValue: voicePhrases,
        excerpt: voicePhrases.join(' | '),
        confidence: args.source.pinned ? BRAND_CONFIDENCE.SOCIAL.VOICE_PHRASES_PINNED : BRAND_CONFIDENCE.SOCIAL.VOICE_PHRASES_SAMPLE,
      }),
    );
  }

  const hookArchetypes = inferSocialHookArchetypes(text);
  if (hookArchetypes.length > 0) {
    candidates.push(
      socialCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.text.hookArchetypes`,
        signalPath: 'voice.hookArchetypes',
        rawValue: socialRawValue(args.source, firstMeaningfulSentence(text)),
        normalizedValue: hookArchetypes,
        excerpt: firstMeaningfulSentence(text),
        confidence: args.source.pinned ? BRAND_CONFIDENCE.SOCIAL.HOOK_ARCHETYPES_PINNED : BRAND_CONFIDENCE.SOCIAL.HOOK_ARCHETYPES_SAMPLE,
      }),
    );
  }

  const proofStyle = inferSocialProofStyle(text);
  if (proofStyle !== 'unknown') {
    candidates.push(
      socialCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.text.proofStyle`,
        signalPath: 'identity.proofStyle',
        rawValue: socialRawValue(args.source, text),
        normalizedValue: proofStyle,
        excerpt: firstMeaningfulSentence(text),
        confidence: args.source.pinned ? BRAND_CONFIDENCE.SOCIAL.PROOF_STYLE_PINNED : BRAND_CONFIDENCE.SOCIAL.PROOF_STYLE_SAMPLE,
      }),
    );
  }

  const ctas = extractSocialCtas(text);
  if (ctas.length > 0) {
    candidates.push(
      socialCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.text.ctaDirectness`,
        signalPath: 'voice.ctaDirectness',
        rawValue: socialRawValue(args.source, ctas),
        normalizedValue: scoreSocialCtaDirectness(ctas),
        excerpt: ctas.join(' | '),
        confidence: args.source.pinned ? BRAND_CONFIDENCE.SOCIAL.CTA_DIRECTNESS_PINNED : BRAND_CONFIDENCE.SOCIAL.CTA_DIRECTNESS_SAMPLE,
      }),
    );
  }

  return candidates;
}

function socialRawValue(source: BrandVaultSourceInput, value: unknown): unknown {
  if (!source.evidenceOrigin && !source.connection && !source.media && !source.metrics && !source.profile && !source.publishedAt) return value;
  return {
    value,
    publishedAt: source.publishedAt,
    media: source.media,
    metrics: source.metrics,
    profile: source.profile,
    evidenceOrigin: source.evidenceOrigin,
    connection: source.connection,
  };
}

export function parseBrandVaultSocialUrl(
  rawUrl: string,
  fallbackPlatform?: BrandVaultSourcePlatform,
): BrandVaultParsedSocialUrl | undefined {
  const normalizedUrl = normalizeHttpUrl(rawUrl);
  if (!normalizedUrl) return undefined;

  try {
    const url = new URL(normalizedUrl);
    const platform = inferSocialPlatformFromUrl(url, fallbackPlatform);
    const segments = url.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
    const parsed = parseSocialPath(url, platform, segments);
    return {
      originalUrl: rawUrl,
      normalizedUrl: url.href,
      platform,
      ...parsed,
    };
  } catch {
    return undefined;
  }
}

function socialCandidate(args: {
  brandId?: string;
  jobId: string;
  source: BrandVaultSourceInput;
  sourceField: string;
  signalPath: string;
  rawValue: unknown;
  normalizedValue: unknown;
  excerpt: string | undefined;
  confidence: number;
  index: number;
  observedAt: string;
}): BrandEvidenceCandidate {
  return {
    id: `candidate_social_${args.index + 1}_${idPart(`${args.sourceField}_${stringifyCandidateValue(args.normalizedValue)}`, 'social')}`,
    brandId: args.brandId,
    jobId: args.jobId,
    sourceType: args.source.kind,
    sourceUrl: args.source.url,
    sourceField: args.sourceField,
    signalPath: args.signalPath,
    rawValue: args.rawValue,
    normalizedValue: args.normalizedValue,
    excerpt: args.excerpt ? sanitizeEvidenceExcerpt(args.excerpt) : undefined,
    confidence: clamp01(args.confidence),
    authorityClass: 'owned',
    observedAt: args.observedAt,
    extractorId: BRAND_VAULT_SOCIAL_EVIDENCE_EXTRACTOR,
  };
}

function parseSocialPath(
  url: URL,
  platform: BrandVaultSourcePlatform,
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (platform === 'youtube') return parseYouTubePath(url, segments);
  if (platform === 'linkedin') return parseLinkedInPath(segments);
  if (platform === 'instagram') return parseInstagramPath(segments);
  if (platform === 'tiktok') return parseTikTokPath(segments);
  if (platform === 'x') return parseXPath(segments);
  if (platform === 'facebook') return parseFacebookPath(segments);
  return { accountType: 'unknown', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_UNKNOWN_WITHOUT_PLATFORM };
}

function parseYouTubePath(
  url: URL,
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (url.hostname.includes('youtu.be') && segments[0]) {
    return { contentId: segments[0], accountType: 'video', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_POST_STANDARD };
  }
  const videoId = url.searchParams.get('v');
  if (segments[0] === 'watch' && videoId) return { contentId: videoId, accountType: 'video', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_POST_STANDARD };
  if ((segments[0] === 'shorts' || segments[0] === 'embed') && segments[1]) {
    return { contentId: segments[1], accountType: 'video', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_YOUTUBE_SHORT };
  }
  if (segments[0]?.startsWith('@')) return { handle: segments[0], accountType: 'channel', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_STRONG };
  if (['channel', 'c', 'user'].includes(segments[0] ?? '') && segments[1]) {
    return { handle: segments[1], accountType: 'channel', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_STANDARD };
  }
  return { accountType: 'channel', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_WEAK };
}

function parseLinkedInPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (segments[0] === 'company' && segments[1]) return { handle: segments[1], accountType: 'company_page', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_STRONG };
  if (segments[0] === 'in' && segments[1]) return { handle: segments[1], accountType: 'creator_profile', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_LINKEDIN_CREATOR };
  if (segments[0] === 'posts' || segments[0] === 'feed' || segments[0] === 'pulse') {
    return { contentId: segments.slice(1).join('/'), accountType: 'post', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_LINKEDIN_POST };
  }
  return { accountType: 'unknown', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_UNKNOWN };
}

function parseInstagramPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (['p', 'reel', 'tv'].includes(segments[0] ?? '') && segments[1]) {
    return { contentId: segments[1], accountType: 'post', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_POST_STANDARD };
  }
  if (segments[0]) return { handle: segments[0], accountType: 'profile', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_STANDARD };
  return { accountType: 'profile', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_FALLBACK };
}

function parseTikTokPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (segments[0]?.startsWith('@') && segments[1] === 'video' && segments[2]) {
    return { handle: segments[0], contentId: segments[2], accountType: 'post', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_POST_STRONG };
  }
  if (segments[0]?.startsWith('@')) return { handle: segments[0], accountType: 'profile', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_HIGH };
  return { accountType: 'unknown', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_UNKNOWN };
}

function parseXPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  const handle = segments[0];
  if (handle && ['status', 'statuses'].includes(segments[1] ?? '') && segments[2]) {
    return { handle, contentId: segments[2], accountType: 'post', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_POST_STRONG };
  }
  if (handle && !['home', 'explore', 'i', 'intent'].includes(handle)) {
    return { handle, accountType: 'profile', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_STANDARD };
  }
  return { accountType: 'unknown', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_UNKNOWN_WEAK };
}

function parseFacebookPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (['posts', 'watch', 'reel', 'share'].includes(segments[0] ?? '') && segments[1]) {
    return { contentId: segments[1], accountType: 'post', isPostUrl: true, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_FACEBOOK };
  }
  if (segments[0]) return { handle: segments[0], accountType: 'page', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_FACEBOOK };
  return { accountType: 'page', isPostUrl: false, confidence: BRAND_CONFIDENCE.SOCIAL.PARSED_PROFILE_UNKNOWN };
}

function inferSocialPlatformFromUrl(url: URL, fallbackPlatform?: BrandVaultSourcePlatform): BrandVaultSourcePlatform {
  const host = url.hostname.toLowerCase();
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('tiktok.com')) return 'tiktok';
  if (host.includes('x.com') || host.includes('twitter.com')) return 'x';
  if (host.includes('facebook.com') || host.includes('fb.com')) return 'facebook';
  return normalizeSocialPlatform(fallbackPlatform);
}

function normalizeSocialPlatform(platform: BrandVaultSourcePlatform | undefined): BrandVaultSourcePlatform {
  return platform && platform !== 'website' ? platform : 'other';
}

function socialCapability(
  source: BrandVaultSourceInput,
  parsed: BrandVaultParsedSocialUrl | undefined,
): BrandVaultSocialCapability {
  const connection = source.connection;
  if (connection?.status === 'public_fallback_available') {
    return {
      evidenceAccess: parsed?.isPostUrl || source.kind === 'social_post' ? 'post_url_only' : 'profile_url_only',
      liveFetchStatus: 'public_fallback_available',
      connectedAccountStatus: 'not_connected',
      publicFallbackStatus: 'review_only',
      pinnedContentStatus: source.pinned ? 'manual_selected_pinned' : 'not_assumed',
    };
  }

  if (connection) {
    const connectedPostSample = source.evidenceOrigin === 'connected_fetch' && Boolean(source.text) && connection.canReadPosts;
    const connectedAccountStatus =
      connection.status === 'connected' && connection.canReadPosts
        ? 'connected'
        : connection.status === 'connected' && !connection.canReadPosts
          ? 'scope_missing'
          : connection.status === 'scope_missing'
            ? 'scope_missing'
            : connection.status === 'connected_different_account'
              ? 'connected_different_account'
              : 'not_connected';
    return {
      evidenceAccess: connectedPostSample
        ? 'connected_post_sample'
        : source.text
        ? 'manual_post_text'
        : connection.canReadPosts
          ? 'connected_post_read_possible'
          : 'connected_profile_metadata',
      liveFetchStatus: connection.canReadPosts ? 'available_with_connected_account' : 'metadata_only',
      connectedAccountStatus,
      publicFallbackStatus: 'review_only',
      pinnedContentStatus: source.pinned
        ? source.evidenceOrigin === 'connected_fetch'
          ? 'connected_pinned_read'
          : 'manual_selected_pinned'
        : connection.canReadPinned
          ? 'platform_pinned_supported'
          : 'not_assumed',
    };
  }

  return {
    evidenceAccess: source.text ? 'manual_post_text' : parsed?.isPostUrl || source.kind === 'social_post' ? 'post_url_only' : 'profile_url_only',
    liveFetchStatus: 'adapter_required',
    connectedAccountStatus: 'scope_audit_required',
    publicFallbackStatus: 'review_only',
    pinnedContentStatus: source.pinned ? 'manual_selected_pinned' : 'not_assumed',
  };
}

function socialIdentityExcerpt(source: BrandVaultSourceInput, parsed: BrandVaultParsedSocialUrl | undefined): string {
  const label = source.name ?? parsed?.handle ?? source.url ?? source.platform ?? source.kind;
  const platform = parsed?.platform ?? source.platform ?? 'social';
  const pinned = source.pinned ? ' Pinned/featured by user.' : '';
  const connection = source.connection ? ` Connection: ${source.connection.status}.` : '';
  const origin = source.evidenceOrigin ? ` Origin: ${source.evidenceOrigin}.` : '';
  const media = source.media?.mediaType ? ` Media: ${source.media.mediaType}.` : '';
  const metrics = source.metrics?.engagementCount ? ` Engagement: ${source.metrics.engagementCount}.` : '';
  return `${label} parsed as ${platform} ${parsed?.accountType ?? 'social source'}.${pinned}${media}${metrics}${connection}${origin}`;
}

function confidenceForSocialIdentity(source: BrandVaultSourceInput, parsed: BrandVaultParsedSocialUrl | undefined): number {
  const parsedConfidence = parsed?.confidence ?? (source.platform ? BRAND_CONFIDENCE.SOCIAL.PARSED_PLATFORM_FALLBACK : BRAND_CONFIDENCE.SOCIAL.PARSED_UNKNOWN_WITHOUT_PLATFORM);
  if (!source.connection) return parsedConfidence;
  if (source.evidenceOrigin === 'connected_fetch' && source.connection.status === 'connected' && source.connection.matchStatus === 'matched') return Math.max(parsedConfidence, BRAND_CONFIDENCE.SOCIAL.CONNECTION_FETCH_MATCHED_MIN);
  if (source.evidenceOrigin === 'connected_fetch' && source.connection.status === 'connected') return Math.max(parsedConfidence, BRAND_CONFIDENCE.SOCIAL.CONNECTION_FETCH_UNVERIFIED_MIN);
  if (source.connection.status === 'connected' && source.connection.matchStatus === 'matched') return Math.max(parsedConfidence, BRAND_CONFIDENCE.SOCIAL.CONNECTION_MATCHED_MIN);
  if (source.connection.status === 'connected' && source.connection.matchStatus === 'unverified') return Math.max(parsedConfidence, BRAND_CONFIDENCE.SOCIAL.CONNECTION_UNVERIFIED_MIN);
  if (source.connection.status === 'scope_missing') return Math.max(parsedConfidence, BRAND_CONFIDENCE.SOCIAL.CONNECTION_SCOPE_MISSING_MIN);
  if (source.connection.status === 'connected_different_account') return Math.min(parsedConfidence, BRAND_CONFIDENCE.SOCIAL.CONNECTION_MISMATCHED_MAX);
  if (source.connection.status === 'public_fallback_available') return Math.max(parsedConfidence, BRAND_CONFIDENCE.SOCIAL.CONNECTION_PUBLIC_FALLBACK_MIN);
  return parsedConfidence;
}

function normalizeHttpUrl(rawUrl: string): string | undefined {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('@')) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return undefined;
}

function normalizeSocialText(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function extractSocialVoicePhrases(text: string): string[] {
  const hashtags = [...text.matchAll(/#[a-z0-9_]+/gi)].map((match) => match[0]);
  const sentences = meaningfulSentences(text)
    .filter((sentence) => !/^https?:\/\//i.test(sentence))
    .filter((sentence) => sentence.length >= 14 && sentence.length <= 140)
    .slice(0, 5);
  return uniqueStrings([...sentences, ...hashtags]).slice(0, 8);
}

function inferSocialHookArchetypes(text: string): string[] {
  const opener = firstMeaningfulSentence(text).toLowerCase();
  const archetypes: string[] = [];
  if (!opener) return archetypes;
  if (opener.includes('?')) archetypes.push('question-led');
  if (/^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(opener)) archetypes.push('list-led');
  if (/\b(?:introducing|launching|announcing|new|we built|we made)\b/i.test(opener)) archetypes.push('launch-led');
  if (/\b(?:trusted by|customers|clients|results|grew|saved|increased|reduced|[0-9]+%)\b/i.test(opener)) archetypes.push('proof-led');
  if (/\b(?:how to|how we|guide|playbook|framework)\b/i.test(opener)) archetypes.push('how-to');
  if (/\b(?:book|join|get|try|start|watch|download|comment|dm)\b/i.test(opener)) archetypes.push('direct-offer');
  return uniqueStrings(archetypes.length > 0 ? archetypes : ['statement-led']).slice(0, 4);
}

function inferSocialProofStyle(text: string): 'testimonial' | 'metrics' | 'authority' | 'community' | 'demo' | 'editorial' | 'unknown' {
  if (/\b(?:\d+%|\d+x|\d+\+|revenue|saved|increased|reduced|grew|roi)\b/i.test(text)) return 'metrics';
  if (/\b(?:trusted by|customers|clients|community|members|teams|creators)\b/i.test(text)) return 'community';
  if (/\b(?:said|says|testimonial|review|case study)\b/i.test(text)) return 'testimonial';
  if (/\b(?:award|certified|partner|recognized|featured in)\b/i.test(text)) return 'authority';
  if (/\b(?:demo|walkthrough|watch|behind the scenes|before and after)\b/i.test(text)) return 'demo';
  if (/\b(?:why|lesson|insight|point of view|takeaway)\b/i.test(text)) return 'editorial';
  return 'unknown';
}

function extractSocialCtas(text: string): string[] {
  return meaningfulSentences(text)
    .filter((sentence) => /\b(?:book|buy|join|get|try|start|watch|download|comment|reply|dm|send us|learn more|link in bio|subscribe)\b/i.test(sentence))
    .slice(0, 5);
}

function scoreSocialCtaDirectness(ctas: string[]): number {
  if (ctas.length === 0) return 0.5;
  const directCount = ctas.filter((cta) => /\b(?:book|buy|join|get|try|start|download|subscribe)\b/i.test(cta)).length;
  return clamp01(0.45 + directCount * 0.12 + Math.min(ctas.length, 3) * 0.05);
}

function meaningfulSentences(text: string): string[] {
  return uniqueStrings(
    text
      .split(/(?:\r?\n|[.!?]\s+)/)
      .map((sentence) => sanitizeEvidenceExcerpt(sentence, 180))
      .filter((sentence) => sentence.length > 0),
  );
}

function firstMeaningfulSentence(text: string): string {
  return meaningfulSentences(text)[0] ?? '';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringifyCandidateValue(value: unknown): string {
  if (Array.isArray(value)) return value.join('_');
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).join('_');
  return String(value);
}

function idPart(value: string, fallback: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return clean || fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
