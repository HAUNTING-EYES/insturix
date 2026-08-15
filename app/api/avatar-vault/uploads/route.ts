import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  createAvatarVaultUploadStorageFromEnvironment,
  validateAvatarVaultUploadInput,
  type AvatarVaultUploadErrorCode,
} from '@/lib/avatar/avatar-vault-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return uploadError(400, 'invalid_form_data', 'Expected multipart form data with a file field.');
  }

  const file = formData.get('file');
  if (!isFileLike(file)) {
    return uploadError(400, 'missing_file', 'Missing avatar image upload.');
  }

  const validation = validateAvatarVaultUploadInput({
    name: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
    role: stringFormValue(formData.get('role')),
  });
  if (!validation.ok) return uploadError(validation.status, validation.code, validation.message);

  const storage = createAvatarVaultUploadStorageFromEnvironment();
  if (!storage) {
    return uploadError(503, 'storage_not_configured', 'Avatar image storage is not configured.');
  }

  try {
    const stored = await storage.storeUpload({
      userId,
      name: file.name,
      contentType: validation.contentType,
      buffer: Buffer.from(await file.arrayBuffer()),
      role: validation.role,
    });

    return NextResponse.json({
      ok: true,
      asset: {
        assetId: stored.assetId,
        imageUrl: stored.publicUrl,
        r2Key: stored.storageKey,
        role: validation.role,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
        originalName: file.name,
        storedAt: stored.storedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Avatar image upload failed.';
    return uploadError(502, 'storage_failed', message);
  }
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

function uploadError(status: number, code: AvatarVaultUploadErrorCode, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function stringFormValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}
