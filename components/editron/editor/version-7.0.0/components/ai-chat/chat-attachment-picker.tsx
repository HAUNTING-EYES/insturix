'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, FileText, FileVideo, ImageIcon, Link2, Loader2, Music, Paperclip, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CHAT_ATTACHMENT_MAX_COUNT,
  type AuthorizedChatAttachment,
  type AuthorizedMediaChatAttachment,
  type AuthorizedReferenceChatAttachment,
  type ChatAttachmentAnalysisReadiness,
  type ChatAttachmentRole,
} from '@/lib/editron/shared/chat-attachment';
import { useLocalMedia } from '../../contexts/local-media-context';
import type { LocalMediaFile } from '../../types';
import {
  addChatUrlReference,
  uploadChatDocumentReference,
  type ChatReferenceIngestionResponse,
} from './chat-reference-attachment-client';

export type ChatAttachmentDraft = AuthorizedChatAttachment;

export const CHAT_ATTACHMENT_ROLE_OPTIONS = [
  { value: 'context', label: 'Context' },
  { value: 'script', label: 'Script' },
  { value: 'source', label: 'Source' },
  { value: 'style-reference', label: 'Style reference' },
  { value: 'music-reference', label: 'Music reference' },
  { value: 'brand-evidence', label: 'Brand evidence' },
] as const satisfies ReadonlyArray<{ value: ChatAttachmentRole; label: string }>;

interface ChatAttachmentPickerProps {
  projectId: string;
  attachments: ChatAttachmentDraft[];
  disabled?: boolean;
  onChange: (attachments: ChatAttachmentDraft[]) => void;
}

