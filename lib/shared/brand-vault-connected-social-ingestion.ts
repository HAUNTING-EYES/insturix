import {
  parseBrandVaultSocialUrl,
  type BrandVaultParsedSocialUrl,
} from './brand-vault-social-evidence';
import {
  createBrandVaultGeminiSocialOcrProvider,
  type BrandVaultSocialOcrProvider,
} from './brand-vault-social-ocr';
import type {
  BrandVaultSocialConnectionEvidence,
  BrandVaultSocialMediaEvidence,
  BrandVaultSocialMetricsEvidence,
  BrandVaultSocialProfileEvidence,
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

export const BRAND_VAULT_DEFAULT_APIFY_ACTORS = {
  linkedin: 'atomus/linkedin-posts-scraper-pro',
} as const satisfies Partial<Record<'instagram' | 'facebook' | 'linkedin', string>>;

export interface BrandVaultConnectedSocialEvidenceArgs {
  socialLinks: string[];
  uploaderXUser: BrandVaultUploaderXTokenSnapshot | null;
  youtubeConnection: BrandVaultSocialConnectionEvidence | null;
  apifyApiKey?: string;
  apifyActors?: Partial<Record<'instagram' | 'facebook' | 'linkedin', string>>;
  fetchFn?: BrandVaultSocialFetch;
  now?: string;
  ocrProvider?: BrandVaultSocialOcrProvider | null;
}

export interface BrandVaultConnectedSocialEvidenceResult {
  sourceEvidence: BrandVaultSourceInput[];
  warnings: string[];
}

type SocialFetchResult = {
  sources: BrandVaultSourceInput[];
  warnings: string[];
};

type ApifySocialSourceResult = {
  source: BrandVaultSourceInput | null;
  rejectionReason?: 'identity_mismatch' | 'hollow_item';
};

type ApifySupportedPlatform = 'instagram' | 'facebook' | 'linkedin';

type XUserIdentity = {
  userId?: string;
  pinnedTweetId?: string;
};

interface YouTubePublicEvidence {
  title?: string;
  author?: string;
  description?: string;
  publishedAt?: string;
  category?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  viewCount?: number;
  transcript?: string;
}

export async function createBrandVaultConnectedSocialEvidence(
  args: BrandVaultConnectedSocialEvidenceArgs,
): Promise<BrandVaultConnectedSocialEvidenceResult> {
  if (args.socialLinks.length === 0) return { sourceEvidence: [], warnings: [] };

  const warnings: string[] = [];
  const sources: BrandVaultSourceInput[] = [];
  const fetchFn = args.fetchFn ?? fetch;
  const ocrProvider = args.ocrProvider === undefined
    ? createBrandVaultGeminiSocialOcrProvider({ fetchFn })
    : args.ocrProvider;

  for (const link of args.socialLinks) {
    const parsed = parseBrandVaultSocialUrl(link);
    if (!parsed) continue;

    const connection = connectedEvidenceForPlatform(
      parsed.platform,
      parsed.handle,
      args.uploaderXUser,
      args.youtubeConnection,
    );
    const evidence = connection ?? publicFallbackEvidenceForPlatform(parsed.platform, args.apifyApiKey, args.apifyActors);
    if (evidence) sources.push(profileSourceForSocialLink(parsed, evidence));

    const fetched = await fetchConnectedPostSources({
      parsed,
      connection,
      uploaderXUser: args.uploaderXUser,
      fetchFn,
      now: args.now,
    });
    sources.push(...fetched.sources);
    warnings.push(...fetched.warnings);

    if (fetched.sources.length === 0 && shouldFetchPublicFallback(connection, parsed)) {
      const fallback = await fetchPublicSocialSources({
        parsed,
        apifyApiKey: args.apifyApiKey,
        apifyActors: args.apifyActors,
        fetchFn,
      });
      sources.push(...fallback.sources);
      warnings.push(...fallback.warnings);
    }
  }

  await enrichSocialSourcesWithOcr(sources, ocrProvider, warnings);

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

async function enrichSocialSourcesWithOcr(
  sources: BrandVaultSourceInput[],
  ocrProvider: BrandVaultSocialOcrProvider | null,
  warnings: string[],
): Promise<void> {
  if (!ocrProvider) return;

  let attempted = 0;
  let extracted = 0;
  for (const source of sources) {
    if (attempted >= 3) break;
    const media = source.media;
    if (!media || media.ocrText) continue;
    const imageUrl = socialOcrImageUrl(media);
    if (!imageUrl) continue;

    attempted += 1;
    const result = await ocrProvider.readTextFromImage({
      imageUrl,
      sourceUrl: source.url,
      platform: source.platform,
      mediaType: media.mediaType,
    });
    if (result.text) {
      source.media = { ...media, ocrText: result.text };
      extracted += 1;
    }
    if (result.warning) warnings.push(result.warning);
  }

  if (extracted > 0) {
    warnings.push(`Brand Vault OCR extracted readable text from ${extracted} social media image${extracted === 1 ? '' : 's'} for draft evidence review.`);
  }
}

function socialOcrImageUrl(media: BrandVaultSocialMediaEvidence): string | undefined {
  return firstHttpUrl(media.thumbnailUrl, media.mediaUrl);
}

function firstHttpUrl(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && /^https?:\/\//i.test(value));
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
  if (args.parsed.platform === 'x') {
    return fetchConnectedXPostSources({
      parsed: args.parsed,
      connection: args.connection,
      tokens: args.uploaderXUser?.twitterTokens,
      fetchFn: args.fetchFn,
      now: args.now,
    });
  }
  if (args.parsed.platform === 'instagram') {
    return fetchConnectedInstagramPostSources({
      parsed: args.parsed,
      connection: args.connection,
      tokens: args.uploaderXUser?.instagramTokens,
      fetchFn: args.fetchFn,
      now: args.now,
    });
  }
  if (args.parsed.platform === 'linkedin') {
    return fetchConnectedLinkedInPostSources({
      parsed: args.parsed,
      connection: args.connection,
      tokens: args.uploaderXUser?.linkedinTokens,
      fetchFn: args.fetchFn,
      now: args.now,
    });
  }
  if (args.parsed.platform === 'facebook') {
    return fetchConnectedFacebookPostSources({
      parsed: args.parsed,
      connection: args.connection,
      tokens: args.uploaderXUser?.facebookTokens,
      fetchFn: args.fetchFn,
      now: args.now,
    });
  }
  return { sources: [], warnings: [] };
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

  const identity = await resolveXUserIdentity({
    accessToken,
    tokens: args.tokens,
    fetchFn: args.fetchFn,
    shouldReadPinned: Boolean(connection.canReadPinned),
  });
  if (!identity.userId) return { sources: [], warnings: ['Brand Vault skipped X post samples: connected X user id could not be resolved.'] };

  const sources: BrandVaultSourceInput[] = [];
  const warnings: string[] = [];

  if (identity.pinnedTweetId && connection.canReadPinned) {
    const pinned = await fetchConnectedXPostById({
      accessToken,
      postId: identity.pinnedTweetId,
      connection,
      parsed: args.parsed,
      fetchFn: args.fetchFn,
    });
    sources.push(...pinned.sources);
    warnings.push(...pinned.warnings);
  }

  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(identity.userId)}/tweets`);
  url.searchParams.set('max_results', '5');
  url.searchParams.set('exclude', 'retweets,replies');
  url.searchParams.set('tweet.fields', 'created_at,public_metrics,lang');

  const response = await args.fetchFn(url.href, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJsonObject(response);
  if (!response.ok) {
    return {
      sources,
      warnings: [...warnings, `Brand Vault skipped X post samples: X API returned ${response.status}${apiErrorMessage(payload)}.`],
    };
  }

  const posts = Array.isArray(payload.data) ? payload.data : [];
  const recentSources = posts
    .map((post) => xPostSource(post, connection, args.parsed, false))
    .filter((source): source is BrandVaultSourceInput => Boolean(source))
    .filter((source) => !sources.some((existing) => existing.url === source.url))
    .slice(0, Math.max(0, 5 - sources.length));
  sources.push(...recentSources);

  if (sources.length === 0) {
    return {
      sources: [],
      warnings: warnings.length > 0 ? warnings : ['Brand Vault found X post read access, but no recent authored posts were returned.'],
    };
  }

  if (recentSources.length > 0) {
    warnings.push(`Brand Vault fetched ${recentSources.length} recent X post${recentSources.length === 1 ? '' : 's'} for draft social evidence review.`);
  }

  return {
    sources,
    warnings,
  };
}

async function resolveXUserIdentity(args: {
  accessToken: string;
  tokens: Record<string, unknown> | null | undefined;
  fetchFn: BrandVaultSocialFetch;
  shouldReadPinned: boolean;
}): Promise<XUserIdentity> {
  const tokenIdentity: XUserIdentity = {
    userId: stringValue(args.tokens?.userId),
    pinnedTweetId: pinnedTweetIdFromTokens(args.tokens),
  };
  if (tokenIdentity.userId && (tokenIdentity.pinnedTweetId || !args.shouldReadPinned)) return tokenIdentity;

  const url = new URL('https://api.x.com/2/users/me');
  url.searchParams.set('user.fields', 'pinned_tweet_id,username');
  const response = await args.fetchFn(url.href, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  const payload = await readJsonObject(response);
  if (!response.ok) return tokenIdentity;
  const data = asRecord(payload.data);
  return {
    userId: tokenIdentity.userId ?? stringValue(data.id),
    pinnedTweetId: tokenIdentity.pinnedTweetId ?? stringValue(data.pinned_tweet_id),
  };
}

async function fetchConnectedXPostById(args: {
  accessToken: string;
  postId: string;
  connection: BrandVaultSocialConnectionEvidence;
  parsed: BrandVaultParsedSocialUrl;
  fetchFn: BrandVaultSocialFetch;
}): Promise<SocialFetchResult> {
  const url = new URL(`https://api.x.com/2/tweets/${encodeURIComponent(args.postId)}`);
  url.searchParams.set('tweet.fields', 'created_at,public_metrics,lang');
  const response = await args.fetchFn(url.href, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  const payload = await readJsonObject(response);
  if (!response.ok) {
    return {
      sources: [],
      warnings: [`Brand Vault skipped pinned X post: X API returned ${response.status}${apiErrorMessage(payload)}.`],
    };
  }

  const source = xPostSource(payload.data, args.connection, args.parsed, true);
  if (!source) {
    return {
      sources: [],
      warnings: ['Brand Vault skipped pinned X post: X API did not return readable post text.'],
    };
  }

  return {
    sources: [source],
    warnings: ['Brand Vault fetched pinned X post for draft social evidence review.'],
  };
}

function xPostSource(
  post: unknown,
  connection: BrandVaultSocialConnectionEvidence,
  parsed: BrandVaultParsedSocialUrl,
  pinned: boolean,
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
    name: `${pinned ? 'Pinned ' : ''}X post ${id}`,
    note: [
      pinned
        ? 'Fetched pinned post from connected UploaderX X account via tweet.read for Brand Vault draft review.'
        : 'Fetched from connected UploaderX X account via tweet.read for Brand Vault draft review.',
      metrics,
    ].filter(Boolean).join(' '),
    text,
    evidenceOrigin: 'connected_fetch',
    pinned,
    publishedAt: stringValue(record.created_at),
    metrics: socialMetrics(record.public_metrics),
    connection,
  };
}

async function fetchConnectedInstagramPostSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  connection: BrandVaultSocialConnectionEvidence | null;
  tokens: Record<string, unknown> | null | undefined;
  fetchFn: BrandVaultSocialFetch;
  now?: string;
}): Promise<SocialFetchResult> {
  if (!args.connection?.canReadPosts || args.connection.status !== 'connected') return { sources: [], warnings: [] };
  if (args.connection.matchStatus === 'mismatched') return { sources: [], warnings: [] };

  const accessToken = stringValue(args.tokens?.userAccessToken);
  if (!accessToken) {
    return { sources: [], warnings: ['Brand Vault skipped Instagram media samples: UploaderX user access token was not available.'] };
  }
  if (isExpired(args.tokens?.expiresAt, args.now)) {
    return { sources: [], warnings: ['Brand Vault skipped Instagram media samples: UploaderX Instagram token is expired and must be refreshed before read enrichment.'] };
  }

  const url = new URL('https://graph.instagram.com/v21.0/me/media');
  url.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username,like_count,comments_count');
  url.searchParams.set('limit', '5');
  url.searchParams.set('access_token', accessToken);

  const response = await args.fetchFn(url.href);
  const payload = await readJsonObject(response);
  if (!response.ok) {
    return {
      sources: [],
      warnings: [`Brand Vault skipped Instagram media samples: Instagram API returned ${response.status}${apiErrorMessage(payload)}.`],
    };
  }

  const media = Array.isArray(payload.data) ? payload.data : [];
  const connection = args.connection;
  const sources = media
    .map((item) => instagramMediaSource(item, connection, args.parsed))
    .filter((source): source is BrandVaultSourceInput => Boolean(source))
    .slice(0, 5);

  if (sources.length === 0) {
    return {
      sources: [],
      warnings: ['Brand Vault found Instagram read access, but no recent caption text or media evidence was returned.'],
    };
  }

  return {
    sources,
    warnings: [`Brand Vault fetched ${sources.length} recent Instagram media item${sources.length === 1 ? '' : 's'} for draft social evidence review.`],
  };
}

