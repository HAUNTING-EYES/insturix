/**
 * Org Wallet Billing feature flag — the SINGLE source of truth (plan D7).
 *
 * ORG_WALLET_BILLING — server-only deploy variable. Default OFF. When 'true'/'1':
 *   - P0: a project created while the user is in an org context (the OrgSwitcher's
 *     Clerk setActive, surfaced as orgId at creation) is stamped visibility:'org',
 *     i.e. org-OWNED, instead of the legacy hardcoded 'private'.
 *   - P2: org-owned projects bill the org wallet instead of the member's personal one.
 * OFF reproduces today's behavior EXACTLY (every project personal-billed), so this is a
 * deliberate, comms-backed flip — never a surprise (plan D7).
 *
 * Pure leaf: no db/server imports, so it can be imported anywhere (mirrors
 * lib/editron/services/assist-lane-flag.ts). The parsing rule lives here ONCE so no
 * copy can drift.
 */

/**
 * The one accepted-values rule. Case-sensitive by design ('TRUE' is not 'true') but tolerant of
 * surrounding whitespace/newlines — deploy platforms (Vercel env, .env files) routinely store a
 * trailing '\n', which strict equality would silently read as OFF.
 */
export function parseOrgWalletFlag(value: string | undefined): boolean {
  const v = value?.trim();
  return v === 'true' || v === '1';
}

/** Server gate: is org-wallet billing active on this deploy? Default false. */
export function isOrgWalletBillingEnabled(): boolean {
  return parseOrgWalletFlag(process.env.ORG_WALLET_BILLING);
}
