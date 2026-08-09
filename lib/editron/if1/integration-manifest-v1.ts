import type { IntegrationManifestV1 } from './contracts-v1';

/** Integration Owner candidate manifest. It is not a tag or runtime registry. */
export const EDITRON_IF1_INTEGRATION_MANIFEST_V1: IntegrationManifestV1 = Object.freeze({
  schemaVersion: 1,
  artifactId: 'editron-if1-freeze-v1-candidate',
  baseSha: '7e9b4dd7ff60beeef2b6dfff4038ca367164cb65',
  contractVersion: 'if1-v1',
  ownedFiles: [
    'lib/editron/if1/contracts-v1.ts',
    'lib/editron/if1/project-service-adapter-v1.ts',
    'lib/editron/if1/integration-manifest-v1.ts',
    'tests/editron/if1-freeze-v1.test.ts',
    'docs/editron/if1-freeze-v1.md',
  ],
  ownerBoundaryPorts: ['ProjectServiceIF1RevisionIssuerV1'],
  externalBoundary: 'ExternalReferenceV1',
  prohibitedRuntimeAuthorities: [
    'MutationGateV0',
    'projects.mutationSpineV0',
    'editron_project_mutation_operations',
    'Session A private checkpoint store',
    'Session A private Mongo project writer',
    'CapabilityRegistryEntryV1 / second runtime registry',
    'ExecutionGraphV1 runtime authority',
    'detailed media, brand, evidence, and coverage schemas',
  ],
  unmigratedProjectWriters: [
    'Director lock metadata',
    'chat render-proof metadata',
    'MG child paths',
  ],
  migrationStatus: 'contract-freeze-candidate',
  rollback: { kind: 'git-revert' as const, target: 'artifact-commit' as const },
});