function instagramMediaSource(
  item: unknown,
  connection: BrandVaultSocialConnectionEvidence,
  parsed: BrandVaultParsedSocialUrl,
): BrandVaultSourceInput | null {
  const record = asRecord(item);
  const id = stringValue(record.id);
  const text = stringValue(record.caption);
  const media = socialMedia({
    mediaType: stringValue(record.media_type),
    mediaUrl: stringValue(record.media_url),
    thumbnailUrl: stringValue(record.thumbnail_url),
  });
  if (!id || (!text && !hasReadableMediaEvidence(media))) return null;

  return {
    kind: 'social_post',
    url: stringValue(record.permalink) ?? parsed.normalizedUrl,
    platform: 'instagram',
    name: `Instagram media ${id}`,
    note: [
      'Fetched from connected UploaderX Instagram account for Brand Vault draft review.',
      stringValue(record.media_type) ? `Media type: ${stringValue(record.media_type)}.` : '',
    ].filter(Boolean).join(' '),
    text: text || undefined,
    evidenceOrigin: 'connected_fetch',
    pinned: false,
    publishedAt: stringValue(record.timestamp),
    media,
    metrics: socialMetrics(record),
    connection,
  };
}

function hasReadableMediaEvidence(media: BrandVaultSocialMediaEvidence | undefined): boolean {
  return Boolean(media?.mediaUrl || media?.thumbnailUrl || media?.ocrText || media?.transcript);
}

async function fetchConnectedLinkedInPostSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  connection: BrandVaultSocialConnectionEvidence | null;
  tokens: Record<string, unknown> | null | undefined;
  fetchFn: BrandVaultSocialFetch;
  now?: string;
}): Promise<SocialFetchResult> {
  if (!args.connection?.canReadPosts || args.connection.status !== 'connected') return { sources: [], warnings: [] };
  if (args.connection.matchStatus === 'mismatched') return { sources: [], warnings: [] };

  const accessToken = stringValue(args.tokens?.accessToken);
  if (!accessToken) {
    return { sources: [], warnings: ['Brand Vault skipped LinkedIn post samples: UploaderX access token was not available.'] };
  }
  if (isExpired(args.tokens?.expiresAt, args.now)) {
    return { sources: [], warnings: ['Brand Vault skipped LinkedIn post samples: UploaderX LinkedIn token is expired and must be refreshed before read enrichment.'] };
  }

  const authorUrn = linkedinAuthorUrn(args.parsed, args.connection, args.tokens);
  if (!authorUrn) {
    return { sources: [], warnings: ['Brand Vault skipped LinkedIn post samples: no readable LinkedIn author URN could be resolved.'] };
  }

  const url = new URL('https://api.linkedin.com/rest/posts');
  url.searchParams.set('q', 'author');
  url.searchParams.set('author', authorUrn);
  url.searchParams.set('count', '5');
  url.searchParams.set('sortBy', 'LAST_MODIFIED');

  const response = await args.fetchFn(url.href, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Linkedin-Version': '202506',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  const payload = await readJsonObject(response);
  if (!response.ok) {
    return {
      sources: [],
      warnings: [`Brand Vault skipped LinkedIn post samples: LinkedIn API returned ${response.status}${apiErrorMessage(payload)}.`],
    };
  }

  const posts = Array.isArray(payload.elements) ? payload.elements : [];
  const sources = posts
    .map((post) => linkedinPostSource(post, args.connection as BrandVaultSocialConnectionEvidence, args.parsed))
    .filter((source): source is BrandVaultSourceInput => Boolean(source))
    .slice(0, 5);

  if (sources.length === 0) {
    return {
      sources: [],
      warnings: ['Brand Vault found LinkedIn read access, but no recent readable post commentary was returned.'],
    };
  }

  return {
    sources,
    warnings: [`Brand Vault fetched ${sources.length} recent LinkedIn post${sources.length === 1 ? '' : 's'} for draft social evidence review.`],
  };
}

function linkedinPostSource(
  post: unknown,
  connection: BrandVaultSocialConnectionEvidence,
  parsed: BrandVaultParsedSocialUrl,
): BrandVaultSourceInput | null {
  const record = asRecord(post);
  const id = stringValue(record.id);
  const text = linkedinPostText(record);
  if (!id || !text) return null;

  return {
    kind: 'social_post',
    url: linkedinPostUrl(id, parsed.normalizedUrl),
    platform: 'linkedin',
    name: `LinkedIn post ${id}`,
    note: 'Fetched from connected UploaderX LinkedIn account via approved read scope for Brand Vault draft review.',
    text,
    evidenceOrigin: 'connected_fetch',
    pinned: false,
    publishedAt: stringValue(record.publishedAt) ?? stringValue(record.createdAt) ?? stringValue(record.lastModifiedAt),
    media: socialMediaFromLinkedIn(record),
    metrics: socialMetrics(record),
    connection,
  };
}

function linkedinPostText(record: Record<string, unknown>): string | undefined {
  const content = asRecord(record.content);
  const article = asRecord(content.article);
  const media = asRecord(content.media);
  const parts = [
    stringValue(record.commentary),
    stringValue(article.title),
    stringValue(article.description),
    stringValue(media.title),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? Array.from(new Set(parts)).join('\n') : undefined;
}

function linkedinPostUrl(id: string, fallbackUrl: string): string {
  return id.startsWith('urn:li:') ? `https://www.linkedin.com/feed/update/${id}` : fallbackUrl;
}

function linkedinAuthorUrn(
  parsed: BrandVaultParsedSocialUrl,
  connection: BrandVaultSocialConnectionEvidence,
  tokens: Record<string, unknown> | null | undefined,
): string | undefined {
  if (parsed.accountType === 'company_page') {
    const organization = linkedinOrganizationForConnection(connection, tokens);
    const organizationId = stringValue(organization.id) ?? connection.accountId;
    return organizationId ? `urn:li:organization:${organizationId}` : undefined;
  }
  const userId = stringValue(tokens?.userId) ?? connection.accountId;
  return userId ? `urn:li:person:${userId}` : undefined;
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
  const matchedOrganization = linkedinOrganizationForHandle(handle, organizations);
  const organizationHandles = organizations.flatMap((org) => {
    const record = asRecord(org);
    return [record.vanityName, record.name, record.id];
  });
  const matchStatus = handleMatch(handle, organizationHandles);
  const scopes = stringList(tokens.scopes);
  const hasOrganizationRead = scopes.includes('r_organization_social');
  const hasMemberRead = scopes.includes('r_member_social');
  const canReadOrganizationPosts = Boolean(matchedOrganization?.id) && hasOrganizationRead && matchStatus !== 'mismatched';
  const canReadMemberPosts = !matchedOrganization && hasMemberRead && Boolean(tokens.userId) && matchStatus !== 'mismatched';
  const canReadPosts = canReadOrganizationPosts || canReadMemberPosts;
  const missingScopes = Array.from(new Set([
    ...stringList(tokens.missingScopes),
    ...(!canReadPosts && matchedOrganization ? ['r_organization_social'] : []),
    ...(!canReadPosts && !matchedOrganization ? ['r_member_social'] : []),
  ]));
  const accountId = stringValue(matchedOrganization?.id) ?? stringValue(tokens.userId);
  const accountName = stringValue(matchedOrganization?.name) ?? stringValue(tokens.userName);
  const accountHandle = stringValue(matchedOrganization?.vanityName) ?? accountName;
  return {
    provider: 'uploaderx',
    status: matchStatus === 'mismatched' ? 'connected_different_account' : canReadPosts ? 'connected' : 'scope_missing',
    accountId,
    accountName,
    accountHandle,
    scopes,
    missingScopes,
    canReadProfile: Boolean(tokens.userId),
    canReadPosts,
    canReadPinned: false,
    matchStatus,
  };
}

function linkedinOrganizationForHandle(handle: string | undefined, organizations: unknown[]): Record<string, unknown> | null {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;
  return organizations
    .map(asRecord)
    .find((organization) => {
      const candidates = [organization.vanityName, organization.name, organization.id].map(normalizeHandle).filter(Boolean);
      return candidates.includes(normalizedHandle);
    }) ?? null;
}

function linkedinOrganizationForConnection(
  connection: BrandVaultSocialConnectionEvidence,
  tokens: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const organizations = Array.isArray(tokens?.organizations) ? tokens.organizations.map(asRecord) : [];
  const normalizedAccountId = normalizeHandle(connection.accountId);
  const normalizedAccountName = normalizeHandle(connection.accountName ?? connection.accountHandle);
  return organizations.find((organization) =>
    [organization.id, organization.name, organization.vanityName]
      .map(normalizeHandle)
      .filter(Boolean)
      .some((candidate) => candidate === normalizedAccountId || candidate === normalizedAccountName),
  ) ?? {};
}

function instagramConnection(handle: string | undefined, tokens: Record<string, unknown> | null | undefined): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.userAccessToken) return null;
  const accounts = Array.isArray(tokens.accounts) ? tokens.accounts : [];
  const matchedAccount = instagramAccountForHandle(handle, accounts) ?? asRecord(accounts[0]);
  const accountHandles = [tokens.userName, ...accounts.map((account) => asRecord(account).instagramUsername)];
  const matchStatus = handleMatch(handle, accountHandles);
  const accountHandle = stringValue(matchedAccount.instagramUsername) ?? stringValue(tokens.userName);
  const accountId = stringValue(matchedAccount.instagramAccountId) ?? stringValue(tokens.userId);
  const canReadPosts = Boolean(tokens.userAccessToken) && matchStatus !== 'mismatched';
  return {
    provider: 'uploaderx',
    status: matchStatus === 'mismatched' ? 'connected_different_account' : 'connected',
    accountId,
    accountName: accountHandle,
    accountHandle,
    canReadProfile: true,
    canReadPosts,
    canReadPinned: false,
    matchStatus,
  };
}

function instagramAccountForHandle(handle: string | undefined, accounts: unknown[]): Record<string, unknown> | null {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;
  return accounts
    .map(asRecord)
    .find((account) => normalizeHandle(account.instagramUsername) === normalizedHandle) ?? null;
}

async function fetchConnectedFacebookPostSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  connection: BrandVaultSocialConnectionEvidence | null;
  tokens: Record<string, unknown> | null | undefined;
  fetchFn: BrandVaultSocialFetch;
  now?: string;
}): Promise<SocialFetchResult> {
  if (!args.connection?.canReadPosts || args.connection.status !== 'connected') return { sources: [], warnings: [] };
  if (args.connection.matchStatus === 'mismatched') return { sources: [], warnings: [] };

  const connection = args.connection;
  const page = facebookPageForConnection(connection, args.tokens);
  const pageId = stringValue(page.pageId);
  const pageAccessToken = stringValue(page.pageAccessToken);
  if (!pageId || !pageAccessToken) {
    return { sources: [], warnings: ['Brand Vault skipped Facebook page posts: connected UploaderX Page token was not available.'] };
  }
  if (isExpired(args.tokens?.expiresAt, args.now)) {
    return { sources: [], warnings: ['Brand Vault skipped Facebook page posts: UploaderX Facebook token is expired and must be refreshed before read enrichment.'] };
  }

  const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/feed`);
  url.searchParams.set('fields', 'id,message,story,permalink_url,created_time,shares,likes.summary(true),comments.summary(true),attachments{title,description,url,media,type}');
  url.searchParams.set('limit', '5');
  url.searchParams.set('access_token', pageAccessToken);

  const response = await args.fetchFn(url.href);
  const payload = await readJsonObject(response);
  if (!response.ok) {
    return {
      sources: [],
      warnings: [`Brand Vault skipped Facebook page posts: Facebook Graph API returned ${response.status}${apiErrorMessage(payload)}.`],
    };
  }

  const posts = Array.isArray(payload.data) ? payload.data : [];
  const sources = posts
    .map((post) => facebookPostSource(post, connection, args.parsed, page))
    .filter((source): source is BrandVaultSourceInput => Boolean(source))
    .slice(0, 5);

  if (sources.length === 0) {
    return {
      sources: [],
      warnings: ['Brand Vault found Facebook Page read access, but no recent readable post text was returned.'],
    };
  }

  return {
    sources,
    warnings: [`Brand Vault fetched ${sources.length} recent Facebook page post${sources.length === 1 ? '' : 's'} for draft social evidence review.`],
  };
}

function facebookPostSource(
  post: unknown,
  connection: BrandVaultSocialConnectionEvidence,
  parsed: BrandVaultParsedSocialUrl,
  page: Record<string, unknown>,
): BrandVaultSourceInput | null {
  const record = asRecord(post);
  const id = stringValue(record.id);
  const text = facebookPostText(record);
  if (!id || !text) return null;

  return {
    kind: 'social_post',
    url: stringValue(record.permalink_url) ?? parsed.normalizedUrl,
    platform: 'facebook',
    name: `Facebook page post ${id}`,
    note: [
      'Fetched from connected UploaderX Facebook Page token for Brand Vault draft review.',
      stringValue(page.pageName) ? `Page: ${stringValue(page.pageName)}.` : '',
    ].filter(Boolean).join(' '),
    text,
    evidenceOrigin: 'connected_fetch',
    pinned: false,
    publishedAt: stringValue(record.created_time),
    media: socialMediaFromFacebook(record),
    metrics: socialMetrics(record),
    connection,
  };
}

function facebookPostText(record: Record<string, unknown>): string | undefined {
  const attachments = asRecord(record.attachments);
  const attachmentData = Array.isArray(attachments.data) ? attachments.data.map(asRecord) : [];
  const parts = [
    stringValue(record.message),
    stringValue(record.story),
    ...attachmentData.flatMap((attachment) => [
      stringValue(attachment.title),
      stringValue(attachment.description),
    ]),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? Array.from(new Set(parts)).join('\n') : undefined;
}

function facebookConnection(handle: string | undefined, tokens: Record<string, unknown> | null | undefined): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.userAccessToken) return null;
  const pages = Array.isArray(tokens.pages) ? tokens.pages : [];
  const matchedPage = facebookPageForHandle(handle, pages) ?? asRecord(pages[0]);
  const pageHandles = pages.flatMap((page) => {
    const record = asRecord(page);
    return [record.pageName, record.pageId];
  });
  const matchStatus = handleMatch(handle, pageHandles);
  const accountName = stringValue(matchedPage.pageName) ?? stringValue(tokens.userName);
  const accountId = stringValue(matchedPage.pageId) ?? stringValue(tokens.userId);
  const canReadPosts = Boolean(matchedPage.pageAccessToken) && matchStatus !== 'mismatched';
  return {
    provider: 'uploaderx',
    status: matchStatus === 'mismatched' ? 'connected_different_account' : 'connected',
    accountId,
    accountName,
    accountHandle: accountName,
    canReadProfile: true,
    canReadPosts,
    canReadPinned: false,
    matchStatus,
  };
}

function facebookPageForHandle(handle: string | undefined, pages: unknown[]): Record<string, unknown> | null {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return null;
  return pages
    .map(asRecord)
    .find((page) => {
      const candidates = [page.pageName, page.pageId, page.vanityName, page.username].map(normalizeHandle).filter(Boolean);
      return candidates.includes(normalizedHandle);
    }) ?? null;
}

function facebookPageForConnection(
  connection: BrandVaultSocialConnectionEvidence,
  tokens: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const pages = Array.isArray(tokens?.pages) ? tokens.pages.map(asRecord) : [];
  const normalizedAccountId = normalizeHandle(connection.accountId);
  const normalizedAccountName = normalizeHandle(connection.accountName ?? connection.accountHandle);
  return pages.find((page) =>
    [page.pageId, page.pageName, page.vanityName, page.username]
      .map(normalizeHandle)
      .filter(Boolean)
      .some((candidate) => candidate === normalizedAccountId || candidate === normalizedAccountName),
  ) ?? {};
}

function publicFallbackEvidenceForPlatform(
  platform: BrandVaultSourcePlatform,
  apifyApiKey: string | undefined,
  apifyActors: BrandVaultConnectedSocialEvidenceArgs['apifyActors'] | undefined,
): BrandVaultSocialConnectionEvidence | null {
  if (!apifyApiKey?.trim()) return null;
  if (platform !== 'instagram' && platform !== 'facebook' && platform !== 'linkedin') return null;
  if (!apifyActors?.[platform]) return null;
  return {
    provider: 'alyzitron_apify',
    status: 'public_fallback_available',
    canReadProfile: false,
    canReadPosts: false,
    canReadPinned: false,
    matchStatus: 'unverified',
  };
}

function shouldFetchPublicFallback(
  connection: BrandVaultSocialConnectionEvidence | null,
  parsed: BrandVaultParsedSocialUrl,
): boolean {
  if (parsed.isPostUrl && ['youtube', 'x', 'tiktok'].includes(parsed.platform)) return true;
  if (parsed.platform === 'youtube' && !parsed.isPostUrl && connection?.canReadPosts !== true) return true;
  if (!connection) return true;
  if (connection.provider === 'alyzitron_apify') return true;
  if (connection.status === 'connected_different_account' || connection.matchStatus === 'mismatched') return true;
  return false;
}

async function fetchPublicSocialSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  apifyApiKey: string | undefined;
  apifyActors: BrandVaultConnectedSocialEvidenceArgs['apifyActors'] | undefined;
  fetchFn: BrandVaultSocialFetch;
}): Promise<SocialFetchResult> {
  if (isApifySupportedPlatform(args.parsed.platform) && shouldFetchApifyForParsedSocialUrl(args.parsed)) {
    const apiKey = args.apifyApiKey?.trim();
    const apifyActorId = args.apifyActors?.[args.parsed.platform];
    if (!apiKey) {
      if (!args.parsed.isPostUrl) {
        return {
          sources: [],
          warnings: [`Brand Vault skipped ${args.parsed.platform} Apify fallback: APIFY_API_KEY is not configured.`],
        };
      }
    } else if (!apifyActorId) {
      if (!args.parsed.isPostUrl) {
        return {
          sources: [],
          warnings: [`Brand Vault skipped ${args.parsed.platform} Apify fallback: no Apify actor is configured for this platform.`],
        };
      }
    } else {
      const apify = await fetchApifySocialSources({
        parsed: args.parsed,
        apiKey,
        actorId: apifyActorId,
        fetchFn: args.fetchFn,
      });
      if (apify.sources.length > 0 || apify.warnings.length > 0) return apify;
    }
  }

  if (args.parsed.isPostUrl && ['youtube', 'x', 'tiktok'].includes(args.parsed.platform)) {
    return fetchPublicOEmbedPostSource(args);
  }

  if (args.parsed.platform === 'youtube' && !args.parsed.isPostUrl) {
    return fetchPublicYouTubeChannelSources(args);
  }

  if (!args.parsed.isPostUrl) return { sources: [], warnings: [] };
  if (args.parsed.platform !== 'linkedin' && args.parsed.platform !== 'facebook') return { sources: [], warnings: [] };

  const baseSource: BrandVaultSourceInput = {
    kind: 'social_post',
    url: args.parsed.normalizedUrl,
    platform: args.parsed.platform,
    name: `${platformLabel(args.parsed.platform)} post URL`,
    note: 'Explicit social post URL supplied by the user; Brand Vault treats public metadata as review-only fallback evidence.',
    evidenceOrigin: 'public_fallback',
    pinned: false,
  };

  try {
    const response = await args.fetchFn(args.parsed.normalizedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 BrandVault/1.0' },
    });
    if (!response.ok) {
      return {
        sources: [baseSource],
        warnings: [`Brand Vault staged ${args.parsed.platform} post URL, but public metadata fetch returned ${response.status}.`],
      };
    }
    const html = await response.text();
    const metadataText = socialPostMetadataText(html);
    if (!metadataText) {
      return {
        sources: [baseSource],
        warnings: [`Brand Vault staged ${args.parsed.platform} post URL, but public metadata did not include readable post text.`],
      };
    }
    return {
      sources: [{ ...baseSource, text: metadataText }],
      warnings: [`Brand Vault fetched public metadata for ${args.parsed.platform} post URL as draft-only evidence.`],
    };
  } catch {
    return {
      sources: [baseSource],
      warnings: [`Brand Vault staged ${args.parsed.platform} post URL, but public metadata fetch failed.`],
    };
  }
}

async function fetchApifySocialSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  apiKey: string;
  actorId: string;
  fetchFn: BrandVaultSocialFetch;
}): Promise<SocialFetchResult> {
  const endpoint = new URL(`https://api.apify.com/v2/acts/${encodeURIComponent(args.actorId)}/run-sync-get-dataset-items`);
  endpoint.searchParams.set('token', args.apiKey);
  endpoint.searchParams.set('clean', 'true');
  endpoint.searchParams.set('format', 'json');
  try {
    const response = await args.fetchFn(endpoint.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(apifyRunInput(args.parsed)),
    });
    const payload = await readJsonValue(response);
    if (!response.ok) {
      return {
        sources: [],
        warnings: [`Brand Vault skipped ${args.parsed.platform} Apify fallback: Apify returned ${response.status}.`],
      };
    }
    const payloadRecord = asRecord(payload);
    const items: unknown[] = Array.isArray(payload) ? payload : Array.isArray(payloadRecord.items) ? payloadRecord.items : [];
    if (!Array.isArray(payload) && !Array.isArray(payloadRecord.items)) {
      return {
        sources: [],
        warnings: [`Brand Vault ran ${args.parsed.platform} Apify fallback, but Apify returned an unsupported dataset payload shape: ${apifyPayloadShape(payload)}.`],
      };
    }
    const normalizedItems = items.map((item, index) => apifySocialSource(item, args.parsed, index));
    const readableSources = normalizedItems
      .map((item) => item.source)
      .filter((source): source is BrandVaultSourceInput => Boolean(source));
    const sources = readableSources.slice(0, 5);
    const rejectedCount = normalizedItems.filter((item) => item.rejectionReason).length;
    const rejectionSummary = apifyRejectionSummary(normalizedItems);
    if (sources.length === 0) {
      if (items.length === 0) {
        return {
          sources: [],
          warnings: [`Brand Vault ran ${args.parsed.platform} Apify fallback, but Apify returned 0 dataset items.`],
        };
      }
      return {
        sources: [],
        warnings: [
          `Brand Vault ran ${args.parsed.platform} Apify fallback, but ${items.length} dataset item${items.length === 1 ? '' : 's'} produced no readable matched post/profile evidence.`,
          ...(rejectionSummary ? [`Brand Vault ${args.parsed.platform} Apify rejection reasons: ${rejectionSummary}.`] : []),
        ],
      };
    }
    return {
      sources,
      warnings: [
        `Brand Vault fetched ${sources.length} ${args.parsed.platform} public Apify item${sources.length === 1 ? '' : 's'} for review-only social evidence.`,
        ...(rejectedCount > 0
          ? [`Brand Vault discarded ${rejectedCount} ${args.parsed.platform} Apify item${rejectedCount === 1 ? '' : 's'} because they were unreadable, hollow, or did not match the submitted account.`]
          : []),
        ...(rejectionSummary ? [`Brand Vault ${args.parsed.platform} Apify rejection reasons: ${rejectionSummary}.`] : []),
      ],
    };
  } catch (error) {
    return {
      sources: [],
      warnings: [`Brand Vault skipped ${args.parsed.platform} Apify fallback: ${errorMessage(error)}`],
    };
  }
}

