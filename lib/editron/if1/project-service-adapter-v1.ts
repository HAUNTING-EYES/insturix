/**
 * IF1 projection boundary for ProjectService-issued revision references.
 *
 * It does not persist, compare, advance, issue, or decode revisions.
 * ProjectService remains the only native revision codec and the only owner
 * permitted to expose a receipt as an opaque IF1 ProjectRevisionRefV1.
 */

import type { ProjectMutationReceiptV1 } from '@/lib/editron/services/project-service';

import type { ProjectRevisionRefV1 } from './contracts-v1';

/** Implemented by ProjectService only when an owner path is migrated. */
export interface ProjectServiceIF1RevisionIssuerV1 {
  issueProjectRevisionRefV1(receipt: ProjectMutationReceiptV1): ProjectRevisionRefV1;
}

/**
 * Projects a ProjectService receipt into IF1. There is intentionally no public
 * reverse operation: consumers cannot decode the carrier into raw revisions.
 */
export function projectRevisionRefFromProjectServiceReceiptV1(
  issuer: ProjectServiceIF1RevisionIssuerV1,
  receipt: ProjectMutationReceiptV1,
): ProjectRevisionRefV1 {
  return issuer.issueProjectRevisionRefV1(receipt);
}
