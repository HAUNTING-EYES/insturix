import {
  parseBrandVaultSocialUrl,
  type BrandVaultParsedSocialUrl,
} from './brand-vault-social-evidence';
import type {
  BrandVaultSocialConnectionEvidence,
  BrandVaultSourceInput,
  BrandVaultSourcePlatform,
} from './brand-website-refinery-types';

export interface BrandVaultUploaderXTokenSnapshot {
  twitterTokens?: Record<string, unknown> | null;
  linkedinTokens?: Record<string, unknown> | null;
  instagramTokens?: Record<string, unknown> | null;
  facebookTokens?: Record<string, unknown> | null;
}

export type BrandVaultSocialFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface BrandVaultConnectedSocialEvidenceArgs {
  socialLinks: string[];
  uploaderXUser: BrandVaultUploaderXTokenSnapshot | null;
  youtubeConnection: BrandVaultSocialConnectionEvidence | null;
  apifyApiKey?: string;
  fetchFn?: BrandVaultSocialFetch;
  now?: string;
}

export interface BrandVaultConnectedSocialEvidenceResult {
  sourceEvidence: BrandVaultSourceInput[];
  warnings: string[];
}

type SocialFetchResult = {
  sources: BrandVaultSourceInput[];
  warnings: string[];
};

export async function createBrandVaultConnectedSocialEvidence(
  args: BrandVaultConnectedSocialEvidenceArgs,
): Promise<BrandVaultConnectedSocialEvidenceResult> {
  if (args.socialLinks.length === 0) return { sourceEvidence: [], warnings: [] };

  const warnings: string[] = [];
  const sources: BrandVaultSourceInput[] = [];

  for (const link of args.socialLinks) {
    const parsed = parseBrandVaultSocialUrl(link);
    if (!parsed) continue;

    const connection = connectedEvidenceForPlatform(
      parsed.platform,
      parsed.handle,
      args.uploaderXUser,
      args.youtubeConnection,
    );
    const evidence = connection ?? publicFallbackEvidenceForPlatform(parsed.platform, args.apifyApiKey);
    if (!evidence) continue;

    sources.push(profileSourceForSocialLink(parsed, evidence));

    const fetched = await fetchConnectedPostSources({
      parsed,
      connection,
      uploaderXUser: args.uploaderXUser,
      fetchFn: args.fetchFn ?? fetch,
      now: args.now,
    });
    sources.push(...fetched.sources);
    warnings.push(...fetched.warnings);
  }

  const connectedSourceCount = sources.filter((source) =>
    source.evidenceOrigin === 'connected_metadata' || source.evidenceOrigin === 'connected_fetch',
  ).length;
  const publicFallbackSourceCount = sources.filter((source) => source.evidenceOrigin === 'public_fallback').length;
  if (connectedSourceCount > 0) {
    warnings.push(
      `Brand Vault added ${connectedSourceCount} connected social evidence source${connectedSourceCount === 1 ? '' : 's'} from existing platform integrations.`,
    );
  }
  if (publicFallbackSourceCount > 0) {
    warnings.push(
      `Brand Vault staged ${publicFallbackSourceCount} public social fallback source${publicFallbackSourceCount === 1 ? '' : 's'} for review-only enrichment.`,
    );
  }

  return { sourceEvidence: sources.slice(0, 20), warnings };
}

function profileSourceForSocialLink(
  parsed: BrandVaultParsedSocialUrl,
  connection: BrandVaultSocialConnectionEvidence,
): BrandVaultSourceInput {
  return {
    kind: 'social_profile',
    url: parsed.normalizedUrl,
    platform: parsed.platform,
    name: connection.accountName ?? connection.accountHandle ?? parsed.handle ?? parsed.platform,
    note: connectionNote(parsed.platform, connection),
    evidenceOrigin: connection.provider === 'alyzitron_apify' ? 'public_fallback' : 'connected_metadata',
    connection,
  };
}

async function fetchConnectedPostSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  connection: BrandVaultSocialConnectionEvidence | null;
  uploaderXUser: BrandVaultUploaderXTokenSnapshot | null;
  fetchFn: BrandVaultSocialFetch;
  now?: string;
}): Promise<SocialFetchResult> {
  if (args.parsed.platform !== 'x') return { sources: [], warnings: [] };
  return fetchConnectedXPostSources({
    parsed: args.parsed,
    connection: args.connection,
    tokens: args.uploaderXUser?.twitterTokens,
    fetchFn: args.fetchFn,
    now: args.now,
  });
}

