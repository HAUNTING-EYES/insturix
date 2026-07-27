import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { projectService } from '@/lib/editron/services/project-service';
import {
  CHAT_REFERENCE_MAX_FILE_BYTES,
  ChatReferenceAttachmentError,
  ingestChatDocumentReference,
  ingestChatUrlReference,
  type ChatReferenceAttachmentRecord,
} from '@/lib/editron/services/chat-reference-attachment-service';
import { ChatReferenceUrlError } from '@/lib/editron/services/chat-reference-url-fetcher';
import { checkRateLimit } from '@/lib/editron/utils/rate-limiter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = await checkRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait before attaching another reference.' }, { status: 429 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    let projectId = '';
    let record: ChatReferenceAttachmentRecord;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      projectId = boundedText(form.get('projectId'), 200);
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'A document file is required.' }, { status: 400 });
      if (file.size > CHAT_REFERENCE_MAX_FILE_BYTES) return NextResponse.json({ error: 'Attached document exceeds the 15 MB limit.' }, { status: 413 });
      if (!await projectService.loadProject(userId, projectId)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      record = await ingestChatDocumentReference({
        userId,
        projectId,
        fileName: file.name,
        mimeType: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
    } else {
      const body = await request.json().catch(() => ({}));
      projectId = boundedText(body.projectId, 200);
      const url = boundedText(body.url, 4_000);
      if (!url) return NextResponse.json({ error: 'A reference URL is required.' }, { status: 400 });
      if (!await projectService.loadProject(userId, projectId)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      record = await ingestChatUrlReference({ userId, projectId, url, name: boundedText(body.name, 180) });
    }

    return NextResponse.json({ reference: toResponse(record) }, { status: record.status === 'processing' ? 202 : 201 });
  } catch (error) {
    if (error instanceof ChatReferenceAttachmentError || error instanceof ChatReferenceUrlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[EditronChatAttachment] ingestion failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Reference could not be attached.' }, { status: 500 });
  }
}

function toResponse(record: ChatReferenceAttachmentRecord) {
  return {
    referenceId: record.referenceId,
    name: record.name,
    referenceType: record.sourceType,
    status: record.status,
    contentDigest: record.contentDigest,
    warnings: record.warnings,
    error: record.error,
  };
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
