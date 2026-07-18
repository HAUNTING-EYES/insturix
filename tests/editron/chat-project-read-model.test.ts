import { describe, expect, it } from 'vitest';

import { buildChatProjectReadModel } from '@/lib/editron/agent/chat-project-read-model';

describe('chat project read model', () => {
  const embeddedImage = `data:image/png;base64,${'A'.repeat(50_000)}`;
  const signedUrl = 'https://storage.googleapis.com/bucket/video.mp4?X-Goog-Credential=secret&X-Goog-Signature=private';
  const project = {
    projectId: 'proj_safe_read',
    name: 'Safe read fixture',
    fps: 30,
    durationInFrames: 300,
    dimensions: { width: 1920, height: 1080 },
    intelligence: { huge: 'x'.repeat(300_000) },
    analysis: { rawFrames: Array.from({ length: 200 }, () => embeddedImage) },
    overlays: [
      {
        id: 'video-1',
        type: 'video',
        from: 0,
        durationInFrames: 300,
        row: 0,
        assetId: 'asset-video',
        src: signedUrl,
        metadata: {
          atomicOverlayReceipt: {
            atoms: { thumbnail: embeddedImage },
            rawSignals: Array.from({ length: 1_000 }, (_, index) => ({ index, data: embeddedImage })),
          },
        },
      },
      {
        id: 'caption-1',
        type: 'caption',
        from: 30,
        durationInFrames: 180,
        row: 3,
        content: 'A readable caption line',
        words: Array.from({ length: 400 }, (_, index) => ({
          word: `word-${index}`,
          startFrame: 30 + index,
          endFrame: 31 + index,
        })),
      },
      {
        id: 'html-1',
        type: 'html-scene',
        from: 90,
        durationInFrames: 60,
        row: 2,
        content: `<div>Keep this editable text<img src="${embeddedImage}" /></div>`,
      },
    ],
  };

  it('keeps edit coordinates while omitting nested analysis, blobs, signed queries, and receipts', () => {
    const model = buildChatProjectReadModel(project);
    const serialized = JSON.stringify(model);

    expect(serialized.length).toBeLessThan(20_000);
    expect(serialized).not.toContain('X-Goog-Credential');
    expect(serialized).not.toContain('X-Goog-Signature');
    expect(serialized).not.toContain('data:image');
    expect(serialized).not.toContain('atomicOverlayReceipt');
    expect(serialized).not.toContain('rawFrames');
    expect(model.overlays.map((overlay) => overlay.id)).toEqual(['video-1', 'caption-1', 'html-1']);
    expect(model.overlays[0]).toMatchObject({
      id: 'video-1',
      type: 'video',
      from: 0,
      durationInFrames: 300,
      endFrame: 300,
      assetId: 'asset-video',
      media: { src: 'https://storage.googleapis.com/bucket/video.mp4' },
    });
    expect(model.overlays[1]).toMatchObject({
      id: 'caption-1',
      content: 'A readable caption line',
      counts: { wordCount: 400 },
    });
    expect(serialized).toContain('Keep this editable text');
  });

  it('applies the same safe projection to by-id reads', () => {
    const model = buildChatProjectReadModel(project, { overlayIds: ['caption-1'] });
    const serialized = JSON.stringify(model);

    expect(model.overlays).toHaveLength(1);
    expect(model.overlays[0]).toMatchObject({ id: 'caption-1', type: 'caption' });
    expect(model.summary).toMatchObject({
      sourceOverlayCount: 3,
      selectedOverlayCount: 1,
      includedOverlayCount: 1,
    });
    expect(serialized).not.toContain('data:image');
  });

  it('degrades to a minimal, explicitly truncated view under a strict output budget', () => {
    const manyOverlayProject = {
      ...project,
      overlays: Array.from({ length: 500 }, (_, index) => ({
        id: `overlay-${index}`,
        type: index % 2 === 0 ? 'video' : 'text',
        from: index * 30,
        durationInFrames: 30,
        content: `Overlay ${index} ${'detail '.repeat(100)}`,
        metadata: { receipt: embeddedImage },
      })),
    };
    const model = buildChatProjectReadModel(manyOverlayProject, { maxOutputChars: 12_000 });
    const serialized = JSON.stringify(model);

    expect(serialized.length).toBeLessThanOrEqual(12_000);
    expect(model.omissions.truncated).toBe(true);
    expect(model.omissions.omittedOverlayCount).toBeGreaterThan(0);
    expect(model.omissions.nextAction).toContain('mode=byTrackIds');
    expect(serialized).not.toContain('data:image');
  });
});
