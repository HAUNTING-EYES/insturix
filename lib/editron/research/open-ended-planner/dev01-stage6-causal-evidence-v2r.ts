import type { TranscriptSearchWord } from '@/lib/editron/agent/chat-transcript-tools';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { Dev01NativeProxyFixtureV2 } from './dev01-native-proxy-fixture-v2';
import type { Dev01Stage6ProjectSnapshotV2 } from './dev01-stage6-native-proxy-contract-v2';

const SOURCE_FIXTURE_SHA256 =
  '90635497775dcd0fa8dba3dd603934c42202c46cc1da82ba8563d27161d8dd92';

const CAUSAL_EVIDENCE_V2R = deepFreezeV1({
  version: 'EDITRON_OE_DEV01_CAUSAL_EXECUTION_EVIDENCE_V2R_1',
  sourceFixtureSha256: SOURCE_FIXTURE_SHA256,
  transcriptWords: [
    transcriptWord('here', 120, 130), transcriptWord('it', 130, 140),
    transcriptWord('is', 140, 151), transcriptWord('next', 196, 210),
  ],
  visual: {
    label: 'product box reveal', startFrame: 205, endFrame: 221,
    boundingBox: { x: 0.62, y: 0.24, width: 0.25, height: 0.52 },
  },
});

export function dev01Stage6CausalEvidenceV2R(
  fixture: Readonly<Dev01NativeProxyFixtureV2>,
): typeof CAUSAL_EVIDENCE_V2R {
  assertDev01Stage6CausalEvidenceBindingV2R(fixture);
  return CAUSAL_EVIDENCE_V2R;
}

export function assertDev01Stage6CausalEvidenceBindingV2R(
  fixture: Readonly<Dev01NativeProxyFixtureV2>,
): void {
  if (hashCanonicalJsonV1(fixture) !== SOURCE_FIXTURE_SHA256) {
    throw new Error('DEV01_STAGE6_CAUSAL_EVIDENCE_FIXTURE_DRIFT');
  }
}

export function withDev01Stage6CausalVisualEvidenceV2R(
  project: Dev01Stage6ProjectSnapshotV2,
  fixture: Readonly<Dev01NativeProxyFixtureV2>,
): Dev01Stage6ProjectSnapshotV2 {
  const evidence = dev01Stage6CausalEvidenceV2R(fixture);
  const overlays = records(project.overlays).map((overlay) => overlay.id === 101 ? {
    ...overlay,
    metadata: {
      ...record(overlay.metadata),
      visualAnalysis: { objects: [evidence.visual] },
    },
  } : overlay);
  return structuredClone({ ...project, overlays });
}

function transcriptWord(word: string, startFrame: number, endFrame: number): TranscriptSearchWord {
  return {
    word, startFrame, endFrame,
    startMs: startFrame / 30 * 1000,
    endMs: endFrame / 30 * 1000,
    confidence: 1,
    source: {
      type: 'video-transcription', overlayId: 101,
      assetId: 'dev01-host-truth-v2', overlayType: 'video',
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : [];
}
