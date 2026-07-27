import type {
  SfxCatalogEntry,
  SfxCatalogEventRole,
} from '../lib/pipeline/sfx-catalog';

export type SfxCatalogReviewMetadata = Pick<
  SfxCatalogEntry,
  | 'title'
  | 'eventRoles'
  | 'surfaces'
  | 'layerRole'
  | 'tags'
  | 'negativeTags'
  | 'energy'
  | 'brightness'
  | 'weight'
  | 'transientSharpness'
  | 'material'
  | 'tailMs'
  | 'loopable'
  | 'direction'
  | 'motionSpeed'
  | 'trendTag'
>;

export interface SfxCatalogReviewCollection {
  id: string;
  provider: string;
  licenseId: string;
  licenseUrl: string;
  attributionRequired: boolean;
  licenseEvidencePath: string;
}

export interface SfxCatalogReviewSourceEvidence {
  version: 'sfx-clap-review-source-v1';
  sourceCandidatePoolSha256: string;
  sourceReceiptSha256: string;
  analysisDigestSha256: string;
  model: {
    provider: string;
    packageVersion: string;
    modelId: string;
    revision: string;
    dtype: string;
    sampleRateHz: number;
    embeddingDimension: number;
    windowing: string;
  };
}

export interface SfxCatalogReviewEvidence {
  version: 'sfx-clap-review-candidate-v1';
  evidenceKind: 'ground-truth-role-plus-clap-screening';
  sourceId: string;
  sourceHashSha256: string;
  assignedRole: SfxCatalogEventRole;
  topRole: SfxCatalogEventRole;
  topRoleScore: number;
  assignedRoleScore: number;
  assignedRoleRank: number;
  roleAgreement: boolean;
  semanticRoles: Array<{
    role: SfxCatalogEventRole;
    cosineSimilarity: number;
  }>;
  nearestNeighbor?: {
    sourceId: string;
    cosineSimilarity: number;
  };
  cluster: {
    clusterId: string;
    duplicateCandidate: boolean;
    memberSourceIds: string[];
    representativeSourceId: string;
  };
  metadataBasis: 'role-prior-pending-human-approval';
}

export interface SfxCatalogReviewCandidate {
  collectionId: string;
  sourcePath: string;
  providerAssetId: string;
  metadata: SfxCatalogReviewMetadata;
  reviewEvidence?: SfxCatalogReviewEvidence;
}

export interface SfxCatalogReviewSeed {
  version: 'sfx-catalog-review-seed-v1';
  requiredRoles: SfxCatalogEventRole[];
  collections: SfxCatalogReviewCollection[];
  candidates: SfxCatalogReviewCandidate[];
  sourceEvidence?: SfxCatalogReviewSourceEvidence;
}

const interfaceBase: Pick<
  SfxCatalogReviewMetadata,
  'negativeTags' | 'loopable' | 'direction'
> = {
  negativeTags: ['game-like'],
  loopable: false,
  direction: 'neutral',
};

