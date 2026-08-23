import { waitForGeminiFileActive } from './gemini-file-active';

const MAX_GEMINI_REFERENCE_BYTES = 2 * 1024 * 1024 * 1024;
const GEMINI_FILES_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const SUPPORTED_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp',
]);

export class ReferenceGeminiUploadErrorV1 extends Error {
  constructor(
    public readonly code:
      | 'content_type_unsupported'
      | 'source_download_failed'
      | 'source_length_invalid'
      | 'source_too_large'
      | 'upload_initialization_failed'
      | 'upload_failed'
      | 'upload_identity_missing'
      | 'upload_byte_count_mismatch'
      | 'activation_failed',
    message: string,
  ) {
    super(message);
    this.name = 'ReferenceGeminiUploadErrorV1';
  }
}

/**
 * Streams one already-authorized canonical reference to Gemini Files. The
 * caller supplies the receipt-derived MIME type; this owner never guesses it
 * from a signed URL or rewrites the source identity.
 */
export async function uploadReferenceVideoToGemini(
  videoUrl: string,
  contentType = 'video/mp4',
): Promise<string> {
  const normalizedContentType = contentType.trim().toLowerCase();
  if (!SUPPORTED_VIDEO_CONTENT_TYPES.has(normalizedContentType)) {
    throw new ReferenceGeminiUploadErrorV1(
      'content_type_unsupported',
      `Unsupported reference video content type: ${normalizedContentType || 'missing'}`,
    );
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured');

  const response = await fetch(videoUrl);
  if (!response.ok || !response.body) {
    throw new ReferenceGeminiUploadErrorV1(
      'source_download_failed',
      `Reference video download failed with HTTP ${response.status}`,
    );
  }

  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    throw new ReferenceGeminiUploadErrorV1(
      'source_length_invalid',
      'Reference video source did not provide a valid Content-Length',
    );
  }
  if (declaredSize > MAX_GEMINI_REFERENCE_BYTES) {
    throw new ReferenceGeminiUploadErrorV1(
      'source_too_large',
      'Reference video exceeds the Gemini Files API 2GB limit',
    );
  }

  let downloadedBytes = 0;
  const sizeGuard = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloadedBytes += chunk.byteLength;
      if (downloadedBytes > MAX_GEMINI_REFERENCE_BYTES) {
        throw new ReferenceGeminiUploadErrorV1(
          'source_too_large',
          'Reference video exceeds the Gemini Files API 2GB limit',
        );
      }
      controller.enqueue(chunk);
    },
  });

  const startResponse = await fetch(`${GEMINI_FILES_UPLOAD_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(declaredSize),
      'X-Goog-Upload-Header-Content-Type': normalizedContentType,
    },
    body: JSON.stringify({ file: { display_name: 'editron-canonical-reference' } }),
  });
  if (!startResponse.ok) {
    throw new ReferenceGeminiUploadErrorV1(
      'upload_initialization_failed',
      `Gemini resumable upload initialization failed with HTTP ${startResponse.status}`,
    );
  }
  const uploadUrl = startResponse.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new ReferenceGeminiUploadErrorV1(
      'upload_initialization_failed',
      'Gemini resumable upload returned no upload URL',
    );
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(declaredSize),
      'Content-Type': normalizedContentType,
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: response.body.pipeThrough(sizeGuard),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  if (!uploadResponse.ok) {
    throw new ReferenceGeminiUploadErrorV1(
      'upload_failed',
      `Gemini reference upload failed with HTTP ${uploadResponse.status}`,
    );
  }
  if (downloadedBytes !== declaredSize) {
    throw new ReferenceGeminiUploadErrorV1(
      'upload_byte_count_mismatch',
      `Reference video byte count did not match Content-Length (${downloadedBytes}/${declaredSize})`,
    );
  }

  const uploadResult = await uploadResponse.json() as {
    file?: { uri?: string; name?: string; state?: string };
  };
  const fileUri = uploadResult.file?.uri;
  if (!fileUri) {
    throw new ReferenceGeminiUploadErrorV1(
      'upload_identity_missing',
      'Gemini Files API returned no file URI',
    );
  }

  const { GoogleAIFileManager } = await import('@google/generative-ai/server');
  const activation = await waitForGeminiFileActive({
    fileManager: new GoogleAIFileManager(apiKey),
    fileName: uploadResult.file?.name,
    initialState: uploadResult.file?.state,
    label: 'RefExtractor',
    fileSizeBytes: downloadedBytes,
  });
  if (!activation.active) {
    throw new ReferenceGeminiUploadErrorV1(
      'activation_failed',
      `Gemini reference file did not become ACTIVE (state=${activation.state ?? 'unknown'}, reason=${activation.reason ?? 'unknown'})`,
    );
  }
  return fileUri;
}
