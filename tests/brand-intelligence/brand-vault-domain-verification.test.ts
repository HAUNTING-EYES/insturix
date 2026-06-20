import { describe, expect, it } from 'vitest';
import {
  createBrandVaultDomainVerificationInstruction,
  verifyBrandVaultDomainDnsRecord,
} from '../../lib/shared/brand-vault-domain-verification';

const SECRET = 'brand-vault-domain-verification-test-secret';
const USER_ID = 'user_domain_owner';

function instruction() {
  return createBrandVaultDomainVerificationInstruction({
    userId: USER_ID,
    websiteUrl: 'https://www.insturix.com/path?utm=test',
    secret: SECRET,
  });
}

describe('Brand Vault domain verification', () => {
  it('creates stable DNS TXT instructions for a user and root domain', () => {
    const first = instruction();
    const second = instruction();

    expect(first).toEqual(second);
    expect(first.host).toBe('insturix.com');
    expect(first.recordName).toBe('_insturix-brand-vault.insturix.com');
    expect(first.recordType).toBe('TXT');
    expect(first.recordValue).toBe(`insturix-brand-vault-verify=${first.token}`);
  });

  it('verifies split TXT records with constant expected value matching', async () => {
    const expected = instruction();
    const result = await verifyBrandVaultDomainDnsRecord({
      userId: USER_ID,
      websiteUrl: 'insturix.com',
      secret: SECRET,
      now: '2026-06-21T00:00:00.000Z',
      resolveTxtRecords: async (recordName) => {
        expect(recordName).toBe(expected.recordName);
        return [[expected.recordValue.slice(0, 20), expected.recordValue.slice(20)]];
      },
    });

    expect(result).toMatchObject({
      host: 'insturix.com',
      recordName: expected.recordName,
      status: 'verified',
      verified: true,
      checkedAt: '2026-06-21T00:00:00.000Z',
      observedRecordValues: [expected.recordValue],
    });
  });

  it('returns pending when DNS is present but the expected token is absent', async () => {
    const result = await verifyBrandVaultDomainDnsRecord({
      userId: USER_ID,
      websiteUrl: 'https://insturix.com',
      secret: SECRET,
      resolveTxtRecords: async () => [['insturix-brand-vault-verify=wrong-token']],
    });

    expect(result.status).toBe('pending');
    expect(result.verified).toBe(false);
    expect(result.observedRecordValues).toEqual(['insturix-brand-vault-verify=wrong-token']);
  });

  it('fails closed when the shared secret is missing or too short', () => {
    expect(() =>
      createBrandVaultDomainVerificationInstruction({
        userId: USER_ID,
        websiteUrl: 'insturix.com',
        secret: 'short',
      }),
    ).toThrow(/BRAND_VAULT_DOMAIN_VERIFICATION_SECRET/);
  });
});