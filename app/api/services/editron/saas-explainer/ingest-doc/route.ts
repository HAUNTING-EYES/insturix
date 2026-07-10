import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractBrandVaultUploadEvidenceFromBuffer } from '@/lib/shared/brand-vault-upload-parser';

/**
 * POST /api/services/editron/saas-explainer/ingest-doc  (multipart/form-data, field "file")
 *
 * Extracts text from an uploaded PDF / DOCX / PPTX / TXT / MD so the user can feed a document (e.g. a NEW
 * product spec or one-pager) as the SOURCE MATERIAL for a SaaS explainer. Reuses the production Brand Vault
 * upload parser (hand-rolled PDF/OOXML text extraction, DoS-guarded). Returns the extracted text; the studio
 * passes it to /plan as `sourceMaterial` so the script agent understands the topic (NOT used as verbatim VO).
 *
 * No GLM: this is pure text extraction. Content understanding happens downstream in the (Gemini) script agent.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 15_000_000; // 15MB — above real product decks, below memory-danger.
const ACCEPT = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'markdown']);

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ success: false, error: 'Expected multipart/form-data with a "file" field.' }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: 'File too large (max 15MB).' }, { status: 413 });
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ACCEPT.has(ext)) {
    return NextResponse.json({ success: false, error: `Unsupported file type ".${ext}". Use PDF, DOCX, PPTX, TXT, or MD.` }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractBrandVaultUploadEvidenceFromBuffer({ name: file.name, mimeType: file.type || undefined, buffer });
    const text = (result.source.text ?? '').trim();
    if (!text) {
      return NextResponse.json(
        { success: false, error: 'No readable text found in that file (scanned images without OCR are not supported yet).', warnings: result.warnings },
        { status: 422 },
      );
    }
    return NextResponse.json({ success: true, name: file.name, text, chars: text.length, warnings: result.warnings });
  } catch (error) {
    console.error('[saas-explainer-ingest-doc] failed', error);
    return NextResponse.json({ success: false, error: 'Could not read that document.' }, { status: 500 });
  }
}