async function fetchConnectedXPostSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  connection: BrandVaultSocialConnectionEvidence | null;
  tokens: Record<string, unknown> | null | undefined;
  fetchFn: BrandVaultSocialFetch;
  now?: string;
}): Promise<SocialFetchResult> {
  if (!args.connection?.canReadPosts || args.connection.status !== 'connected') return { sources: [], warnings: [] };
  if (args.connection.matchStatus === 'mismatched') return { sources: [], warnings: [] };
  const connection = args.connection;

  const accessToken = stringValue(args.tokens?.accessToken);
  if (!accessToken) return { sources: [], warnings: ['Brand Vault skipped X post samples: UploaderX access token was not available.'] };
  if (isExpired(args.tokens?.expiresAt, args.now)) {
    return { sources: [], warnings: ['Brand Vault skipped X post samples: UploaderX X token is expired and must be refreshed before read enrichment.'] };
  }

  const userId = stringValue(args.tokens?.userId) ?? await fetchXUserId(accessToken, args.fetchFn);
  if (!userId) return { sources: [], warnings: ['Brand Vault skipped X post samples: connected X user id could not be resolved.'] };

  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets`);
  url.searchParams.set('max_results', '5');
  url.searchParams.set('exclude', 'retweets,replies');
  url.searchParams.set('tweet.fields', 'created_at,public_metrics,lang');

  const response = await args.fetchFn(url.href, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJsonObject(response);
  if (!response.ok) {
    return {
      sources: [],
      warnings: [`Brand Vault skipped X post samples: X API returned ${response.status}${apiErrorMessage(payload)}.`],
    };
  }

  const posts = Array.isArray(payload.data) ? payload.data : [];
  const sources = posts
    .map((post) => xPostSource(post, connection, args.parsed))
    .filter((source): source is BrandVaultSourceInput => Boolean(source))
    .slice(0, 5);

  if (sources.length === 0) {
    return { sources: [], warnings: ['Brand Vault found X post read access, but no recent authored posts were returned.'] };
  }

  return {
    sources,
    warnings: [`Brand Vault fetched ${sources.length} recent X post${sources.length === 1 ? '' : 's'} for draft social evidence review.`],
  };
}

async function fetchXUserId(accessToken: string, fetchFn: BrandVaultSocialFetch): Promise<string | undefined> {
  const response = await fetchFn('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJsonObject(response);
  if (!response.ok) return undefined;
  return stringValue(asRecord(payload.data)?.id);
}

function xPostSource(
  post: unknown,
  connection: BrandVaultSocialConnectionEvidence,
  parsed: BrandVaultParsedSocialUrl,
): BrandVaultSourceInput | null {
  const record = asRecord(post);
  const id = stringValue(record.id);
  const text = stringValue(record.text);
  if (!id || !text) return null;

  const handle = normalizeHandle(connection.accountHandle ?? connection.accountName ?? parsed.handle);
  const metrics = metricsNote(record.public_metrics);
  return {
    kind: 'social_post',
    url: handle ? `https://x.com/${handle}/status/${id}` : parsed.normalizedUrl,
    platform: 'x',
    name: `X post ${id}`,
    note: ['Fetched from connected UploaderX X account via tweet.read for Brand Vault draft review.', metrics].filter(Boolean).join(' '),
    text,
    evidenceOrigin: 'connected_fetch',
    pinned: false,
    connection,
  };
}

function connectedEvidenceForPlatform(
  platform: BrandVaultSourcePlatform,
  handle: string | undefined,
  user: BrandVaultUploaderXTokenSnapshot | null,
  youtubeConnection: BrandVaultSocialConnectionEvidence | null,
): BrandVaultSocialConnectionEvidence | null {
  if (platform === 'youtube') return youtubeConnection;
  if (!user) return null;
  if (platform === 'x') return twitterConnection(handle, user.twitterTokens);
  if (platform === 'linkedin') return linkedinConnection(handle, user.linkedinTokens);
  if (platform === 'instagram') return instagramConnection(handle, user.instagramTokens);
  if (platform === 'facebook') return facebookConnection(handle, user.facebookTokens);
  return null;
}

function twitterConnection(handle: string | undefined, tokens: Record<string, unknown> | null | undefined): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.accessToken) return null;
  const matchStatus = handleMatch(handle, [tokens.userName]);
  const scopes = stringList(tokens.scopes);
  const missingScopes = stringList(tokens.missingScopes);
  const canReadProfile = scopes.includes('users.read') || Boolean(tokens.userName);
  const canReadPosts = scopes.includes('tweet.read') && matchStatus !== 'mismatched';
  return {
    provider: 'uploaderx',
    status: matchStatus === 'mismatched' ? 'connected_different_account' : canReadPosts ? 'connected' : 'scope_missing',
    accountId: stringValue(tokens.userId),
    accountName: stringValue(tokens.userName),
    accountHandle: stringValue(tokens.userName),
    scopes,
    missingScopes,
    canReadProfile,
    canReadPosts,
    canReadPinned: canReadPosts,
    matchStatus,
  };
}

