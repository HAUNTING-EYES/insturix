/**
 * POST /api/services/thinkforge/script/export-for-editron
 *
 * Export a ThinkForge script as SceneDescriptors for Editron.
 * Uses Gemini Flash LLM for intelligent scene extraction (primary),
 * falls back to regex parsing if LLM is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  parseScriptWithLLM,
  isLLMParserAvailable,
} from '@/lib/pipeline/llm-scene-parser';
import {
  convertThinkForgeBlocksToScenes,
  convertPlainTextToScenes,
  convertCIRToScenes,
  hasTimestampedScenes,
} from '@/lib/pipeline/script-to-scenes';
import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';

export const runtime = 'nodejs';
export const maxDuration = 120; // Gemini 2.5 Flash (thinking model) needs 30-90s for structured output

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, scriptId, blocks, plainText, cir, aspectRatio, artStyle } = body;

    let scenes: SceneDescriptor[] | undefined;
    let title = 'Untitled Script';
    let rawContent = '';
    let overallMusicPrompt = '';
    let characterDescriptions: Record<string, string> = {};
    let colorPalette: string[] = [];
    let environmentNotes = '';
    let globalEditDirections: any = undefined;

    // ─── Reconstruct script text from input ────────────────────
    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      rawContent = (plainText && typeof plainText === 'string')
        ? plainText
        : blocks
            .map((b: any) =>
              (b.content || []).map((n: any) => n.text || '').join(''),
            )
            .join('\n');

      const firstHeader = blocks.find((b: any) => b.kind === 'header');
      if (firstHeader) {
        const text = firstHeader.content
          ?.map((n: any) => n.text || '')
          .join('')
          .trim();
        if (text) title = text;
      }
    } else if (cir && cir.sections) {
      rawContent = JSON.stringify(cir);
      title = cir.title || 'Untitled Script';
    } else if (plainText && typeof plainText === 'string') {
      rawContent = plainText;
      const firstLine = plainText.split('\n')[0]?.replace(/^#+\s*/, '').trim();
      if (firstLine) title = firstLine.substring(0, 100);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Provide one of: blocks (ThinkForgeBlock[]), plainText (string), or cir (CIRDocument)',
        },
        { status: 400 },
      );
    }

    // ─── Try LLM parser first (Gemini Flash) ───────────────────
    if (isLLMParserAvailable() && rawContent.length > 0) {
      try {
        console.log('[export-for-editron] Using LLM parser (Gemini Flash)');
        const llmResult = await parseScriptWithLLM(rawContent, {
          aspectRatio,
          artStyle,
        });

        // Map LLM output to SceneDescriptor format (pass through all LLM-generated fields)
        scenes = llmResult.scenes.map((s, i) => ({
          sceneIndex: i,
          title: s.title,
          narration: s.narration,
          visualDescription: s.visualDescription,
          videoMotionPrompt: s.videoMotionPrompt,
          audioDescription: s.audioDescription,
          durationSeconds: s.durationSeconds,
          mood: s.mood,
          imageQualityTokens: s.imageQualityTokens,
          videoQualityTokens: s.videoQualityTokens,
          editDirections: (s as any).editDirections || undefined,
        }));
        overallMusicPrompt = llmResult.overallMusicPrompt || '';
        characterDescriptions = llmResult.characterDescriptions || {};
        colorPalette = llmResult.colorPalette || [];
        environmentNotes = llmResult.environmentNotes || '';
        globalEditDirections = (llmResult as any).globalEditDirections || undefined;

        console.log(`[export-for-editron] LLM parsed ${scenes.length} scenes`);
      } catch (llmError: any) {
        console.warn('[export-for-editron] LLM parsing failed, falling back to regex:', llmError.message);
        // Fall through to regex parsing below
      }
    }

    // ─── Fallback: regex-based parsing ─────────────────────────
    if (!scenes || scenes.length === 0) {
      console.log('[export-for-editron] Using regex parser (fallback)');

      if (blocks && Array.isArray(blocks) && blocks.length > 0) {
        if (hasTimestampedScenes(rawContent)) {
          scenes = convertPlainTextToScenes(rawContent);
        } else {
          scenes = convertThinkForgeBlocksToScenes(blocks);
        }
      } else if (cir && cir.sections) {
        scenes = convertCIRToScenes(cir);
      } else {
        scenes = convertPlainTextToScenes(rawContent);
      }
    }

    if (!scenes || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No scenes could be extracted from the script' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      title,
      scenes,
      sceneCount: scenes.length,
      totalDurationSeconds: scenes.reduce((sum, s) => sum + s.durationSeconds, 0),
      overallMusicPrompt,
      characterDescriptions,
      colorPalette,
      environmentNotes,
      globalEditDirections,
      rawContent: rawContent.substring(0, 5000),
    });
  } catch (error: any) {
    console.error('[export-for-editron] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to export script' },
      { status: 500 },
    );
  }
}
