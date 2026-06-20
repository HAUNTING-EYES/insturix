import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildChatEditContextBundle,
  formatChatEditContextForPrompt,
} from '@/lib/editron/agent/chat-edit-context';
import {
  findTranscriptMomentCandidates,
  type TranscriptSearchWord,
} from '@/lib/editron/agent/chat-transcript-tools';
import { getChatToolMetadata } from '@/lib/editron/agent/chat-tool-registry';

describe('chat edit context bundle', () => {
  const project = {
    projectId: 'proj_chat_context',
    fps: 30,
    durationInFrames: 300,
    dimensions: { width: 1280, height: 720 },
    overlays: [
      {
        id: 1,
        type: 'video',
        from: 0,
        durationInFrames: 180,
        row: 0,
        assetId: 'asset_video',
        src: 'https://example.com/video.mp4',
      },
      {
        id: 2,
        type: 'caption',
        from: 60,
        durationInFrames: 90,
        row: 3,
        content: 'Hello there',
        words: [
          { word: 'Hello', startFrame: 60, endFrame: 70 },
          { word: 'there', startFrame: 71, endFrame: 80 },
        ],
      },
      {
        id: 3,
        type: 'sound',
        from: 80,
        durationInFrames: 60,
        row: 4,
        assetId: 'asset_music',
      },
      {
        id: 4,
        type: 'text',
        from: 90,
        durationInFrames: 45,
        row: 2,
        content: 'Key point',
      },
    ],
    rawFootageAnalysis: {
      transcription: {
        segments: [{ text: 'Hello there from source' }],
        words: [
          { word: 'Hello', start: 0.1 },
          { word: 'there', start: 0.2 },
          { word: 'source', start: 0.3 },
        ],
      },
    },
  };

  it('bundles playhead, selected overlay, transcript, audio, and media context deterministically', () => {
    const bundle = buildChatEditContextBundle(project, {
      selectedOverlayId: 1,
      clientContext: {
        currentFrame: 95,
        visibleTimeline: { startFrame: 30, endFrame: 180 },
        selectedRange: { startFrame: 90, endFrame: 120 },
      },
    });

    expect(bundle.playhead).toMatchObject({
      frame: 95,
      seconds: 3.167,
      timecode: '0:03.05',
      activeOverlayIds: [1, 2, 3, 4],
    });
    expect(bundle.selectedOverlay).toMatchObject({
      id: 1,
      type: 'video',
      from: 0,
      endFrame: 180,
      sceneIndex: 0,
    });
    expect(bundle.visibleTimeline).toEqual({ startFrame: 30, endFrame: 180, durationInFrames: 150 });
    expect(bundle.selectedRange).toEqual({ startFrame: 90, endFrame: 120, durationInFrames: 30 });
    expect(bundle.transcript).toMatchObject({
      captionOverlayCount: 1,
      captionWordCount: 2,
      rawSegmentCount: 1,
      rawWordCount: 3,
      hasWordTimestamps: true,
    });
    expect(bundle.audio).toEqual({
      soundOverlayCount: 1,
      nativeAudioVideoCount: 1,
    });
    expect(bundle.mediaRefs).toEqual([
      { assetId: 'asset_video', types: ['video'], overlayIds: [1] },
      { assetId: 'asset_music', types: ['sound'], overlayIds: [3] },
    ]);
    expect(bundle.resolverStatus.userMediaSearchAvailableToChat).toBe(true);
  });

  it('covers user asset tools with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-asset-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['list_user_assets', 'search_user_assets', 'inspect_user_asset']);
    expect(toolNames.map((toolName) => getChatToolMetadata(toolName)?.receiptLabel)).toEqual([
      'Listed uploaded assets',
      'Searched uploaded assets',
      'Inspected uploaded asset',
    ]);
  });

  it('covers transcript moment search with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-transcript-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_transcript_moment']);
    expect(getChatToolMetadata('find_transcript_moment')).toMatchObject({
      label: 'Finding transcript moment',
      shortLabel: 'Find speech',
      receiptLabel: 'Found transcript moment',
      mutatesProject: false,
      riskLevel: 'read',
    });
  });

  it('finds phrase-level transcript moments with frame hints for edit tools', () => {
    const words = makeTranscriptWords(
      ['two', 'human', 'beings', 'in', 'the', 'real', 'world'],
      90,
    );
    const candidates = findTranscriptMomentCandidates(words, 'two human beings', {
      limit: 3,
      minConfidence: 0.42,
    });

    expect(candidates[0]).toMatchObject({
      text: 'two human beings',
      startFrame: 90,
      endFrame: 108,
      confidenceLabel: 'high',
      matchType: 'phrase',
      safeForAutoEdit: true,
      useWith: {
        cut_section: {
          startFrame: 90,
          endFrame: 108,
        },
        add_motion_graphic: {
          frame: 90,
          text: 'two human beings',
        },
        add_sfx: {
          frame: 90,
          sync: 'word-start',
        },
      },
    });
    expect(candidates[0].surroundingWords).toContain('in the real world');
  });

  it('clamps playhead and makes missing resolvers explicit in the prompt', () => {
    const bundle = buildChatEditContextBundle(project, {
      clientContext: {
        currentFrame: 999,
        canvas: { width: 1080, height: 1920 },
      },
    });
    const prompt = formatChatEditContextForPrompt(bundle);

    expect(bundle.playhead.frame).toBe(300);
    expect(bundle.project.canvas).toEqual({ width: 1080, height: 1920 });
    expect(prompt).toContain('Reference rule: when the user says "this"');
    expect(prompt).toContain('User media search: available via list_user_assets, search_user_assets, and inspect_user_asset');
    expect(prompt).toContain('Transcript moment search: available via find_transcript_moment');
    expect(prompt).toContain('Missing semantic resolvers: find_visual_moment, find_audio_moment');
    expect(prompt).toContain('Do not ask for a timeframe when this context is enough.');
  });
});

function makeTranscriptWords(words: string[], startFrame: number): TranscriptSearchWord[] {
  return words.map((word, index) => {
    const wordStart = startFrame + (index * 6);
    const wordEnd = wordStart + 6;
    return {
      word,
      startMs: Math.round((wordStart / 30) * 1000),
      endMs: Math.round((wordEnd / 30) * 1000),
      startFrame: wordStart,
      endFrame: wordEnd,
      confidence: 0.94,
      source: {
        type: 'video-transcription',
        overlayId: 1,
        assetId: 'asset_video',
        overlayType: 'video',
      },
    };
  });
}
