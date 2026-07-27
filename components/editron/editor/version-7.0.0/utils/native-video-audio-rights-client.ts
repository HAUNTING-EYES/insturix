import type { Overlay } from '../types';
import {
  CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
  readNativeVideoAudioRightsClaim,
} from '@/lib/editron/services/native-video-audio-rights';

type UnknownRecord = Record<string, unknown>;

export class NativeVideoAudioRightsClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NativeVideoAudioRightsClientError';
  }
}

export function findUnverifiedNativeAudioAssetIds(
  overlays: Overlay[],
): string[] {
  const assetIds = new Set<string>();

  for (const overlay of overlays) {
    const record = overlay as unknown as UnknownRecord;
    if (
      record.type !== 'video'
      || record.hasNativeAudio !== true
      || readNativeVideoAudioRightsClaim(record)
    ) {
      continue;
    }
    const assetId = nonEmptyString(record.assetId);
    assetIds.add(assetId ?? `missing-asset:${String(record.id ?? 'unknown')}`);
  }

  return Array.from(assetIds);
}

export async function confirmAndReloadNativeVideoAudioRights(input: {
  projectId: string;
  fetchImpl?: typeof fetch;
}): Promise<Overlay[]> {
  const projectId = nonEmptyString(input.projectId);
  if (!projectId) {
    throw new NativeVideoAudioRightsClientError(
      'INVALID_PROJECT_ID',
      'Open a saved project before confirming source-media rights.',
    );
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const projectPath = `/api/services/editron/projects/${encodeURIComponent(projectId)}`;
  const attestationResponse = await fetchImpl(
    `${projectPath}/native-video-audio-rights`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
      }),
    },
  );
  const attestationBody = await readJsonObject(attestationResponse);
  if (!attestationResponse.ok || attestationBody?.success !== true) {
    throw new NativeVideoAudioRightsClientError(
      nonEmptyString(attestationBody?.code) ?? 'ATTESTATION_FAILED',
      nonEmptyString(attestationBody?.error)
        ?? 'Source-media rights could not be confirmed.',
    );
  }

  const projectResponse = await fetchImpl(projectPath, { cache: 'no-store' });
  const projectBody = await readJsonObject(projectResponse);
  const project = asRecord(projectBody?.project);
  if (!projectResponse.ok || !Array.isArray(project?.overlays)) {
    throw new NativeVideoAudioRightsClientError(
      'ATTESTATION_RELOAD_FAILED',
      'Rights were stored, but the canonical project could not be reloaded.',
    );
  }
  const overlays = project.overlays as Overlay[];
  if (findUnverifiedNativeAudioAssetIds(overlays).length > 0) {
    throw new NativeVideoAudioRightsClientError(
      'ATTESTATION_RELOAD_UNVERIFIED',
      'The project still contains native audio without verified source-media rights.',
    );
  }
  return overlays;
}

async function readJsonObject(response: Response): Promise<UnknownRecord | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
