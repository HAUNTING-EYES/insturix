import { clerkClient } from '@clerk/nextjs/server';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import {
  BRAND_VAULT_DEFAULT_APIFY_ACTORS,
  createBrandVaultConnectedSocialEvidence,
  type BrandVaultUploaderXTokenSnapshot,
} from './brand-vault-connected-social-ingestion';
import type { BrandVaultSocialConnectionEvidence } from './brand-website-refinery-types';
import type { BrandVaultSourceEvidenceProviderResult } from './brand-vault-refinery-api';

export async function loadBrandVaultConnectedSocialEvidence(
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
    apifyActors: {
      instagram: process.env.APIFY_INSTAGRAM_ACTOR_ID || BRAND_VAULT_DEFAULT_APIFY_ACTORS.instagram,
      facebook: process.env.APIFY_FACEBOOK_ACTOR_ID || BRAND_VAULT_DEFAULT_APIFY_ACTORS.facebook,
      linkedin: process.env.APIFY_LINKEDIN_ACTOR_ID || BRAND_VAULT_DEFAULT_APIFY_ACTORS.linkedin,
    },
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

async function loadYouTubeConnectionSnapshot(
  userId: string,
  warnings: string[],
): Promise<BrandVaultSocialConnectionEvidence | null> {
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