function shouldFetchApifyForParsedSocialUrl(parsed: BrandVaultParsedSocialUrl): boolean {
  if (parsed.platform !== 'linkedin') return true;
  return !parsed.isPostUrl && (parsed.accountType === 'company_page' || parsed.accountType === 'creator_profile');
}

function isApifySupportedPlatform(platform: BrandVaultSourcePlatform): platform is ApifySupportedPlatform {
  return platform === 'instagram' || platform === 'facebook' || platform === 'linkedin';
}

function apifyRunInput(parsed: BrandVaultParsedSocialUrl): Record<string, unknown> {
  const base = {
    directUrls: [parsed.normalizedUrl],
    startUrls: [{ url: parsed.normalizedUrl }],
    resultsLimit: 5,
    maxItems: 5,
    maxPosts: 5,
  };
  if (parsed.platform !== 'linkedin') return base;
  return {
    ...base,
    profiles: parsed.accountType === 'creator_profile' ? [parsed.normalizedUrl] : [],
    companies: parsed.accountType === 'company_page' ? [parsed.normalizedUrl] : [],
    contentType: 'all',
    includeSharedPosts: true,
    includeReposts: true,
  };
}

function apifyPayloadShape(payload: unknown): string {
  if (Array.isArray(payload)) return 'array';
  const record = asRecord(payload);
  const keys = Object.keys(record).slice(0, 6);
  if (keys.length > 0) return `object(${keys.join(',')})`;
  return typeof payload;
}

function apifyRejectionSummary(results: ApifySocialSourceResult[]): string | null {
  const counts = results.reduce<Record<string, number>>((acc, result) => {
    if (!result.rejectionReason) return acc;
    acc[result.rejectionReason] = (acc[result.rejectionReason] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reason, count]) => `${reason}=${count}`)
    .join(', ');
  return summary || null;
}

function apifySocialSource(item: unknown, parsed: BrandVaultParsedSocialUrl, index: number): ApifySocialSourceResult {
  const record = asRecord(item);
  const author = asRecord(record.author);
  const actor = asRecord(record.actor);
  const content = asRecord(record.content);
  const commentary = asRecord(record.commentary);
  const engagement = asRecord(record.engagement);
  const doc = asRecord(record.doc);
  const post = asRecord(record.post);
  const text = uniqueStrings([
    stringValue(record.caption),
    stringValue(record.text),
    stringValue(record.content),
    stringValue(record.postText),
    stringValue(record.textContent),
    stringValue(record.message),
    stringValue(record.body),
    stringValue(record.description),
    stringValue(record.title),
    stringValue(content.text),
    stringValue(content.body),
    stringValue(content.description),
    stringValue(content.title),
    stringValue(commentary.text),
    stringValue(post.text),
    stringValue(post.content),
    stringValue(post.commentary),
    stringValue(doc.text),
    stringValue(doc.content),
    stringValue(doc.description),
    stringValue(doc.title),
    stringValue(record.alt),
    stringValue(record.ocrText),
    stringValue(record.transcript),
  ]).join('\n');
  const firstImage = firstStringFromArray(record.images);
  const firstImageObjectUrl = firstStringFromRecordArray(record.images, ['url', 'src', 'imageUrl']);
  const firstMediaUrl = firstStringFromRecordArray(record.media, ['url', 'mediaUrl', 'imageUrl', 'videoUrl', 'thumbnailUrl']);
  const firstAttachmentUrl = firstStringFromRecordArray(record.attachments, ['url', 'mediaUrl', 'imageUrl', 'thumbnailUrl']);
  const firstSlideImage = firstStringFromArray(doc.slide_images);
  const sourceUrl = firstString(record.url, record.postUrl, record.post_url, record.postLink, record.linkToPost, record.activityUrl, record.permalink, record.link, record.shortUrl, record.share_url, post.url, post.postUrl) ?? parsed.normalizedUrl;
  const accountHandle = firstString(record.ownerUsername, record.username, record.authorUsername, record.authorHandle, author.username, author.handle, actor.username, actor.handle, record.author);
  const accountName = firstString(record.ownerFullName, record.fullName, record.author_name, record.authorName, author.name, actor.name, record.pageName, record.companyName);
  const displayName = firstString(record.ownerUsername, record.username, record.author_name, record.authorName, author.name, actor.name, record.author, record.ownerFullName, record.pageName, record.companyName);
  const identityMatchStatus = apifyIdentityMatchStatus({
    parsed,
    sourceUrl,
    accountHandle,
    accountName,
    displayName,
  });
  if (!identityMatchStatus) {
    return { source: null, rejectionReason: 'identity_mismatch' };
  }
  const media = socialMedia({
    mediaType: firstString(record.video_url || record.videoUrl ? 'video' : undefined, firstImage || firstImageObjectUrl ? 'image' : undefined, doc.pdf_url ? 'carousel' : undefined, record.mediaType, record.productType, record.post_type, record.type),
    mediaUrl: firstString(record.videoUrl, record.video_url, record.mediaUrl, record.displayUrl, record.imageUrl, firstImage, firstImageObjectUrl, firstMediaUrl, firstAttachmentUrl, doc.pdf_url),
    thumbnailUrl: firstString(record.thumbnailUrl, record.thumbnail, record.displayUrl, record.imageUrl, firstImage, firstImageObjectUrl, firstMediaUrl, firstAttachmentUrl, firstSlideImage),
    ocrText: stringValue(record.ocrText),
    transcript: stringValue(record.transcript),
  });
  const metrics = socialMetrics({ ...record, ...engagement });
  const profile = socialProfile({ ...record, ...author, url: undefined });
  if (!text && !media && !metrics && !profile) return { source: null, rejectionReason: 'hollow_item' };
  return {
    source: {
      kind: parsed.isPostUrl || text ? 'social_post' : 'social_profile',
      url: sourceUrl,
      platform: parsed.platform,
      name: displayName ?? `${platformLabel(parsed.platform)} public item ${index + 1}`,
      note: 'Fetched through Alyzitron Apify public fallback for Brand Vault draft review; treat as review-only evidence.',
      text: text || undefined,
      evidenceOrigin: 'public_fallback',
      pinned: booleanValue(record.isPinned) ?? booleanValue(record.pinned) ?? false,
      publishedAt: firstString(record.timestamp, record.takenAt, record.createdAt, record.posted_at, record.postedAt, record.date),
      media,
      metrics,
      profile,
      connection: {
        provider: 'alyzitron_apify',
        status: 'public_fallback_available',
        accountHandle,
        accountName,
        canReadProfile: Boolean(profile),
        canReadPosts: true,
        canReadPinned: false,
        matchStatus: identityMatchStatus,
      },
    },
  };
}