function linkedinConnection(handle: string | undefined, tokens: Record<string, unknown> | null | undefined): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.accessToken) return null;
  const organizations = Array.isArray(tokens.organizations) ? tokens.organizations : [];
  const organizationHandles = organizations.flatMap((org) => {
    const record = asRecord(org);
    return [record.vanityName, record.name, record.id];
  });
  const matchStatus = handleMatch(handle, organizationHandles);
  const scopes = stringList(tokens.scopes);
  const missingScopes = stringList(tokens.missingScopes);
  return {
    provider: 'uploaderx',
    status: matchStatus === 'mismatched' ? 'connected_different_account' : missingScopes.length > 0 ? 'scope_missing' : 'connected',
    accountId: stringValue(tokens.userId),
    accountName: stringValue(tokens.userName),
    accountHandle: stringValue(tokens.userName),
    scopes,
    missingScopes,
    canReadProfile: Boolean(tokens.userId),
    canReadPosts: false,
    canReadPinned: false,
    matchStatus,
  };
}

function instagramConnection(handle: string | undefined, tokens: Record<string, unknown> | null | undefined): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.userAccessToken) return null;
  const accounts = Array.isArray(tokens.accounts) ? tokens.accounts : [];
  const accountHandles = [tokens.userName, ...accounts.map((account) => asRecord(account).instagramUsername)];
  const matchStatus = handleMatch(handle, accountHandles);
  return {
    provider: 'uploaderx',
    status: matchStatus === 'mismatched' ? 'connected_different_account' : 'connected',
    accountId: stringValue(tokens.userId),
    accountName: stringValue(tokens.userName),
    accountHandle: stringValue(tokens.userName),
    canReadProfile: true,
    canReadPosts: false,
    canReadPinned: false,
    matchStatus,
  };
}

function facebookConnection(handle: string | undefined, tokens: Record<string, unknown> | null | undefined): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.userAccessToken) return null;
  const pages = Array.isArray(tokens.pages) ? tokens.pages : [];
  const pageHandles = pages.flatMap((page) => {
    const record = asRecord(page);
    return [record.pageName, record.pageId];
  });
  const matchStatus = handleMatch(handle, pageHandles);
  return {
    provider: 'uploaderx',
    status: matchStatus === 'mismatched' ? 'connected_different_account' : 'connected',
    accountId: stringValue(tokens.userId),
    accountName: stringValue(tokens.userName),
    accountHandle: stringValue(tokens.userName),
    canReadProfile: true,
    canReadPosts: false,
    canReadPinned: false,
    matchStatus,
  };
}

function publicFallbackEvidenceForPlatform(
  platform: BrandVaultSourcePlatform,
  apifyApiKey: string | undefined,
): BrandVaultSocialConnectionEvidence | null {
  if (!apifyApiKey?.trim()) return null;
  if (platform !== 'youtube' && platform !== 'instagram') return null;
  return {
    provider: 'alyzitron_apify',
    status: 'public_fallback_available',
    canReadProfile: false,
    canReadPosts: false,
    canReadPinned: false,
    matchStatus: 'unverified',
  };
}

function connectionNote(platform: BrandVaultSourcePlatform, connection: BrandVaultSocialConnectionEvidence): string {
  if (connection.provider === 'alyzitron_apify') {
    return `Alyzitron Apify fallback is configured for ${platform} public media extraction; Brand Vault treats it as review-only evidence.`;
  }
  if (connection.status === 'connected_different_account') {
    return `UploaderX has a connected ${platform} account, but it does not match this social link handle.`;
  }
  if (connection.status === 'scope_missing') {
    return `UploaderX has a connected ${platform} account, but Brand Vault needs stronger read scopes before live post enrichment.`;
  }
  return `Existing ${connection.provider === 'clerk_external_account' ? 'Clerk' : 'UploaderX'} ${platform} connection found for Brand Vault evidence review.`;
}

function handleMatch(handle: string | undefined, candidates: unknown[]): BrandVaultSocialConnectionEvidence['matchStatus'] {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedCandidates = candidates.map(normalizeHandle).filter(Boolean);
  if (!normalizedHandle || normalizedCandidates.length === 0) return 'unverified';
  return normalizedCandidates.includes(normalizedHandle) ? 'matched' : 'mismatched';
}

function normalizeHandle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9._-]+/g, '').trim();
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isExpired(value: unknown, now: string | undefined): boolean {
  if (!value) return false;
  const expiresAt = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(expiresAt)) return false;
  const reference = now ? Date.parse(now) : Date.now();
  return expiresAt <= reference;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json();
    return asRecord(value);
  } catch {
    return {};
  }
}

function apiErrorMessage(payload: Record<string, unknown>): string {
  const detail = stringValue(payload.detail) ?? stringValue(asRecord(payload.error).message);
  return detail ? `: ${detail}` : '';
}

function metricsNote(value: unknown): string | undefined {
  const metrics = asRecord(value);
  const parts = [
    metricPart('likes', metrics.like_count),
    metricPart('replies', metrics.reply_count),
    metricPart('reposts', metrics.retweet_count),
    metricPart('quotes', metrics.quote_count),
  ].filter(Boolean);
  return parts.length > 0 ? `Observed metrics: ${parts.join(', ')}.` : undefined;
}

function metricPart(label: string, value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} ${label}` : undefined;
}
