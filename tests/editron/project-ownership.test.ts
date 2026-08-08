import { describe, it, expect } from 'vitest';
import { parseOrgWalletFlag } from '@/lib/services/org-wallet-flag';
import {
  resolveCreationVisibility,
  resolveProjectBillingOwnerType,
  resolveBillingOwner,
} from '@/lib/editron/services/project-ownership';

describe('parseOrgWalletFlag (plan D7 — default off, case-sensitive)', () => {
  it('accepts only "true"/"1"', () => {
    expect(parseOrgWalletFlag('true')).toBe(true);
    expect(parseOrgWalletFlag('1')).toBe(true);
  });
  it('tolerates surrounding whitespace/newlines (deploy env values often carry a trailing \\n)', () => {
    expect(parseOrgWalletFlag(' true ')).toBe(true);
    expect(parseOrgWalletFlag('true\n')).toBe(true);
    expect(parseOrgWalletFlag('1\n')).toBe(true);
  });
  it('rejects everything else, including case variants and undefined', () => {
    expect(parseOrgWalletFlag('false')).toBe(false);
    expect(parseOrgWalletFlag('TRUE')).toBe(false);
    expect(parseOrgWalletFlag('0')).toBe(false);
    expect(parseOrgWalletFlag('')).toBe(false);
    expect(parseOrgWalletFlag(undefined)).toBe(false);
  });
});

describe('resolveCreationVisibility (P0/D9 — explicit ownership at creation)', () => {
  it('flag OFF => always private, even in an org context (today\'s behavior exactly)', () => {
    expect(resolveCreationVisibility('org_123', false)).toBe('private');
    expect(resolveCreationVisibility(null, false)).toBe('private');
    expect(resolveCreationVisibility(undefined, false)).toBe('private');
  });
  it('flag ON => org iff an explicit org context is present, else private', () => {
    expect(resolveCreationVisibility('org_123', true)).toBe('org');
    expect(resolveCreationVisibility(null, true)).toBe('private');
    expect(resolveCreationVisibility(undefined, true)).toBe('private');
    // an empty-string orgId is NOT an org context
    expect(resolveCreationVisibility('', true)).toBe('private');
  });
});

describe('resolveProjectBillingOwnerType (P0/D9 — the single billing predicate)', () => {
  it('org iff orgId AND visibility==="org" (mirrors canAccessProject:89)', () => {
    expect(resolveProjectBillingOwnerType({ orgId: 'org_1', visibility: 'org' })).toBe('org');
  });

  it('GRANDFATHERED ambiguous shape (orgId set, visibility!=="org") bills PERSONAL — the 5th critical test', () => {
    expect(
      resolveProjectBillingOwnerType({ projectId: 'p1', orgId: 'org_1', visibility: 'private' }),
    ).toBe('personal');
    expect(
      resolveProjectBillingOwnerType({ projectId: 'p2', orgId: 'org_1', visibility: 'shared' }),
    ).toBe('personal');
  });

  it('no org context => personal', () => {
    expect(resolveProjectBillingOwnerType({ visibility: 'private' })).toBe('personal');
    expect(resolveProjectBillingOwnerType({ orgId: null, visibility: 'org' })).toBe('personal');
    expect(resolveProjectBillingOwnerType({})).toBe('personal');
  });
});

describe('resolveBillingOwner (P2 — the single wallet-routing authority)', () => {
  const orgProject = { projectId: 'p1', orgId: 'org_1', visibility: 'org' };

  it('flag OFF => personal wallet even for an org-owned project (today\'s behavior exactly)', () => {
    expect(resolveBillingOwner('user_9', orgProject, false)).toEqual({
      type: 'user',
      clerkUserId: 'user_9',
    });
  });

  it('flag ON + org-owned project => org wallet, carrying the actor', () => {
    expect(resolveBillingOwner('user_9', orgProject, true)).toEqual({
      type: 'org',
      clerkOrgId: 'org_1',
      actorUserId: 'user_9',
    });
  });

  it('flag ON + GRANDFATHERED ambiguous shape (orgId set, visibility!=="org") => personal', () => {
    expect(resolveBillingOwner('user_9', { projectId: 'p2', orgId: 'org_1', visibility: 'private' }, true)).toEqual({
      type: 'user',
      clerkUserId: 'user_9',
    });
  });

  it('flag ON + personal project or no project => personal', () => {
    expect(resolveBillingOwner('user_9', { visibility: 'private' }, true)).toEqual({
      type: 'user',
      clerkUserId: 'user_9',
    });
    expect(resolveBillingOwner('user_9', null, true)).toEqual({ type: 'user', clerkUserId: 'user_9' });
    expect(resolveBillingOwner('user_9', undefined, true)).toEqual({ type: 'user', clerkUserId: 'user_9' });
  });
});
