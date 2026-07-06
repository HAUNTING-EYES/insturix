import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { uploadMedia } from '@/lib/editron/services/upload-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Chatterbox clones from a 10-30s clean-speech clip, capped ~10MB.
const MAX_VOICE_SAMPLE_BYTES = 10 * 1024 * 1024;
const AUDIO_CONTENT_TYPE_RE = /^audio\/(?:wav|x-wav|wave|mpeg|mp3|mp4|m4a|x-m4a|aac|ogg|webm|flac)$/i;

type VoiceUploadErrorCode =
  | 'invalid_form_data'
  | 'missing_file'
  | 'unsupported_file_type'
  | 'empty_file'
  | 'file_too_large'
  | 'storage_failed';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return uploadError(400, 'invalid_form_data', 'Expected multipart form data with a file field.');
  }

  const file = form.get('file');
  if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
    return uploadError(400, 'missing_file', 'Missing voice sample upload.');
  }

  const contentType = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!AUDIO_CONTENT_TYPE_RE.test(contentType)) {
    return uploadError(415, 'unsupported_file_type', 'Voice sample must be an audio file (wav, mp3, m4a, ogg, webm, flac).');
  }
  if (file.size <= 0) return uploadError(400, 'empty_file', 'Voice sample was empty.');
  if (file.size > MAX_VOICE_SAMPLE_BYTES) {
    return uploadError(413, 'file_too_large', 'Voice sample must be under 10MB (10-30s of clean speech).');
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `avatar-voice-${Date.now()}${extForContentType(contentType)}`;
    const stored = await uploadMedia(buffer, userId, filename, contentType);
    return NextResponse.json({
      ok: true,
      asset: {
        assetId: stored.assetId,
        url: stored.signedUrl,
        contentType: stored.contentType,
        sizeBytes: stored.size,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice sample upload failed.';
    return uploadError(502, 'storage_failed', message);
  }
}

function extForContentType(contentType: string): string {
  const t = contentType.toLowerCase();
  if (t.includes('webm')) return '.webm';
  if (t.includes('mpeg') || t.includes('mp3')) return '.mp3';
  if (t.includes('ogg')) return '.ogg';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return '.m4a';
  if (t.includes('flac')) return '.flac';
  return '.wav';
}

function uploadError(status: number, code: VoiceUploadErrorCode, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
