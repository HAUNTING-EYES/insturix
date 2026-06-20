import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { normalizeBrandWebsiteUrl } from './brand-website-refinery-utils';

const DEFAULT_RECORD_PREFIX = '_insturix-brand-vault';
const RECORD_VALUE_PREFIX = 'insturix-brand-vault-verify=';
const TOKEN_BYTES = 24;

export type BrandVaultDomainVerificationStatus = 'pending' | 'verified' | 'error';

export interface BrandVaultDomainVerificationInstruction {
  host: string;
  recordName: string;
  recordType: 'TXT';
  recordValue: string;
  token: string;
}

export interface BrandVaultDomainVerificationResult extends BrandVaultDomainVerificationInstruction {
  status: BrandVaultDomainVerificationStatus;
  verified: boolean;
  checkedAt: string;
  observedRecordValues: string[];
  error?: string;
}

export interface BrandVaultDomainVerificationOptions {
  userId: string;
  websiteUrl: string;
  secret?: string;
  now?: string;
  resolveTxtRecords?: (recordName: string) => Promise<string[][]>;
}

export function createBrandVaultDomainVerificationInstruction(
  options: Omit<BrandVaultDomainVerificationOptions, 'resolveTxtRecords' | 'now'>,
): BrandVaultDomainVerificationInstruction {
  const host = normalizeDomainVerificationHost(options.websiteUrl);
  const token = createDomainVerificationToken({ userId: options.userId, host, secret: options.secret });
  return {
    host,
    recordName: `${DEFAULT_RECORD_PREFIX}.${host}`,
    recordType: 'TXT',
    recordValue: `${RECORD_VALUE_PREFIX}${token}`,
    token,
  };
}

export async function verifyBrandVaultDomainDnsRecord(
  options: BrandVaultDomainVerificationOptions,
): Promise<BrandVaultDomainVerificationResult> {
  const instruction = createBrandVaultDomainVerificationInstruction(options);
  const checkedAt = options.now ?? new Date().toISOString();
  const resolveRecords = options.resolveTxtRecords ?? resolveTxt;

  try {
    const records = await resolveRecords(instruction.recordName);
    const observedRecordValues = flattenTxtRecords(records);
    const verified = observedRecordValues.some((value) => constantTimeEquals(value, instruction.recordValue));
    return {
      ...instruction,
      status: verified ? 'verified' : 'pending',
      verified,
      checkedAt,
      observedRecordValues,
    };
  } catch (error) {
    return {
      ...instruction,
      status: 'error',
      verified: false,
      checkedAt,
      observedRecordValues: [],
      error: error instanceof Error ? error.message : 'DNS TXT lookup failed.',
    };
  }
}

function normalizeDomainVerificationHost(websiteUrl: string): string {
  const normalized = normalizeBrandWebsiteUrl(websiteUrl);
  const host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) {
    throw new Error('Brand Vault domain verification requires a public root domain.');
  }
  return host;
}

function createDomainVerificationToken(args: { userId: string; host: string; secret?: string }): string {
  const secret = args.secret ?? process.env.BRAND_VAULT_DOMAIN_VERIFICATION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error('BRAND_VAULT_DOMAIN_VERIFICATION_SECRET must be set to at least 24 characters.');
  }
  return createHmac('sha256', secret)
    .update(`${args.userId}:${args.host}`)
    .digest('base64url')
    .slice(0, TOKEN_BYTES * 2);
}

function flattenTxtRecords(records: string[][]): string[] {
  return records
    .map((chunks) => chunks.join('').trim())
    .filter(Boolean);
}

function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}