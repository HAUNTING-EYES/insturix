/**
 * Project ownership rules (P0/D9) — pure leaf, no db/server imports so it can be
 * imported and unit-tested without a MONGODB_URI. project-service.ts uses it at
 * creation; P2's resolveBillingOwner reuses resolveProjectBillingOwnerType.
 */

/**
 * The SINGLE creation rule. A project is org-OWNED only when the user is explicitly in
 * an org context (orgId present, from the OrgSwitcher's Clerk setActive) AND org-wallet
 * billing is enabled. Ambient org context alone never implies org billing. Flag off =>
 * always 'private' (today's behavior exactly).
 */
export function resolveCreationVisibility(
  orgId: string | null | undefined,
  orgWalletEnabled: boolean,
): 'private' | 'org' {
  return orgWalletEnabled && orgId ? 'org' : 'private';
}

/**
 * The SINGLE billing-ownership predicate. Mirrors canAccessProject's
 * `orgId && visibility==='org'` gate so access-owner and billing-owner never diverge.
 * A row with orgId set but visibility!=='org' is a GRANDFATHERED ambiguous row (created
 * under the old ambient-orgId + hardcoded-'private' bug); it bills PERSONAL and is logged
 * once so these rows stay visible. P2's resolveBillingOwner reuses this.
 */
export function resolveProjectBillingOwnerType(project: {
  projectId?: string;
  orgId?: string | null;
  visibility?: string;
}): 'org' | 'personal' {
  if (project.orgId && project.visibility === 'org') return 'org';
  if (project.orgId) {
    console.log(
      `[ProjectService] grandfathered-ambiguous-ownership project=${project.projectId ?? 'unknown'} ` +
        `orgId=${project.orgId} visibility=${project.visibility ?? 'unset'} -> billed PERSONAL`,
    );
  }
  return 'personal';
}
