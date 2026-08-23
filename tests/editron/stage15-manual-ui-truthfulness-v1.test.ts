import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Stage 1.5 manual UI current truth', () => {
  it('distinguishes the live V1 route from the V2 preview shell', () => {
    const liveProjectPage = source(
      'app/dashboard/editron/project/[projectId]/page.tsx',
    );
    const v2ProjectPage = source(
      'app/dashboard/editron/project/[projectId]/v2/page.tsx',
    );

    expect(liveProjectPage).toContain(
      '<ReactVideoEditor projectId={projectId} />',
    );
    expect(v2ProjectPage).toContain('/v2 PREVIEW route');
    expect(v2ProjectPage).toContain(
      '<ReactVideoEditor projectId={projectId} variant="v2" />',
    );
  });

  it('keeps the V1 editor context overlay/frame oriented', () => {
    const constants = source('components/editron/editor/version-7.0.0/constants.ts');
    const editorContext = source(
      'components/editron/editor/version-7.0.0/contexts/editor-context.tsx',
    );

    expect(constants).toContain('export const FPS = 30;');
    expect(editorContext).toContain('overlays: Overlay[];');
    expect(editorContext).toContain('selectedOverlayId: number | null;');
    expect(editorContext).toContain('currentFrame: number;');
    expect(editorContext).not.toContain('selectedRange');
  });

  it('keeps the present AI turn UI-exclusive rather than range-concurrent', () => {
    const chatPanel = source(
      'components/editron/editor/version-7.0.0/components/ai-chat/ai-chat-panel.tsx',
    );
    const videoEditor = source(
      'components/editron/editor/version-7.0.0/react-video-editor.tsx',
    );

    expect(chatPanel).toContain('setIsAIProcessing(true); // Lock editor');
    expect(videoEditor).toContain('pauseAutosave: isAIProcessing');
    expect(videoEditor).toContain(
      "isAIProcessing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'",
    );
  });
});