function apifyIdentityMatchStatus(args: {
  parsed: BrandVaultParsedSocialUrl;
  sourceUrl: string;
  accountHandle?: string;
  accountName?: string;
  displayName?: string;
}): BrandVaultSocialConnectionEvidence['matchStatus'] | null {
  const expected = normalizeHandle(args.parsed.handle);
  if (!expected) return 'unverified';

  const normalizedSourceUrl = args.sourceUrl.toLowerCase();
  const sourcePathMatches = urlPathHasHandle(normalizedSourceUrl, expected);
  const identityMatches = [
    args.accountHandle,
    args.accountName,
    args.displayName,
  ].some((candidate) => normalizeHandle(candidate) === expected);

  if (identityMatches || sourcePathMatches) return 'matched';

  const hasReturnedIdentity = Boolean(normalizeHandle(args.accountHandle) || normalizeHandle(args.accountName) || normalizeHandle(args.displayName));
  const postLikeUrl = args.parsed.isPostUrl || isPlatformPostUrl(args.parsed.platform, args.sourceUrl);
  return !hasReturnedIdentity && !postLikeUrl ? 'unverified' : null;
}

function urlPathHasHandle(value: string, expected: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname
      .split('/')
      .map((segment) => normalizeHandle(segment))
      .filter(Boolean)
      .includes(expected);
  } catch {
    return false;
  }
}

function isPlatformPostUrl(platform: BrandVaultSourcePlatform, value: string): boolean {
  const normalized = value.toLowerCase();
  if (platform === 'instagram') return /\/(?:p|reel|tv)\//.test(normalized);
  if (platform === 'facebook') return /\/(?:posts|videos|reel|photos)\//.test(normalized) || /story_fbid=/.test(normalized);
  if (platform === 'linkedin') return /\/feed\/update\/|\/posts\//.test(normalized);
  return false;
}

async function fetchPublicOEmbedPostSource(args: {
  parsed: BrandVaultParsedSocialUrl;
  fetchFn: BrandVaultSocialFetch;
}): Promise<SocialFetchResult> {
  if (args.parsed.platform === 'youtube') return fetchPublicYouTubePostSource(args);

  const endpoint = publicOEmbedEndpoint(args.parsed);
  if (!endpoint) return { sources: [], warnings: [] };
  try {
    const response = await args.fetchFn(endpoint.href);
    const payload = await readJsonObject(response);
    if (!response.ok) {
      return {
        sources: [],
        warnings: [`Brand Vault skipped ${args.parsed.platform} oEmbed fallback: public endpoint returned ${response.status}.`],
      };
    }
    const title = stringValue(payload.title);
    const author = stringValue(payload.author_name);
    const html = stripHtml(stringValue(payload.html));
    const text = uniqueStrings([title, author, html]).join('\n');
    if (!text) {
      return {
        sources: [],
        warnings: [`Brand Vault skipped ${args.parsed.platform} oEmbed fallback: no readable text was returned.`],
      };
    }
    return {
      sources: [{
        kind: 'social_post',
        url: args.parsed.normalizedUrl,
        platform: args.parsed.platform,
        name: title ?? `${platformLabel(args.parsed.platform)} public post`,
        note: 'Fetched public oEmbed metadata for Brand Vault draft review; this is thin review-only evidence.',
        text,
        evidenceOrigin: 'public_fallback',
        pinned: false,
        media: socialMedia({
          mediaType: 'link',
          thumbnailUrl: stringValue(payload.thumbnail_url),
        }),
        profile: author ? { bio: author } : undefined,
      }],
      warnings: [`Brand Vault fetched ${args.parsed.platform} public oEmbed metadata as review-only social evidence.`],
    };
  } catch {
    return {
      sources: [],
      warnings: [`Brand Vault skipped ${args.parsed.platform} oEmbed fallback: public metadata fetch failed.`],
    };
  }
}

async function fetchPublicYouTubePostSource(args: {
  parsed: BrandVaultParsedSocialUrl;
  fetchFn: BrandVaultSocialFetch;
}): Promise<SocialFetchResult> {
  const warnings: string[] = [];
  const endpoint = publicOEmbedEndpoint(args.parsed);
  const oEmbedPayload = endpoint ? await fetchPublicOEmbedPayload(args.parsed.platform, endpoint, args.fetchFn, warnings) : {};
  const watchPage = await fetchYouTubeWatchPageEvidence(args.parsed, args.fetchFn);
  warnings.push(...watchPage.warnings);

  const title = firstString(watchPage.evidence.title, oEmbedPayload.title);
  const author = firstString(watchPage.evidence.author, oEmbedPayload.author_name);
  const description = meaningfulYouTubeDescription(firstString(watchPage.evidence.description));
  const html = stripHtml(stringValue(oEmbedPayload.html));
  const text = uniqueStrings([title, description, author, html]).join('\n');
  const media = socialMedia({
    mediaType: 'video',
    thumbnailUrl: firstString(watchPage.evidence.thumbnailUrl, oEmbedPayload.thumbnail_url),
    transcript: watchPage.evidence.transcript,
    durationSeconds: watchPage.evidence.durationSeconds,
  });
  const metrics = socialMetrics({ viewCount: watchPage.evidence.viewCount });
  const profile = socialProfile({
    bio: author,
    category: watchPage.evidence.category,
  });

  if (!text && !media && !metrics && !profile) {
    return {
      sources: [],
      warnings: warnings.length > 0 ? warnings : ['Brand Vault skipped youtube public fallback: no readable metadata was returned.'],
    };
  }

  warnings.push(
    watchPage.evidence.transcript
      ? 'Brand Vault fetched youtube public oEmbed, watch metadata, and captions as review-only social evidence.'
      : 'Brand Vault fetched youtube public oEmbed and watch metadata as review-only social evidence.',
  );

  return {
    sources: [{
      kind: 'social_post',
      url: args.parsed.normalizedUrl,
      platform: 'youtube',
      name: title ?? 'YouTube public post',
      note: 'Fetched public YouTube oEmbed and watch-page metadata for Brand Vault draft review; this is review-only evidence.',
      text: text || undefined,
      evidenceOrigin: 'public_fallback',
      pinned: false,
      publishedAt: watchPage.evidence.publishedAt,
      media,
      metrics,
      profile,
    }],
    warnings,
  };
}

