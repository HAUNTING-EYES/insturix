/**
 * POST /api/services/thinkforge/script/export-for-editron
 *
 * Export a ThinkForge script as SceneDescriptors for Editron.
 * Reads the script from ThinkForge DB and converts blocks → scenes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  convertThinkForgeBlocksToScenes,
  convertPlainTextToScenes,
  convertCIRToScenes,
  hasTimestampedScenes,
} from '@/lib/pipeline/script-to-scenes';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, scriptId, blocks, plainText, cir } = body;

    let scenes;
    let title = 'Untitled Script';
    let rawContent = '';

    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      // Reconstruct plain text from blocks (use provided plainText if available,
      // as it preserves markdown formatting that block reconstruction loses)
      const reconstructedText = (plainText && typeof plainText === 'string')
        ? plainText
        : blocks
            .map((b: any) =>
              (b.content || []).map((n: any) => n.text || '').join(''),
            )
            .join('\n');
      rawContent = reconstructedText;

      // If the script uses timestamped format (00:00 - 00:15 | Scene Title),
      // prefer the timestamped parser — it understands Visuals/Audio/Voiceover
      // sections, extracts correct durations from timestamps, and separates
      // visual/audio/narration content properly.
      if (hasTimestampedScenes(reconstructedText)) {
        scenes = convertPlainTextToScenes(reconstructedText);
      } else {
        scenes = convertThinkForgeBlocksToScenes(blocks);
      }

      const firstHeader = blocks.find((b: any) => b.kind === 'header');
      if (firstHeader) {
        const text = firstHeader.content
          ?.map((n: any) => n.text || '')
          .join('')
          .trim();
        if (text) title = text;
      }
    } else if (cir && cir.sections) {
      // CIR document input
      scenes = convertCIRToScenes(cir);
      title = cir.title || 'Untitled Script';
      rawContent = JSON.stringify(cir);
    } else if (plainText && typeof plainText === 'string') {
      // Plain text input
      scenes = convertPlainTextToScenes(plainText);
      const firstLine = plainText.split('\n')[0]?.replace(/^#+\s*/, '').trim();
      if (firstLine) title = firstLine.substring(0, 100);
      rawContent = plainText;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Provide one of: blocks (ThinkForgeBlock[]), plainText (string), or cir (CIRDocument)',
        },
        { status: 400 },
      );
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
      rawContent: rawContent.substring(0, 5000), // cap for response size
    });
  } catch (error: any) {
    console.error('[export-for-editron] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to export script' },
      { status: 500 },
    );
  }
}
