import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  extractBrandVaultUploadEvidenceFromBuffer,
  isSupportedBrandVaultUpload,
} from '@/lib/shared/brand-vault-upload-parser';
import {
  createBrandVaultUploadAssetStorageFromEnvironment,
  shouldStoreBrandVaultUploadAsset,
} from '@/lib/shared/brand-vault-upload-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 25_000_000;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_form_data', message: 'Expected multipart form data with a file field.' } },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!isFileLike(file)) {
    return NextResponse.json(
      { ok: false, error: { code: 'missing_file', message: 'Missing file upload.' } },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: { code: 'file_too_large', message: 'Brand Vault uploads are limited to 25MB per file for extraction.' } },
      { status: 413 },
    );
  }
  // Reject types the parser/storage cannot use (video, audio, archives, executables, fonts)
  // BEFORE buffering the bytes — mirrors the UI's accept list, enforced server-side.
  if (!isSupportedBrandVaultUpload(file.name, file.type || undefined)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'unsupported_media_type',
          message: 'Brand Vault accepts documents (PDF, Word, PowerPoint, text) and images only.',
        },
      },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractBrandVaultUploadEvidenceFromBuffer({
    name: file.name,
    mimeType: file.type || undefined,
    buffer,
  });

  if (shouldStoreBrandVaultUploadAsset({
    kind: result.source.kind,
    assetRole: result.source.assetRole,
    name: result.source.name,
    mimeType: result.source.mimeType,
  })) {
    const storage = createBrandVaultUploadAssetStorageFromEnvironment();
    if (storage) {
      const stored = await storage.storeUpload({
        userId,
        name: result.source.name,
        mimeType: result.source.mimeType,
        buffer,
        kind: result.source.kind,
        assetRole: result.source.assetRole,
      });
      if (stored.ok) {
        result.source.url = stored.publicUrl;
      } else {
        result.warnings.push(`${result.source.name}: visual upload storage skipped: ${stored.reason}.`);
      }
    } else {
      result.warnings.push(`${result.source.name}: visual upload storage skipped because Brand Vault R2 is not configured.`);
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'name' in value &&
      'type' in value &&
      'size' in value &&
      'arrayBuffer' in value,
  );
}
