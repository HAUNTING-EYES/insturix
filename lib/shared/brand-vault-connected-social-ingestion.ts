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

type XUserIdentity = {
  userId?: string;
  pinnedTweetId?: string;
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
  url.searchParams.set('fields', 'id,caption,media_type,permalink,timestamp,username');
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
      warnings: ['Brand Vault found Instagram read access, but no recent caption text was returned.'],
    };
  }

  return {
    sources,
    warnings: [`Brand Vault fetched ${sources.length} recent Instagram media caption${sources.length === 1 ? '' : 's'} for draft social evidence review.`],
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
  if (!id || !text) return null;

  return {
    kind: 'social_post',
    url: stringValue(record.permalink) ?? parsed.normalizedUrl,
    platform: 'instagram',
    name: `Instagram media ${id}`,
    note: [
      'Fetched from connected UploaderX Instagram account for Brand Vault draft review.',
      stringValue(record.media_type) ? `Media type: ${stringValue(record.media_type)}.` : '',
    ].filter(Boolean).join(' '),
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
  url.searchParams.set('fields', 'id,message,story,permalink_url,created_time,attachments{title,description,url}');
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
