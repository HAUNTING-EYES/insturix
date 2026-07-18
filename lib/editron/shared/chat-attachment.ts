export const CHAT_ATTACHMENT_MAX_COUNT = 8;

export const CHAT_ATTACHMENT_ROLES = [
  'source',
  'style-reference',
  'music-reference',
  'brand-evidence',
  'context',
  'script',
] as const;

export type ChatAttachmentRole = (typeof CHAT_ATTACHMENT_ROLES)[number];
export type ChatAttachmentMediaType = 'video' | 'image' | 'audio';
export type ChatAttachmentAnalysisReadiness = 'ready' | 'processing' | 'failed' | 'unknown';

export interface AuthorizedMediaChatAttachment {
  attachmentId: string;
  kind: 'media-asset';
  role: ChatAttachmentRole;
  assetId: string;
  name: string;
  mediaType: ChatAttachmentMediaType;
  analysisReadiness: ChatAttachmentAnalysisReadiness;
  durationSec?: number;
  dimensions?: { width: number; height: number };
}

export interface AuthorizedReferenceChatAttachment {
  attachmentId: string;
  kind: 'reference';
  role: ChatAttachmentRole;
  referenceId: string;
  name: string;
  referenceType: 'document' | 'url';
  analysisReadiness: ChatAttachmentAnalysisReadiness;
  contentDigest?: string;
  contentExcerpt?: string;
}

export type AuthorizedChatAttachment =
  | AuthorizedMediaChatAttachment
  | AuthorizedReferenceChatAttachment;
