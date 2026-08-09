/**
 * Owner adapter for IF1 project revision references.
 *
 * It does not persist, compare, advance, issue, or decode revisions.
 * ProjectService remains the sole issuer/decoder; this adapter only delegates
 * its opaque carrier boundary for a migrated owner path.
 */

import type {
  ProjectMutationReceiptV1,
  ProjectRevisionV1,
} from '@/lib/editron/services/project-service';

import type { ProjectRevisionRefV1 } from './contracts-v1';

/**
 * This port is implemented only by ProjectService when a runtime path is
 * migrated. It makes revision representation owner-local while giving IF1
 * consumers an opaque value.
 */
export interface ProjectServiceIF1RevisionOwnerV1 {
  issueProjectRevisionRefV1(nativeRevision: ProjectRevisionV1): ProjectRevisionRefV1;
  decodeProjectRevisionRefV1(reference: ProjectRevisionRefV1): ProjectRevisionV1;
}

/** The only IF1 bridge allowed to expose a ProjectService receipt to contracts. */
export function createProjectServiceIf1RevisionAdapterV1(
  owner: ProjectServiceIF1RevisionOwnerV1,
) {
  return Object.freeze({
    referenceFromReceipt(receipt: ProjectMutationReceiptV1): ProjectRevisionRefV1 {
      return owner.issueProjectRevisionRefV1(receipt.revision);
    },

    /** Owner-only decode for a ProjectService CAS or restore call. */
    nativeRevisionForProjectService(reference: ProjectRevisionRefV1): ProjectRevisionV1 {
      return owner.decodeProjectRevisionRefV1(reference);
    },
  });
}
