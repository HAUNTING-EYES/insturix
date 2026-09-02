import type {
  ProjectMutationReceiptV1,
  ProjectRevisionV1,
} from "@/lib/editron/services/project-service";

/**
 * Validates the receipts captured while one Director action runs and returns
 * the exact writer-issued revision for the next Director mutation. It has no
 * persistence authority: ProjectService remains the sole writer.
 */
export function advanceDirectorRevisionFromReceiptsV1(input: {
  projectId: string;
  currentRevision: ProjectRevisionV1;
  receipts: readonly ProjectMutationReceiptV1[];
}): ProjectRevisionV1 {
  let revision = input.currentRevision;

  for (const receipt of input.receipts) {
    const expectedValue = revision.value + 1;
    if (
      receipt.schemaVersion !== 1
      || receipt.projectId !== input.projectId
      || receipt.revision.schemaVersion !== 1
      || receipt.revision.value !== expectedValue
      || receipt.revision.compatibilityUpdatedAt !== receipt.committedAt
      || Number.isNaN(new Date(receipt.revision.compatibilityUpdatedAt).getTime())
    ) {
      throw new Error(
        "Director action receipts must be one contiguous writer-issued revision chain for this project.",
      );
    }
    revision = receipt.revision;
  }

  return revision;
}
