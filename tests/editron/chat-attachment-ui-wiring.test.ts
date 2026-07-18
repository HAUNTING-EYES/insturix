import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  allowedRolesForMediaType,
  mediaFileToDraft,
  referenceResponseToDraft,
  toChatAttachmentInput,
} from '../../components/editron/editor/version-7.0.0/components/ai-chat/chat-attachment-picker';

describe('chat attachment UI wiring', () => {
  it('keeps UI role choices compatible with each media family', () => {
    expect(allowedRolesForMediaType('audio')).toEqual([
      'music-reference',
      'source',
      'brand-evidence',
      'context',
    ]);
    expect(allowedRolesForMediaType('image')).toEqual([
      'style-reference',
      'source',
      'brand-evidence',
      'context',
    ]);
    expect(allowedRolesForMediaType('video')).toContain('style-reference');
    expect(allowedRolesForMediaType('video')).toContain('music-reference');
  });

  it('creates a durable attachment draft and preserves analysis readiness', () => {
    expect(mediaFileToDraft({
      id: 'asset-audio',
      assetId: 'asset-audio',
      name: 'Score.wav',
      type: 'audio',
      path: 'https://example.com/private-url',
      size: 2048,
      lastModified: 1,
      duration: 9.5,
      analysisStatus: 'analyzing',
    })).toEqual({
      attachmentId: 'media:asset-audio',
      kind: 'media-asset',
      role: 'music-reference',
      assetId: 'asset-audio',
      name: 'Score.wav',
      mediaType: 'audio',
      analysisReadiness: 'processing',
      durationSec: 9.5,
    });
  });

  it('fails locally when an upload has no durable asset identity', () => {
    expect(() => mediaFileToDraft({
      id: 'temporary-only',
      name: 'Temporary.mp4',
      type: 'video',
      path: 'blob:temporary',
      size: 1024,
      lastModified: 1,
    })).toThrow('durable assetId');
  });

  it('creates strict durable document and URL attachment payloads', () => {
    const draft = referenceResponseToDraft({
      referenceId: 'chatref-script',
      name: 'Script.md',
      referenceType: 'document',
      status: 'ready',
      contentDigest: 'digest-1',
    });
    expect(draft).toMatchObject({ kind: 'reference', referenceId: 'chatref-script', role: 'context' });
    expect(toChatAttachmentInput({ ...draft, role: 'script' })).toEqual({
      kind: 'reference', referenceId: 'chatref-script', role: 'script',
    });
    expect(toChatAttachmentInput(mediaFileToDraft({
      id: 'asset-video', assetId: 'asset-video', name: 'Clip.mp4', type: 'video', path: 'private', size: 10, lastModified: 1,
    }))).toEqual({ kind: 'media-asset', assetId: 'asset-video', role: 'context' });
  });

  it('uses the one active upload authority and sends only strict server fields', () => {
    const picker = read('components/editron/editor/version-7.0.0/components/ai-chat/chat-attachment-picker.tsx');
    const panel = read('components/editron/editor/version-7.0.0/components/ai-chat/ai-chat-panel.tsx');
    const v2Panel = read('components/editron/editor/version-7.0.0/v2/ai/v2-ai-panel.tsx');
    const mediaList = read('app/api/services/editron/media/list/route.ts');

    expect(picker).toContain('useLocalMedia()');
    expect(picker).toContain('addMediaFiles(mediaFiles)');
    expect(picker).toContain('multiple');
    expect(picker).toContain('.pdf,.docx,.pptx');
    expect(picker).toContain('uploadChatDocumentReference(projectId, file)');
    expect(picker).toContain('addChatUrlReference(projectId, urlInput.trim())');
    expect(panel).toContain('<ChatAttachmentPicker');
    expect(panel).toContain('attachmentsForTurn.map(toChatAttachmentInput)');
    expect(panel).toContain('projectId={projectId}');
    expect(panel).toContain('setPendingAttachments([])');
    expect(v2Panel).toContain('<AIChatPanel />');
    expect(mediaList).toContain('analysisStatus: (asset as MediaAsset & { analysisStatus?: string }).analysisStatus');
  });
});

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}
