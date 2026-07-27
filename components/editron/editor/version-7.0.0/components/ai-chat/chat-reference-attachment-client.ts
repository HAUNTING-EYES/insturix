import type { ChatReferenceSourceType } from '@/lib/editron/services/chat-reference-attachment-service';

export interface ChatReferenceIngestionResponse {
  referenceId: string;
  name: string;
  referenceType: ChatReferenceSourceType;
  status: 'processing' | 'ready' | 'failed';
  contentDigest?: string;
  warnings?: string[];
  error?: { code: string; message: string };
}

export async function uploadChatDocumentReference(projectId: string, file: File): Promise<ChatReferenceIngestionResponse> {
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('file', file);
  return ingest('/api/services/editron/chat/attachments', { method: 'POST', body: form });
}

export async function addChatUrlReference(projectId: string, url: string): Promise<ChatReferenceIngestionResponse> {
  return ingest('/api/services/editron/chat/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, url }),
  });
}

async function ingest(url: string, init: RequestInit): Promise<ChatReferenceIngestionResponse> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Reference could not be attached.');
  const reference = body.reference as ChatReferenceIngestionResponse | undefined;
  if (!reference?.referenceId || !reference.name || !reference.referenceType) {
    throw new Error('Reference ingestion returned an invalid durable record.');
  }
  if (reference.status !== 'ready') {
    throw new Error(reference.error?.message || 'Reference is still processing. Retry in a moment.');
  }
  return reference;
}
