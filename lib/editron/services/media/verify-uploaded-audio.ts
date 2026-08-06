import { fileTypeFromBuffer } from 'file-type';

const PREFIX_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_DECODE_BYTES = 128 * 1024 * 1024;

export type UploadedAudioVerification =
  | { verified: true; mime: string; extension: string; bytesChecked: number }
  | { verified: false; reason: 'fetch-failed' | 'not-audio' | 'empty'; bytesChecked: number };

export interface VerifyUploadedAudioDependencies {
  fetchImpl?: typeof fetch;
}

export async function verifyUploadedAudioPrefix(
  url: string,
  dependencies: VerifyUploadedAudioDependencies = {},
): Promise<UploadedAudioVerification> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let buffer: Buffer;
  try {
    const response = await fetchImpl(url, {
      headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 206) {
      return { verified: false, reason: 'fetch-failed', bytesChecked: 0 };
    }
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    return { verified: false, reason: 'fetch-failed', bytesChecked: 0 };
  }
  if (buffer.length === 0) {
    return { verified: false, reason: 'empty', bytesChecked: 0 };
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !detected.mime.toLowerCase().startsWith('audio/')) {
    return { verified: false, reason: 'not-audio', bytesChecked: buffer.length };
  }
  return {
    verified: true,
    mime: detected.mime.toLowerCase(),
    extension: detected.ext.toLowerCase(),
    bytesChecked: buffer.length,
  };
}

export async function fetchUploadedAudioBytes(
  url: string,
  dependencies: VerifyUploadedAudioDependencies = {},
): Promise<Buffer> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Audio fetch failed with HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_DECODE_BYTES) {
    throw new Error(`Audio exceeds the ${MAX_DECODE_BYTES} byte verification limit`);
  }
  return buffer;
}
