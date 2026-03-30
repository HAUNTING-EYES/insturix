import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractSubjectsFromScenes, isLLMParserAvailable } from '@/lib/pipeline/llm-scene-parser';

export const runtime = 'nodejs';
export const maxDuration = 120; // Gemini 2.5 Flash structured output can take 40-60s

/**
 * POST /api/services/pipeline/reference-images/extract-subjects
 * Uses LLM to identify key visual subjects from parsed scenes.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isLLMParserAvailable()) {
      return NextResponse.json({ error: 'LLM parser not available' }, { status: 503 });
    }

    const { scenes, artStyle } = await req.json();
    if (!scenes?.length) {
      return NextResponse.json({ error: 'scenes array required' }, { status: 400 });
    }

    const result = await extractSubjectsFromScenes(scenes, { artStyle });

    return NextResponse.json({
      success: true,
      subjects: result.subjects,
      subjectCount: result.subjects.length,
    });
  } catch (error: any) {
    console.error('[extract-subjects] Error:', error.message, error.stack?.substring(0, 300));

    // If LLM fails, return empty subjects rather than 500 — the pipeline can continue
    // without reference images (storyboard gen uses visualDescription directly)
    if (error.message?.includes('Gemini') || error.message?.includes('generate') || error.message?.includes('parse')) {
      console.warn('[extract-subjects] LLM extraction failed, returning empty subjects');
      return NextResponse.json({
        success: true,
        subjects: [],
        subjectCount: 0,
        warning: 'Subject extraction failed — you can add reference images manually.',
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