async function fetchPublicYouTubeChannelSources(args: {
  parsed: BrandVaultParsedSocialUrl;
  fetchFn: BrandVaultSocialFetch;
}): Promise<SocialFetchResult> {
  try {
    const response = await args.fetchFn(args.parsed.normalizedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 BrandVault/1.0' },
    });
    if (!response.ok) {
      return {
        sources: [],
        warnings: [`Brand Vault skipped youtube channel public fallback: channel page returned ${response.status}.`],
      };
    }

    const html = await response.text();
    const videoIds = extractYouTubeChannelVideoIds(html, 2);
    if (videoIds.length === 0) {
      return {
        sources: [],
        warnings: ['Brand Vault fetched youtube channel page, but no public video ids were found.'],
      };
    }

    const sources: BrandVaultSourceInput[] = [];
    const warnings: string[] = [];
    for (const videoId of videoIds) {
      const videoParsed = parseBrandVaultSocialUrl(`https://www.youtube.com/watch?v=${videoId}`, 'youtube');
      if (!videoParsed) continue;
      const fetched = await fetchPublicYouTubePostSource({ parsed: videoParsed, fetchFn: args.fetchFn });
      sources.push(...fetched.sources);
      warnings.push(...fetched.warnings);
    }

    if (sources.length === 0) {
      return {
        sources: [],
        warnings: warnings.length > 0 ? warnings : ['Brand Vault found youtube channel videos, but no readable public video evidence was returned.'],
      };
    }

    warnings.push(
      `Brand Vault fetched ${sources.length} recent YouTube public video${sources.length === 1 ? '' : 's'} from channel page as review-only social evidence.`,
    );
    return { sources, warnings };
  } catch {
    return {
      sources: [],
      warnings: ['Brand Vault skipped youtube channel public fallback: channel metadata fetch failed.'],
    };
  }
}

async function fetchPublicOEmbedPayload(
  platform: BrandVaultSourcePlatform,
  endpoint: URL,
  fetchFn: BrandVaultSocialFetch,
  warnings: string[],
): Promise<Record<string, unknown>> {
  try {
    const response = await fetchFn(endpoint.href);
    const payload = await readJsonObject(response);
    if (!response.ok) {
      warnings.push(`Brand Vault skipped ${platform} oEmbed fallback: public endpoint returned ${response.status}.`);
      return {};
    }
    return payload;
  } catch {
    warnings.push(`Brand Vault skipped ${platform} oEmbed fallback: public metadata fetch failed.`);
    return {};
  }
}

async function fetchYouTubeWatchPageEvidence(
  parsed: BrandVaultParsedSocialUrl,
  fetchFn: BrandVaultSocialFetch,
): Promise<{ evidence: YouTubePublicEvidence; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const response = await fetchFn(parsed.normalizedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 BrandVault/1.0' },
    });
    if (!response.ok) {
      return {
        evidence: {},
        warnings: [`Brand Vault skipped youtube watch-page metadata: public page returned ${response.status}.`],
      };
    }

    const html = await response.text();
    const player = extractYouTubeInitialPlayerResponse(html);
    const evidence = youtubeEvidenceFromWatchHtml(html, player);
    const captionTranscript = player ? await fetchYouTubeCaptionTranscript(player, fetchFn) : null;
    if (captionTranscript?.transcript) evidence.transcript = captionTranscript.transcript;
    if (captionTranscript?.warning) warnings.push(captionTranscript.warning);
    return { evidence, warnings };
  } catch {
    return {
      evidence: {},
      warnings: ['Brand Vault skipped youtube watch-page metadata: public metadata fetch failed.'],
    };
  }
}

function publicOEmbedEndpoint(parsed: BrandVaultParsedSocialUrl): URL | null {
  if (parsed.platform === 'youtube') {
    const url = new URL('https://www.youtube.com/oembed');
    url.searchParams.set('url', parsed.normalizedUrl);
    url.searchParams.set('format', 'json');
    return url;
  }
  if (parsed.platform === 'tiktok') {
    const url = new URL('https://www.tiktok.com/oembed');
    url.searchParams.set('url', parsed.normalizedUrl);
    return url;
  }
  if (parsed.platform === 'x') {
    const url = new URL('https://publish.twitter.com/oembed');
    url.searchParams.set('url', parsed.normalizedUrl);
    url.searchParams.set('omit_script', 'true');
    return url;
  }
  return null;
}

function youtubeEvidenceFromWatchHtml(html: string, player: Record<string, unknown> | null): YouTubePublicEvidence {
  const videoDetails = asRecord(player?.videoDetails);
  const microformat = asRecord(asRecord(player?.microformat).playerMicroformatRenderer);
  const metadataText = socialPostMetadataText(html);
  return {
    title: youtubeTextValue(videoDetails.title, microformat.title, metaContent(html, 'og:title')),
    author: firstString(videoDetails.author, microformat.ownerChannelName),
    description: youtubeTextValue(videoDetails.shortDescription, microformat.description, metadataText),
    publishedAt: firstString(microformat.publishDate, microformat.uploadDate, metaContent(html, 'datePublished')),
    category: firstString(microformat.category),
    thumbnailUrl: lastThumbnailUrl(videoDetails.thumbnail) ?? lastThumbnailUrl(microformat.thumbnail) ?? metaContent(html, 'og:image'),
    durationSeconds: firstNumber(videoDetails.lengthSeconds, microformat.lengthSeconds),
    viewCount: firstNumber(videoDetails.viewCount, microformat.viewCount, microformat.interactionCount),
  };
}

function meaningfulYouTubeDescription(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return undefined;
  const genericPhrases = [
    'enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on youtube',
  ];
  return genericPhrases.some((phrase) => normalized.includes(phrase)) ? undefined : value;
}

async function fetchYouTubeCaptionTranscript(
  player: Record<string, unknown>,
  fetchFn: BrandVaultSocialFetch,
): Promise<{ transcript?: string; warning?: string } | null> {
  const captions = asRecord(player.captions);
  const renderer = asRecord(captions.playerCaptionsTracklistRenderer);
  const tracks = Array.isArray(renderer.captionTracks) ? renderer.captionTracks.map(asRecord) : [];
  const track = preferredYouTubeCaptionTrack(tracks);
  const baseUrl = stringValue(track?.baseUrl);
  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.has('fmt')) url.searchParams.set('fmt', 'srv3');
    const response = await fetchFn(url.href);
    if (!response.ok) return { warning: `Brand Vault skipped youtube captions: caption endpoint returned ${response.status}.` };
    const transcript = transcriptTextFromCaptionPayload(await response.text());
    return transcript ? { transcript } : { warning: 'Brand Vault skipped youtube captions: caption payload had no readable text.' };
  } catch {
    return { warning: 'Brand Vault skipped youtube captions: caption fetch failed.' };
  }
}

function preferredYouTubeCaptionTrack(tracks: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return (
    tracks.find((track) => stringValue(track.languageCode)?.toLowerCase().startsWith('en') && !stringValue(track.kind)) ??
    tracks.find((track) => stringValue(track.languageCode)?.toLowerCase().startsWith('en')) ??
    tracks.find((track) => !stringValue(track.kind)) ??
    tracks[0]
  );
}

function transcriptTextFromCaptionPayload(payload: string): string | undefined {
  const xmlText = [...payload.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
    .map((match) => decodeHtmlEntities(stripHtml(match[1])))
    .filter((part): part is string => Boolean(part));
  if (xmlText.length > 0) return boundedText(uniqueStrings(xmlText).join(' '), 2200);

  const vttText = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== 'WEBVTT' && !line.includes('-->') && !/^\d+$/.test(line))
    .map((line) => decodeHtmlEntities(line))
    .filter((line): line is string => Boolean(line));
  return vttText.length > 0 ? boundedText(uniqueStrings(vttText).join(' '), 2200) : undefined;
}