export const SFX_CATALOG_REVIEW_SEED: SfxCatalogReviewSeed = {
  version: 'sfx-catalog-review-seed-v1',
  requiredRoles: ['whoosh', 'impact', 'tick', 'pop', 'riser', 'logo-sting', 'shimmer'],
  collections: [
    {
      id: 'kenney-interface-sounds-1',
      provider: 'kenney',
      licenseId: 'cc0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
      licenseEvidencePath: 'interface/License.txt',
    },
    {
      id: 'kenney-impact-sounds-1',
      provider: 'kenney',
      licenseId: 'cc0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
      licenseEvidencePath: 'impact/License.txt',
    },
  ],
  candidates: [
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/click_001.ogg',
      providerAssetId: 'kenney-interface-click-001',
      metadata: {
        ...interfaceBase,
        title: 'Dry interface click',
        eventRoles: ['tick'],
        surfaces: ['ui', 'motion-graphic', 'caption'],
        layerRole: 'oneshot',
        tags: ['click', 'tick', 'dry', 'clean', 'interface'],
        energy: 0.24,
        brightness: 0.62,
        weight: 0.14,
        transientSharpness: 0.88,
        material: 'digital',
        tailMs: 20,
        motionSpeed: 'fast',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/click_003.ogg',
      providerAssetId: 'kenney-interface-click-003',
      metadata: {
        ...interfaceBase,
        title: 'Tight micro click',
        eventRoles: ['tick'],
        surfaces: ['ui', 'motion-graphic', 'caption'],
        layerRole: 'oneshot',
        tags: ['click', 'tick', 'micro', 'sharp', 'interface'],
        energy: 0.2,
        brightness: 0.72,
        weight: 0.08,
        transientSharpness: 0.96,
        material: 'digital',
        tailMs: 4,
        motionSpeed: 'fast',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/select_001.ogg',
      providerAssetId: 'kenney-interface-select-001',
      metadata: {
        ...interfaceBase,
        title: 'Clean selection tick',
        eventRoles: ['tick'],
        surfaces: ['ui', 'motion-graphic', 'caption'],
        layerRole: 'oneshot',
        tags: ['select', 'tick', 'clean', 'settle', 'interface'],
        energy: 0.3,
        brightness: 0.68,
        weight: 0.16,
        transientSharpness: 0.9,
        material: 'digital',
        tailMs: 12,
        motionSpeed: 'fast',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/tick_004.ogg',
      providerAssetId: 'kenney-interface-tick-004',
      metadata: {
        ...interfaceBase,
        title: 'Bright settle tick',
        eventRoles: ['tick'],
        surfaces: ['ui', 'motion-graphic', 'caption'],
        layerRole: 'oneshot',
        tags: ['tick', 'bright', 'count', 'settle', 'interface'],
        energy: 0.34,
        brightness: 0.78,
        weight: 0.13,
        transientSharpness: 0.92,
        material: 'digital',
        tailMs: 15,
        motionSpeed: 'fast',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/glitch_001.ogg',
      providerAssetId: 'kenney-interface-glitch-001',
      metadata: {
        ...interfaceBase,
        title: 'Digital glitch tick',
        eventRoles: ['tick'],
        surfaces: ['transition', 'motion-graphic', 'ui'],
        layerRole: 'oneshot',
        tags: ['glitch', 'digital', 'tick', 'tech', 'fast'],
        energy: 0.62,
        brightness: 0.76,
        weight: 0.2,
        transientSharpness: 0.98,
        material: 'digital',
        tailMs: 8,
        motionSpeed: 'fast',
        trendTag: 'digital-glitch',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/open_001.ogg',
      providerAssetId: 'kenney-interface-open-001',
      metadata: {
        ...interfaceBase,
        title: 'Soft interface pop',
        eventRoles: ['pop'],
        surfaces: ['motion-graphic', 'ui', 'caption'],
        layerRole: 'oneshot',
        tags: ['pop', 'open', 'entrance', 'soft', 'interface'],
        energy: 0.38,
        brightness: 0.58,
        weight: 0.25,
        transientSharpness: 0.7,
        material: 'digital',
        tailMs: 55,
        motionSpeed: 'medium',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/drop_003.ogg',
      providerAssetId: 'kenney-interface-drop-003',
      metadata: {
        ...interfaceBase,
        title: 'Rounded drop pop',
        eventRoles: ['pop'],
        surfaces: ['motion-graphic', 'ui', 'caption'],
        layerRole: 'oneshot',
        tags: ['pop', 'drop', 'rounded', 'settle', 'interface'],
        energy: 0.42,
        brightness: 0.45,
        weight: 0.36,
        transientSharpness: 0.68,
        material: 'digital',
        tailMs: 70,
        motionSpeed: 'medium',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/pluck_002.ogg',
      providerAssetId: 'kenney-interface-pluck-002',
      metadata: {
        ...interfaceBase,
        title: 'Light pluck shimmer',
        eventRoles: ['shimmer', 'pop'],
        surfaces: ['motion-graphic', 'logo', 'ui'],
        layerRole: 'oneshot',
        tags: ['pluck', 'shimmer', 'reveal', 'light', 'bright'],
        energy: 0.4,
        brightness: 0.82,
        weight: 0.14,
        transientSharpness: 0.72,
        material: 'tonal',
        tailMs: 75,
        motionSpeed: 'medium',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/glass_001.ogg',
      providerAssetId: 'kenney-interface-glass-001',
      metadata: {
        ...interfaceBase,
        title: 'Glass shimmer accent',
        eventRoles: ['shimmer'],
        surfaces: ['motion-graphic', 'logo', 'transition'],
        layerRole: 'oneshot',
        tags: ['glass', 'shimmer', 'sparkle', 'reveal', 'bright'],
        energy: 0.44,
        brightness: 0.9,
        weight: 0.12,
        transientSharpness: 0.76,
        material: 'glass',
        tailMs: 110,
        motionSpeed: 'medium',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/glass_003.ogg',
      providerAssetId: 'kenney-interface-glass-003',
      metadata: {
        ...interfaceBase,
        title: 'Short glass sparkle',
        eventRoles: ['shimmer'],
        surfaces: ['motion-graphic', 'logo', 'transition'],
        layerRole: 'oneshot',
        tags: ['glass', 'shimmer', 'sparkle', 'short', 'bright'],
        energy: 0.48,
        brightness: 0.92,
        weight: 0.1,
        transientSharpness: 0.84,
        material: 'glass',
        tailMs: 45,
        motionSpeed: 'fast',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/bong_001.ogg',
      providerAssetId: 'kenney-interface-bong-001',
      metadata: {
        ...interfaceBase,
        title: 'Compact logo bell',
        eventRoles: ['logo-sting'],
        surfaces: ['logo', 'chapter'],
        layerRole: 'sting',
        tags: ['logo', 'sting', 'bell', 'compact', 'resolve'],
        energy: 0.42,
        brightness: 0.64,
        weight: 0.3,
        transientSharpness: 0.66,
        material: 'bell',
        tailMs: 70,
        motionSpeed: 'medium',
      },
    },
    {
      collectionId: 'kenney-interface-sounds-1',
      sourcePath: 'interface/Audio/confirmation_002.ogg',
      providerAssetId: 'kenney-interface-confirmation-002',
      metadata: {
        ...interfaceBase,
        title: 'Confirmation logo sting',
        eventRoles: ['logo-sting'],
        surfaces: ['logo', 'chapter', 'ui'],
        layerRole: 'sting',
        tags: ['logo', 'sting', 'confirmation', 'resolve', 'tonal'],
        energy: 0.5,
        brightness: 0.7,
        weight: 0.28,
        transientSharpness: 0.58,
        material: 'tonal',
        tailMs: 220,
        motionSpeed: 'medium',
      },
    },
    {
      collectionId: 'kenney-impact-sounds-1',
      sourcePath: 'impact/Audio/impactGeneric_light_000.ogg',
      providerAssetId: 'kenney-impact-generic-light-000',
      metadata: {
        ...interfaceBase,
        title: 'Light generic impact',
        eventRoles: ['impact'],
        surfaces: ['transition', 'motion-graphic', 'caption'],
        layerRole: 'impact',
        tags: ['impact', 'light', 'clean', 'stat', 'accent'],
        energy: 0.48,
        brightness: 0.52,
        weight: 0.4,
        transientSharpness: 0.82,
        material: 'neutral',
        tailMs: 55,
        motionSpeed: 'fast',
      },
    },
    {
      collectionId: 'kenney-impact-sounds-1',
      sourcePath: 'impact/Audio/impactGeneric_light_003.ogg',
      providerAssetId: 'kenney-impact-generic-light-003',
      metadata: {
        ...interfaceBase,
        title: 'Tight generic impact',
        eventRoles: ['impact'],
        surfaces: ['transition', 'motion-graphic', 'caption'],
        layerRole: 'impact',
        tags: ['impact', 'tight', 'clean', 'stat', 'accent'],
        energy: 0.52,
        brightness: 0.48,
        weight: 0.44,
        transientSharpness: 0.86,
        material: 'neutral',
        tailMs: 48,
        motionSpeed: 'fast',
      },
    },
    {
      collectionId: 'kenney-impact-sounds-1',
      sourcePath: 'impact/Audio/impactSoft_medium_000.ogg',
      providerAssetId: 'kenney-impact-soft-medium-000',
      metadata: {
        ...interfaceBase,
        title: 'Soft stat impact',
        eventRoles: ['impact'],
        surfaces: ['motion-graphic', 'caption', 'transition'],
        layerRole: 'impact',
        tags: ['impact', 'soft', 'stat', 'settle', 'round'],
        energy: 0.58,
        brightness: 0.3,
        weight: 0.6,
        transientSharpness: 0.6,
        material: 'soft',
        tailMs: 45,
        motionSpeed: 'medium',
      },
    },
    {
      collectionId: 'kenney-impact-sounds-1',
      sourcePath: 'impact/Audio/impactPunch_medium_000.ogg',
      providerAssetId: 'kenney-impact-punch-medium-000',
      metadata: {
        ...interfaceBase,
        title: 'Punch transition impact',
        eventRoles: ['impact'],
        surfaces: ['transition', 'motion-graphic', 'chapter'],
        layerRole: 'impact',
        tags: ['impact', 'punch', 'transition', 'reveal', 'heavy'],
        energy: 0.78,
        brightness: 0.28,
        weight: 0.82,
        transientSharpness: 0.74,
        material: 'soft',
        tailMs: 190,
        motionSpeed: 'fast',
      },
    },
  ],
};
