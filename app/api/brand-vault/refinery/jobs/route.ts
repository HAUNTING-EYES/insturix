import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { parseBrandVaultSocialUrl } from '@/lib/shared/brand-vault-social-evidence';
import {
  createBrandVaultRefineryJobFromWebsite,
  getBrandVaultRefineryJob,
  getDefaultBrandVaultRefineryStore,
  type BrandVaultSourceEvidenceProviderResult,
} from '@/lib/shared/brand-vault-refinery-api';
import type {
  BrandVaultSocialConnectionEvidence,
  BrandVaultSourceInput,
  BrandVaultSourcePlatform,
} from '@/lib/shared/brand-website-refinery-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_json', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const result = await createBrandVaultRefineryJobFromWebsite(
    { userId, actorId: userId, body },
    {
      store: getDefaultBrandVaultRefineryStore(),
      sourceEvidenceProvider: ({ socialLinks }) => loadConnectedSocialEvidence(userId, socialLinks),
    },
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  const result = await getBrandVaultRefineryJob(
    { userId, jobId },
    { store: getDefaultBrandVaultRefineryStore() },
  );
  return NextResponse.json(result.body, { status: result.status });
}

async function loadConnectedSocialEvidence(
  userId: string,
  socialLinks: string[],
): Promise<BrandVaultSourceEvidenceProviderResult> {
  if (socialLinks.length === 0) return { sourceEvidence: [] };

  const warnings: string[] = [];
  const sources: BrandVaultSourceInput[] = [];
  const user = await loadUploaderXTokenSnapshot(userId, warnings);
  const youtubeConnection = await loadYouTubeConnectionSnapshot(userId, warnings);

  for (const link of socialLinks) {
    const parsed = parseBrandVaultSocialUrl(link);
    if (!parsed) continue;
    const connection = connectedEvidenceForPlatform(parsed.platform, parsed.handle, user, youtubeConnection);
    const fallback = connection ?? publicFallbackEvidenceForPlatform(parsed.platform);
    if (!fallback) continue;
    sources.push({
      kind: 'social_profile',
      url: parsed.normalizedUrl,
      platform: parsed.platform,
      name: fallback.accountName ?? fallback.accountHandle ?? parsed.handle ?? parsed.platform,
      note: connectionNote(parsed.platform, fallback),
      connection: fallback,
    });
  }

  if (sources.length > 0) {
    warnings.push(`Brand Vault added ${sources.length} connected social capability source${sources.length === 1 ? '' : 's'} from existing platform integrations.`);
  }
  return { sourceEvidence: sources, warnings };
}

async function loadUploaderXTokenSnapshot(userId: string, warnings: string[]): Promise<Record<string, any> | null> {
  try {
    await connectToDatabase();
    const { User } = await import('@/schemas/user');
    return await User.findOne(
      { clerkUserId: userId },
      {
        twitterTokens: 1,
        linkedinTokens: 1,
        instagramTokens: 1,
        facebookTokens: 1,
      },
    ).lean();
  } catch (error) {
    warnings.push(`Brand Vault could not read UploaderX connection metadata: ${errorMessage(error)}`);
    return null;
  }
}

async function loadYouTubeConnectionSnapshot(userId: string, warnings: string[]): Promise<BrandVaultSocialConnectionEvidence | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const googleAccount = user.externalAccounts.find((account) => account.provider.includes('google'));
    if (!googleAccount) return null;
    return {
      provider: 'clerk_external_account',
      status: 'connected',
      accountId: googleAccount.id,
      accountName: googleAccount.username || undefined,
      accountHandle: googleAccount.username || undefined,
      scopes: scopeList(googleAccount.approvedScopes),
      canReadProfile: true,
      canReadPosts: false,
      canReadPinned: false,
      matchStatus: 'unverified',
    };
  } catch (error) {
    warnings.push(`Brand Vault could not read YouTube connection metadata: ${errorMessage(error)}`);
    return null;
  }
}

function connectedEvidenceForPlatform(
  platform: BrandVaultSourcePlatform,
  handle: string | undefined,
  user: Record<string, any> | null,
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

function twitterConnection(handle: string | undefined, tokens: any): BrandVaultSocialConnectionEvidence | null {
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

function linkedinConnection(handle: string | undefined, tokens: any): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.accessToken) return null;
  const organizationHandles = (tokens.organizations ?? []).flatMap((org: any) => [org.vanityName, org.name, org.id]);
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

function instagramConnection(handle: string | undefined, tokens: any): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.userAccessToken) return null;
  const accountHandles = [tokens.userName, ...(tokens.accounts ?? []).map((account: any) => account.instagramUsername)];
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

function facebookConnection(handle: string | undefined, tokens: any): BrandVaultSocialConnectionEvidence | null {
  if (!tokens?.userAccessToken) return null;
  const pageHandles = (tokens.pages ?? []).flatMap((page: any) => [page.pageName, page.pageId]);
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

function publicFallbackEvidenceForPlatform(platform: BrandVaultSourcePlatform): BrandVaultSocialConnectionEvidence | null {
  if (!process.env.APIFY_API_KEY?.trim()) return null;
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

function scopeList(value: unknown): string[] {
  if (Array.isArray(value)) return stringList(value);
  if (typeof value === 'string') return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
  return [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
