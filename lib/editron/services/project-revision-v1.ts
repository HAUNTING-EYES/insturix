/**
 * Dependency-free project revision primitives shared by authorized mutation
 * owners. Storage and route modules may import this file without initializing
 * MongoDB or the full ProjectService dependency graph.
 */
export interface ProjectRevisionV1 {
  schemaVersion: 1;
  value: number;
  /**
   * Temporary compatibility guard for writers that still advance `updatedAt`
   * without advancing `projectRevision`.
   */
  compatibilityUpdatedAt: string;
}

export interface ProjectRevisionDocumentV1 {
  projectRevision?: unknown;
  updatedAt?: unknown;
}

export function readProjectRevisionV1(
  project: ProjectRevisionDocumentV1,
): ProjectRevisionV1 | null {
  const updatedAt = project.updatedAt instanceof Date
    ? project.updatedAt
    : new Date(project.updatedAt as string | number);
  if (Number.isNaN(updatedAt.getTime())) return null;

  const value = project.projectRevision;
  return {
    schemaVersion: 1,
    value: typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : 0,
    compatibilityUpdatedAt: updatedAt.toISOString(),
  };
}

export function projectRevisionPredicate(
  expectedRevision: ProjectRevisionV1,
): Record<string, unknown> {
  const revisionCounterPredicate = expectedRevision.value === 0
    ? {
        $or: [
          { projectRevision: 0 },
          { projectRevision: { $exists: false } },
        ],
      }
    : { projectRevision: expectedRevision.value };

  return {
    ...revisionCounterPredicate,
    updatedAt: new Date(expectedRevision.compatibilityUpdatedAt),
  };
}