export function ChatAttachmentPicker({ projectId, attachments, disabled = false, onChange }: ChatAttachmentPickerProps) {
  const { localMediaFiles, addMediaFiles, isLoading } = useLocalMedia();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const selectedMediaIds = useMemo(() => new Set(
    attachments.flatMap((attachment) => attachment.kind === 'media-asset' ? [attachment.assetId] : []),
  ), [attachments]);
  const visibleMedia = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return localMediaFiles
      .filter((file) => file.assetId)
      .filter((file) => !normalizedQuery || file.name.toLowerCase().includes(normalizedQuery))
      .slice(0, 50);
  }, [localMediaFiles, query]);

  const toggleMediaAttachment = (file: LocalMediaFile) => {
    if (!file.assetId || disabled) return;
    if (selectedMediaIds.has(file.assetId)) {
      onChange(attachments.filter((attachment) => attachment.kind !== 'media-asset' || attachment.assetId !== file.assetId));
      return;
    }
    if (attachments.length >= CHAT_ATTACHMENT_MAX_COUNT) {
      setError(`Attach up to ${CHAT_ATTACHMENT_MAX_COUNT} items per message.`);
      return;
    }
    setError('');
    onChange([...attachments, mediaFileToDraft(file)]);
  };

  const handleUpload = async (files: File[]) => {
    const remaining = CHAT_ATTACHMENT_MAX_COUNT - attachments.length;
    if (!projectId || remaining <= 0) {
      setError(projectId ? `Attach up to ${CHAT_ATTACHMENT_MAX_COUNT} items per message.` : 'Open a saved project before attaching files.');
      return;
    }
    const accepted = files.slice(0, remaining);
    if (accepted.length === 0) return;

    setError(files.length > accepted.length ? `${files.length - accepted.length} item(s) were not uploaded because this message is full.` : '');
    setIsUploading(true);
    try {
      const mediaFiles = accepted.filter(isMediaUpload);
      const documentFiles = accepted.filter((file) => !isMediaUpload(file));
      const drafts: ChatAttachmentDraft[] = [];
      const failures: string[] = [];

      if (mediaFiles.length > 0) {
        const result = await addMediaFiles(mediaFiles);
        drafts.push(...result.uploaded.filter((file) => file.assetId).map(mediaFileToDraft));
        failures.push(...result.failed.map((failure) => `${failure.filename}: ${failure.error}`));
      }

      const documentResults = await Promise.allSettled(
        documentFiles.map(async (file) => referenceResponseToDraft(await uploadChatDocumentReference(projectId, file))),
      );
      documentResults.forEach((result, index) => {
        if (result.status === 'fulfilled') drafts.push(result.value);
        else failures.push(`${documentFiles[index]?.name ?? 'Document'}: ${errorMessage(result.reason)}`);
      });

      const existingIds = new Set(attachments.map(attachmentResourceId));
      onChange([...attachments, ...drafts.filter((draft) => !existingIds.has(attachmentResourceId(draft)))]
        .slice(0, CHAT_ATTACHMENT_MAX_COUNT));
      if (failures.length > 0) setError(failures.join(' '));
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const attachUrl = async () => {
    if (!projectId || !urlInput.trim() || attachments.length >= CHAT_ATTACHMENT_MAX_COUNT) return;
    setIsUploading(true);
    setError('');
    try {
      const draft = referenceResponseToDraft(await addChatUrlReference(projectId, urlInput.trim()));
      const id = attachmentResourceId(draft);
      if (!attachments.some((attachment) => attachmentResourceId(attachment) === id)) onChange([...attachments, draft]);
      setUrlInput('');
    } catch (urlError) {
      setError(errorMessage(urlError));
    } finally {
      setIsUploading(false);
    }
  };

  const updateRole = (attachmentId: string, role: ChatAttachmentRole) => {
    onChange(attachments.map((attachment) =>
      attachment.attachmentId === attachmentId && allowedRolesForAttachment(attachment).includes(role)
        ? { ...attachment, role }
        : attachment,
    ));
  };

  const busy = disabled || isUploading;

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <div className="space-y-1" aria-label="Attached references">
          {attachments.map((attachment) => (
            <div key={attachment.attachmentId} className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 p-2">
              <AttachmentIcon attachment={attachment} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium">{attachment.name}</p>
                {attachment.analysisReadiness === 'processing' || attachment.analysisReadiness === 'failed' ? (
                  <p className={cn('text-[10px]', attachment.analysisReadiness === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
                    {attachment.analysisReadiness === 'failed' ? 'Analysis unavailable' : 'Analysis in progress'}
                  </p>
                ) : null}
              </div>
              <select
                aria-label={`Role for ${attachment.name}`}
                value={attachment.role}
                disabled={busy}
                onChange={(event) => updateRole(attachment.attachmentId, event.target.value as ChatAttachmentRole)}
                className="h-7 max-w-[112px] rounded-md border bg-background px-2 text-[10px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CHAT_ATTACHMENT_ROLE_OPTIONS
                  .filter((option) => allowedRolesForAttachment(attachment).includes(option.value))
                  .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <Button type="button" variant="ghost" size="icon" title={`Remove ${attachment.name}`} disabled={busy} onClick={() => onChange(attachments.filter((item) => item.attachmentId !== attachment.attachmentId))} className="h-7 w-7 shrink-0">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" disabled={busy} className="h-8 gap-2 px-2 text-[11px] font-medium">
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            Attach
            {attachments.length > 0 && <span className="text-muted-foreground">{attachments.length}/{CHAT_ATTACHMENT_MAX_COUNT}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-[min(340px,calc(100vw-24px))] space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium">Attach evidence</p>
              <p className="text-[10px] text-muted-foreground">Media, scripts, documents, or public links.</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={busy || attachments.length >= CHAT_ATTACHMENT_MAX_COUNT} onClick={() => fileInputRef.current?.click()} className="h-8 gap-2 text-[11px] font-medium">
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            <input ref={fileInputRef} type="file" multiple accept="video/*,image/*,audio/*,.pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.svg" className="hidden" onChange={(event) => void handleUpload(Array.from(event.target.files ?? []))} />
          </div>

          <div className="flex gap-2">
            <Input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void attachUrl(); } }} placeholder="Attach a public link" className="h-8 text-[11px]" />
            <Button type="button" variant="outline" size="icon" title="Attach link" disabled={busy || !urlInput.trim() || attachments.length >= CHAT_ATTACHMENT_MAX_COUNT} onClick={() => void attachUrl()} className="h-8 w-8 shrink-0"><Link2 className="h-3.5 w-3.5" /></Button>
          </div>

          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search uploaded media" className="h-8 text-[11px]" />
          <div className="max-h-52 space-y-1 overflow-y-auto" aria-label="Media library">
            {isLoading && visibleMedia.length === 0 ? (
              <div className="flex items-center justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : visibleMedia.length === 0 ? (
              <p className="p-4 text-center text-[11px] text-muted-foreground">No matching media.</p>
            ) : visibleMedia.map((file) => {
              const selected = Boolean(file.assetId && selectedMediaIds.has(file.assetId));
              return (
                <button key={file.id} type="button" disabled={busy || (!selected && attachments.length >= CHAT_ATTACHMENT_MAX_COUNT)} onClick={() => toggleMediaAttachment(file)} className={cn('flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring', selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted/60')}>
                  <MediaTypeIcon type={file.type} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{file.name}</span>
                  {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
          {error && <p role="alert" className="text-[10px] text-destructive">{error}</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function toChatAttachmentInput(attachment: ChatAttachmentDraft) {
  return attachment.kind === 'media-asset'
    ? { kind: attachment.kind, assetId: attachment.assetId, role: attachment.role }
    : { kind: attachment.kind, referenceId: attachment.referenceId, role: attachment.role };
}

export function allowedRolesForAttachment(attachment: ChatAttachmentDraft): ChatAttachmentRole[] {
  return attachment.kind === 'media-asset'
    ? allowedRolesForMediaType(attachment.mediaType)
    : ['context', 'script', 'source', 'style-reference', 'brand-evidence'];
}

export function allowedRolesForMediaType(type: LocalMediaFile['type']): ChatAttachmentRole[] {
  if (type === 'audio') return ['music-reference', 'source', 'brand-evidence', 'context'];
  if (type === 'image') return ['style-reference', 'source', 'brand-evidence', 'context'];
  return ['style-reference', 'music-reference', 'source', 'brand-evidence', 'context'];
}

export function mediaFileToDraft(file: LocalMediaFile): AuthorizedMediaChatAttachment {
  if (!file.assetId) throw new Error('Uploaded media is missing its durable assetId.');
  return {
    attachmentId: `media:${file.assetId}`,
    kind: 'media-asset',
    role: file.type === 'audio' ? 'music-reference' : 'context',
    assetId: file.assetId,
    name: file.name.slice(0, 180),
    mediaType: file.type,
    analysisReadiness: normalizeAnalysisReadiness(file.analysisStatus),
    ...(typeof file.duration === 'number' && Number.isFinite(file.duration) && file.duration > 0 ? { durationSec: file.duration } : {}),
    ...(file.dimensions ? { dimensions: file.dimensions } : {}),
  };
}

export function referenceResponseToDraft(reference: ChatReferenceIngestionResponse): AuthorizedReferenceChatAttachment {
  return {
    attachmentId: `reference:${reference.referenceId}`,
    kind: 'reference',
    role: 'context',
    referenceId: reference.referenceId,
    name: reference.name.slice(0, 180),
    referenceType: reference.referenceType,
    analysisReadiness: normalizeAnalysisReadiness(reference.status),
    ...(reference.contentDigest ? { contentDigest: reference.contentDigest } : {}),
  };
}

function attachmentResourceId(attachment: ChatAttachmentDraft): string {
  return attachment.kind === 'media-asset' ? `media:${attachment.assetId}` : `reference:${attachment.referenceId}`;
}

function isMediaUpload(file: File): boolean {
  return /^(video|image|audio)\//.test(file.type) && file.type !== 'image/svg+xml';
}

function normalizeAnalysisReadiness(status: string | undefined): ChatAttachmentAnalysisReadiness {
  const normalized = status?.trim().toLowerCase() ?? '';
  if (['complete', 'completed', 'ready'].includes(normalized)) return 'ready';
  if (['failed', 'dispatch_failed', 'terminal_failed'].includes(normalized)) return 'failed';
  if (['queued', 'pending', 'analyzing', 'processing', 'transcribing'].includes(normalized)) return 'processing';
  return 'unknown';
}

function AttachmentIcon({ attachment }: { attachment: ChatAttachmentDraft }) {
  if (attachment.kind === 'reference') return attachment.referenceType === 'url' ? <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <MediaTypeIcon type={attachment.mediaType} />;
}

function MediaTypeIcon({ type }: { type: LocalMediaFile['type'] }) {
  if (type === 'audio') return <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (type === 'image') return <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <FileVideo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Attachment failed.';
}
