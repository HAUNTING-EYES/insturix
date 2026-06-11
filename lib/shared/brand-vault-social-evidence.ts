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
  evidenceAccess: 'profile_url_only' | 'post_url_only' | 'manual_post_text';
  liveFetchStatus: 'adapter_required';
  connectedAccountStatus: 'scope_audit_required';
  publicFallbackStatus: 'review_only';
  pinnedContentStatus: 'manual_selected_pinned' | 'not_assumed';
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
      },
      excerpt: socialIdentityExcerpt(args.source, parsed),
      confidence: parsed?.confidence ?? (args.source.platform ? 0.36 : 0.24),
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
        rawValue: text,
        normalizedValue: voicePhrases,
        excerpt: voicePhrases.join(' | '),
        confidence: args.source.pinned ? 0.74 : 0.62,
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
        rawValue: firstMeaningfulSentence(text),
        normalizedValue: hookArchetypes,
        excerpt: firstMeaningfulSentence(text),
        confidence: args.source.pinned ? 0.68 : 0.56,
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
        rawValue: text,
        normalizedValue: proofStyle,
        excerpt: firstMeaningfulSentence(text),
        confidence: args.source.pinned ? 0.66 : 0.52,
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
        rawValue: ctas,
        normalizedValue: scoreSocialCtaDirectness(ctas),
        excerpt: ctas.join(' | '),
        confidence: args.source.pinned ? 0.64 : 0.5,
      }),
    );
  }

  return candidates;
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
  return { accountType: 'unknown', isPostUrl: false, confidence: 0.24 };
}

function parseYouTubePath(
  url: URL,
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (url.hostname.includes('youtu.be') && segments[0]) {
    return { contentId: segments[0], accountType: 'video', isPostUrl: true, confidence: 0.74 };
  }
  const videoId = url.searchParams.get('v');
  if (segments[0] === 'watch' && videoId) return { contentId: videoId, accountType: 'video', isPostUrl: true, confidence: 0.74 };
  if ((segments[0] === 'shorts' || segments[0] === 'embed') && segments[1]) {
    return { contentId: segments[1], accountType: 'video', isPostUrl: true, confidence: 0.72 };
  }
  if (segments[0]?.startsWith('@')) return { handle: segments[0], accountType: 'channel', isPostUrl: false, confidence: 0.78 };
  if (['channel', 'c', 'user'].includes(segments[0] ?? '') && segments[1]) {
    return { handle: segments[1], accountType: 'channel', isPostUrl: false, confidence: 0.7 };
  }
  return { accountType: 'channel', isPostUrl: false, confidence: 0.4 };
}

function parseLinkedInPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (segments[0] === 'company' && segments[1]) return { handle: segments[1], accountType: 'company_page', isPostUrl: false, confidence: 0.78 };
  if (segments[0] === 'in' && segments[1]) return { handle: segments[1], accountType: 'creator_profile', isPostUrl: false, confidence: 0.68 };
  if (segments[0] === 'posts' || segments[0] === 'feed' || segments[0] === 'pulse') {
    return { contentId: segments.slice(1).join('/'), accountType: 'post', isPostUrl: true, confidence: 0.66 };
  }
  return { accountType: 'unknown', isPostUrl: false, confidence: 0.28 };
}

function parseInstagramPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (['p', 'reel', 'tv'].includes(segments[0] ?? '') && segments[1]) {
    return { contentId: segments[1], accountType: 'post', isPostUrl: true, confidence: 0.74 };
  }
  if (segments[0]) return { handle: segments[0], accountType: 'profile', isPostUrl: false, confidence: 0.7 };
  return { accountType: 'profile', isPostUrl: false, confidence: 0.3 };
}

function parseTikTokPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (segments[0]?.startsWith('@') && segments[1] === 'video' && segments[2]) {
    return { handle: segments[0], contentId: segments[2], accountType: 'post', isPostUrl: true, confidence: 0.76 };
  }
  if (segments[0]?.startsWith('@')) return { handle: segments[0], accountType: 'profile', isPostUrl: false, confidence: 0.72 };
  return { accountType: 'unknown', isPostUrl: false, confidence: 0.28 };
}

function parseXPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  const handle = segments[0];
  if (handle && ['status', 'statuses'].includes(segments[1] ?? '') && segments[2]) {
    return { handle, contentId: segments[2], accountType: 'post', isPostUrl: true, confidence: 0.76 };
  }
  if (handle && !['home', 'explore', 'i', 'intent'].includes(handle)) {
    return { handle, accountType: 'profile', isPostUrl: false, confidence: 0.7 };
  }
  return { accountType: 'unknown', isPostUrl: false, confidence: 0.26 };
}

function parseFacebookPath(
  segments: string[],
): Omit<BrandVaultParsedSocialUrl, 'originalUrl' | 'normalizedUrl' | 'platform'> {
  if (['posts', 'watch', 'reel', 'share'].includes(segments[0] ?? '') && segments[1]) {
    return { contentId: segments[1], accountType: 'post', isPostUrl: true, confidence: 0.58 };
  }
  if (segments[0]) return { handle: segments[0], accountType: 'page', isPostUrl: false, confidence: 0.58 };
  return { accountType: 'page', isPostUrl: false, confidence: 0.28 };
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
  return `${label} parsed as ${platform} ${parsed?.accountType ?? 'social source'}.${pinned}`;
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
