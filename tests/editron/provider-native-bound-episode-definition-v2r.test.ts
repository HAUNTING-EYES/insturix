import { describe, expect, it } from 'vitest';

import {
  assertProviderNativeEpisodeDefinitionArtifactV2R,
  bindProviderNativeEpisodeDefinitionArtifactV2R,
  createProviderNativeBoundEpisodeDefinitionOwnerV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-bound-episode-definition-v2r';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { ProviderNativeEpisodeContextV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'bound-definition-episode-1',
  objective: 'Resume one exact research episode.',
  activeTarget: { taskId: 'BOUND-DEFINITION-1' },
  revisionBinding: {
    projectId: 'project-1',
    expectedProjectRevision: 'revision-1',
  },
  projectState: { projectId: 'project-1', projectRevision: 'revision-1' },
  evidence: [],
  preservationRules: ['Do not invent an episode definition.'],
  authorityAndPolicy: { mutation: 'RESEARCH_ISOLATED_ONLY' },
  budget: { maxTurns: 4, maxOutputTokensPerTurn: 256, maxIdenticalCalls: 1 },
};
const ELIGIBLE = ['find_audio_moment', 'sync_cuts_to_beats'] as const;

describe('provider-native bound episode definition V2R', () => {
  it('serializes and resolves one exact manifest-issued definition', async () => {
    const artifact = bindArtifact();
    expect(assertProviderNativeEpisodeDefinitionArtifactV2R(artifact)).toEqual(artifact);
    expect(artifact.artifactSha256).toMatch(/^[a-f0-9]{64}$/);

    const owner = createProviderNativeBoundEpisodeDefinitionOwnerV2R(
      JSON.parse(JSON.stringify(artifact)),
    );
    await expect(owner.resolve({
      tenantId: 'tenant-1',
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: CONTEXT.episodeId,
      expectedContextSha256: artifact.contextSha256,
      expectedToolSetSha256: artifact.toolSetSha256,
    })).resolves.toEqual({ context: CONTEXT, eligibleOperatorIds: ELIGIBLE });
  });

  it('rejects copied scope and stale durable bindings', async () => {
    const artifact = bindArtifact();
    const owner = createProviderNativeBoundEpisodeDefinitionOwnerV2R(artifact);
    const exact = {
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
      episodeId: CONTEXT.episodeId,
      expectedContextSha256: artifact.contextSha256,
      expectedToolSetSha256: artifact.toolSetSha256,
    };
    await expect(owner.resolve({ ...exact, tenantId: 'tenant-2' }))
      .rejects.toThrow('PROVIDER_NATIVE_BOUND_DEFINITION_SCOPE_MISMATCH');
    await expect(owner.resolve({ ...exact, projectId: 'project-2' }))
      .rejects.toThrow('PROVIDER_NATIVE_BOUND_DEFINITION_SCOPE_MISMATCH');
    await expect(owner.resolve({ ...exact, expectedContextSha256: '0'.repeat(64) }))
      .rejects.toThrow('PROVIDER_NATIVE_BOUND_DEFINITION_BINDING_MISMATCH');
    await expect(owner.resolve({ ...exact, expectedToolSetSha256: '1'.repeat(64) }))
      .rejects.toThrow('PROVIDER_NATIVE_BOUND_DEFINITION_BINDING_MISMATCH');
  });

  it('rejects altered and independently re-enveloped definitions', async () => {
    const artifact = JSON.parse(JSON.stringify(bindArtifact())) as JsonRecord;
    const definition = artifact.definition as JsonRecord;
    const context = definition.context as JsonRecord;
    context.objective = 'forged objective';
    expect(() => assertProviderNativeEpisodeDefinitionArtifactV2R(artifact))
      .toThrow('PROVIDER_NATIVE_BOUND_DEFINITION_ARTIFACT_INVALID');

    artifact.contextSha256 = hashCanonicalJsonV1(context);
    const material = { ...artifact };
    delete material.artifactSha256;
    artifact.artifactSha256 = hashCanonicalJsonV1(material);
    const forgedOwner = createProviderNativeBoundEpisodeDefinitionOwnerV2R(artifact);
    await expect(forgedOwner.resolve({
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
      episodeId: CONTEXT.episodeId,
      expectedContextSha256: hashCanonicalJsonV1(CONTEXT),
      expectedToolSetSha256: String(artifact.toolSetSha256),
    })).rejects.toThrow('PROVIDER_NATIVE_BOUND_DEFINITION_BINDING_MISMATCH');
  });

  it('rejects a definition whose context belongs to another project', () => {
    expect(() => bindArtifact({
      ...CONTEXT,
      projectState: { ...CONTEXT.projectState, projectId: 'project-2' },
    })).toThrow('PROVIDER_NATIVE_BOUND_DEFINITION_CONTEXT_SCOPE_MISMATCH');
  });
});

function bindArtifact(context: ProviderNativeEpisodeContextV2R = CONTEXT) {
  return bindProviderNativeEpisodeDefinitionArtifactV2R({
    tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
    source: {
      ownerVersion: 'EDITRON_TEST_MANIFEST_V1',
      ownerId: 'manifest-bound-definition-1',
      ownerSha256: 'a'.repeat(64),
    },
    context,
    eligibleOperatorIds: ELIGIBLE,
  });
}
