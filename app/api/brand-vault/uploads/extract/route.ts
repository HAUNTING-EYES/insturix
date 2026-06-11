import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { extractBrandVaultUploadEvidenceFromBuffer } from '@/lib/shared/brand-vault-upload-parser';

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

  const result = await extractBrandVaultUploadEvidenceFromBuffer({
    name: file.name,
    mimeType: file.type || undefined,
    buffer: Buffer.from(await file.arrayBuffer()),
  });

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
