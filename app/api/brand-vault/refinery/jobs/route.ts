import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import {
  createBrandVaultConnectedSocialEvidence,
  type BrandVaultUploaderXTokenSnapshot,
} from '@/lib/shared/brand-vault-connected-social-ingestion';
import {
  createBrandVaultRefineryJobFromWebsite,
  getBrandVaultRefineryJob,
  getDefaultBrandVaultRefineryStore,
  type BrandVaultSourceEvidenceProviderResult,
} from '@/lib/shared/brand-vault-refinery-api';
import type { BrandVaultSocialConnectionEvidence } from '@/lib/shared/brand-website-refinery-types';

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
  const user = await loadUploaderXTokenSnapshot(userId, warnings);
  const youtubeConnection = await loadYouTubeConnectionSnapshot(userId, warnings);
  const connectedEvidence = await createBrandVaultConnectedSocialEvidence({
    socialLinks,
    uploaderXUser: user,
    youtubeConnection,
    apifyApiKey: process.env.APIFY_API_KEY,
  });

  return {
    sourceEvidence: connectedEvidence.sourceEvidence,
    warnings: [...warnings, ...connectedEvidence.warnings],
  };
}

async function loadUploaderXTokenSnapshot(
  userId: string,
  warnings: string[],
): Promise<BrandVaultUploaderXTokenSnapshot | null> {
  try {
    await connectToDatabase();
    const { User } = await import('@/schemas/user');
    const user = await User.findOne(
      { clerkUserId: userId },
      {
        twitterTokens: 1,
        linkedinTokens: 1,
        instagramTokens: 1,
        facebookTokens: 1,
      },
    ).lean();
    return user as BrandVaultUploaderXTokenSnapshot | null;
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

function scopeList(value: unknown): string[] {
  if (Array.isArray(value)) return stringList(value);
  if (typeof value === 'string') return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
  return [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