function extractYouTubeInitialPlayerResponse(html: string): Record<string, unknown> | null {
  const markers = ['ytInitialPlayerResponse =', 'ytInitialPlayerResponse='];
  const markerIndex = markers
    .map((marker) => ({ marker, index: html.indexOf(marker) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  if (!markerIndex) return null;

  const jsonStart = html.indexOf('{', markerIndex.index + markerIndex.marker.length);
  if (jsonStart < 0) return null;
  const jsonText = balancedJsonObjectAt(html, jsonStart);
  if (!jsonText) return null;
  try {
    return asRecord(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function extractYouTubeChannelVideoIds(html: string, limit: number): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{6,})"/g)) {
    ids.add(match[1]);
    if (ids.size >= limit) return [...ids];
  }
  for (const match of html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{6,})/g)) {
    ids.add(match[1]);
    if (ids.size >= limit) return [...ids];
  }
  return [...ids].slice(0, limit);
}

function balancedJsonObjectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function lastThumbnailUrl(value: unknown): string | undefined {
  const thumbnailValue = asRecord(value).thumbnails;
  const thumbnails = Array.isArray(thumbnailValue) ? thumbnailValue.map(asRecord) : [];
  return firstString(...thumbnails.slice().reverse().map((thumbnail) => thumbnail.url));
}

function youtubeTextValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    const direct = stringValue(value);
    if (direct) return direct;
    const record = asRecord(value);
    const simpleText = stringValue(record.simpleText);
    if (simpleText) return simpleText;
    const runs = Array.isArray(record.runs) ? record.runs.map(asRecord) : [];
    const runText = uniqueStrings(runs.map((run) => stringValue(run.text))).join(' ');
    if (runText) return runText;
  }
  return undefined;
}

function socialPostMetadataText(html: string): string | undefined {
  const parts = [
    metaContent(html, 'og:title'),
    metaContent(html, 'og:description'),
    metaContent(html, 'twitter:title'),
    metaContent(html, 'twitter:description'),
    metaContent(html, 'description'),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? Array.from(new Set(parts)).join('\n') : undefined;
}

function socialMedia(input: {
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  ocrText?: string;
  transcript?: string;
  durationSeconds?: number;
}): BrandVaultSocialMediaEvidence | undefined {
  const mediaType = normalizeMediaType(input.mediaType);
  const value: BrandVaultSocialMediaEvidence = {
    mediaType,
    mediaUrl: input.mediaUrl,
    thumbnailUrl: input.thumbnailUrl,
    ocrText: input.ocrText,
    transcript: input.transcript,
    durationSeconds: input.durationSeconds,
  };
  return hasDefinedValue(value) ? value : undefined;
}

function socialMediaFromLinkedIn(record: Record<string, unknown>): BrandVaultSocialMediaEvidence | undefined {
  const content = asRecord(record.content);
  const media = asRecord(content.media);
  const article = asRecord(content.article);
  return socialMedia({
    mediaType: firstString(media.mediaType, media.type, article.source) ? 'link' : undefined,
    mediaUrl: firstString(media.url, article.source),
    thumbnailUrl: firstString(media.thumbnail, media.thumbnailUrl),
  });
}

function socialMediaFromFacebook(record: Record<string, unknown>): BrandVaultSocialMediaEvidence | undefined {
  const attachments = asRecord(record.attachments);
  const attachment = Array.isArray(attachments.data) ? asRecord(attachments.data[0]) : {};
  const media = asRecord(attachment.media);
  const image = asRecord(media.image);
  return socialMedia({
    mediaType: firstString(attachment.type, record.type),
    mediaUrl: firstString(attachment.url),
    thumbnailUrl: firstString(image.src, attachment.thumbnail_url),
  });
}

function socialMetrics(value: unknown): BrandVaultSocialMetricsEvidence | undefined {
  const record = asRecord(value);
  const likes = asRecord(record.likes);
  const comments = asRecord(record.comments);
  const shares = asRecord(record.shares);
  const likesSummary = asRecord(likes.summary);
  const commentsSummary = asRecord(comments.summary);
  const metrics: BrandVaultSocialMetricsEvidence = {
    likeCount: firstNumber(record.like_count, record.likesCount, record.likeCount, record.total_reactions, record.reactionsCount, likesSummary.total_count),
    commentCount: firstNumber(record.comments_count, record.commentsCount, record.commentCount, record.comments, commentsSummary.total_count),
    shareCount: firstNumber(record.shareCount, record.sharesCount, record.shares, shares.count),
    viewCount: firstNumber(record.viewCount, record.videoViewCount, record.playCount),
    repostCount: firstNumber(record.retweet_count, record.repostCount, record.retweetsCount),
    quoteCount: firstNumber(record.quote_count, record.quoteCount),
  };
  const engagement = [metrics.likeCount, metrics.commentCount, metrics.shareCount, metrics.repostCount, metrics.quoteCount]
    .filter((item): item is number => typeof item === 'number')
    .reduce((sum, item) => sum + item, 0);
  if (engagement > 0) metrics.engagementCount = engagement;
  return hasDefinedValue(metrics) ? metrics : undefined;
}

function socialProfile(record: Record<string, unknown>): BrandVaultSocialProfileEvidence | undefined {
  const value: BrandVaultSocialProfileEvidence = {
    bio: firstString(record.biography, record.bio, record.about, record.description, record.headline),
    category: firstString(record.category, record.businessCategoryName, record.pageCategory),
    website: firstString(record.externalUrl, record.website, record.website_url, record.websiteUrl, record.url),
    followerCount: firstNumber(record.followersCount, record.followerCount, record.followers),
  };
  return hasDefinedValue(value) ? value : undefined;
}

function normalizeMediaType(value: string | undefined): BrandVaultSocialMediaEvidence['mediaType'] | undefined {
  const lower = value?.toLowerCase() ?? '';
  if (!lower) return undefined;
  if (lower.includes('carousel') || lower.includes('album')) return 'carousel';
  if (lower.includes('video') || lower.includes('reel')) return 'video';
  if (lower.includes('image') || lower.includes('photo')) return 'image';
  if (lower.includes('link') || lower.includes('article')) return 'link';
  return undefined;
}

function hasDefinedValue(value: object): boolean {
  return Object.values(value as Record<string, unknown>).some((item) => item !== undefined && item !== null && (!Array.isArray(item) || item.length > 0));
}

function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\b(?=[^>]*(?:property|name)=["']${escaped}["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>`, 'i'),
    new RegExp(`<meta\\b(?=[^>]*content=["']([^"']+)["'])(?=[^>]*(?:property|name)=["']${escaped}["'])[^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = decodeHtmlEntities(match?.[1]);
    if (value) return value;
  }
  return undefined;
}

function decodeHtmlEntities(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const decoded = value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return decoded || undefined;
}

function boundedText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function platformLabel(platform: BrandVaultSourcePlatform): string {
  if (platform === 'x') return 'X';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
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

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const string = stringValue(value);
    if (string) return string;
  }
  return undefined;
}

function firstStringFromArray(value: unknown): string | undefined {
  return Array.isArray(value) ? firstString(...value) : undefined;
}

function firstStringFromRecordArray(value: unknown, keys: string[]): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const record = asRecord(item);
    const match = firstString(...keys.map((key) => record[key]));
    if (match) return match;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== undefined) return number;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|yes|1)$/i.test(value.trim())) return true;
    if (/^(false|no|0)$/i.test(value.trim())) return false;
  }
  return undefined;
}

function stripHtml(value: string | undefined): string | undefined {
  return value
    ?.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || undefined;
}

function pinnedTweetIdFromTokens(tokens: Record<string, unknown> | null | undefined): string | undefined {
  if (!tokens) return undefined;
  const profile = asRecord(tokens.profile);
  const user = asRecord(tokens.user);
  const data = asRecord(tokens.data);
  return (
    stringValue(tokens.pinnedTweetId) ??
    stringValue(tokens.pinned_tweet_id) ??
    stringValue(tokens.pinnedPostId) ??
    stringValue(tokens.pinned_post_id) ??
    stringValue(profile.pinnedTweetId) ??
    stringValue(profile.pinned_tweet_id) ??
    stringValue(user.pinnedTweetId) ??
    stringValue(user.pinned_tweet_id) ??
    stringValue(data.pinned_tweet_id)
  );
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

async function readJsonValue(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiErrorMessage(payload: Record<string, unknown>): string {
  const detail = stringValue(payload.detail) ?? stringValue(asRecord(payload.error).message);
  return detail ? `: ${detail}` : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
