import { NextRequest, NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { projectService } from '@/lib/editron/services/project-service';
import { readProjectRevisionV1 } from '@/lib/editron/services/project-revision-v1';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, overlayId, currentHtml, editPrompt, width, height } = await request.json();

    const validOverlayId = (typeof overlayId === 'number'
      && Number.isSafeInteger(overlayId)
      && overlayId >= 0)
      || (typeof overlayId === 'string'
        && overlayId === overlayId.trim()
        && overlayId.length > 0
        && overlayId.length <= 256);
    if (typeof projectId !== 'string' || !projectId.trim()
      || !validOverlayId
      || typeof currentHtml !== 'string' || !currentHtml
      || typeof editPrompt !== 'string' || !editPrompt.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const expectedRevision = readProjectRevisionV1(project);
    if (!expectedRevision) {
      return NextResponse.json({ error: 'Project revision is unavailable' }, { status: 409 });
    }
    const overlay = project.overlays.find(
      (candidate: any) => candidate.id === overlayId,
    );
    if (!overlay) {
      return NextResponse.json({ error: 'HTML scene not found' }, { status: 404 });
    }
    if (overlay.type !== 'html-scene') {
      return NextResponse.json({ error: 'Target overlay is not an HTML scene' }, { status: 409 });
    }
    if (typeof overlay.content !== 'string' || overlay.content !== currentHtml) {
      return NextResponse.json({
        error: 'HTML scene changed; reload before editing',
        code: 'PROJECT_MUTATION_CONFLICT',
      }, { status: 409 });
    }

    const safeWidth = Number.isFinite(Number(overlay.width)) && Number(overlay.width) > 0
      ? Number(overlay.width)
      : (width || 1920);
    const safeHeight = Number.isFinite(Number(overlay.height)) && Number(overlay.height) > 0
      ? Number(overlay.height)
      : (height || 1080);

    // Initialize the model
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.5, // Slightly lower for more faithful edits
    });

    const systemPrompt = `<role>You are an expert HTML/CSS editor.</role>

<task>Modify the provided HTML code according to the user's edit request while preserving overall structure and functionality. Canvas: ${safeWidth}x${safeHeight}px.</task>

<rules>
1. Return ONLY the modified HTML. NO markdown fences. NO explanations.
2. Preserve the outer wrapper structure (position:absolute; inset:0; width:100%; height:100%;)
3. Do NOT use viewport units (vw, vh) - use % or px instead
4. Keep animations and interactive elements working
5. Make targeted changes based on the user's request
6. Maintain the same level of quality and polish
</rules>

<output_format>Raw HTML string only, starting with <. No markdown, no code fences, no explanations.</output_format>`;

    const result = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`
CURRENT HTML:
${overlay.content}

EDIT REQUEST:
${editPrompt}

Return the modified HTML:`)
    ]);

    if (typeof result.content !== 'string') {
      return NextResponse.json({ error: 'HTML editor returned non-text output' }, { status: 502 });
    }
    const newHtml = result.content.replace(/```html/gi, '').replace(/```/g, '').trim();
    if (!/^<[a-z][\s\S]*>/i.test(newHtml)) {
      return NextResponse.json({ error: 'HTML editor returned invalid markup' }, { status: 502 });
    }

    // Update the overlay in the database
    await projectService.updateOverlayAtRevisionV1(
      userId,
      projectId,
      {
        expectedRevision,
        actorKind: 'USER',
        overlayId,
        updates: { content: newHtml } as any,
      },
    );

    return NextResponse.json({ 
      success: true, 
      newHtml,
      message: 'HTML scene updated successfully' 
    });

  } catch (error: any) {
    if (error?.code === 'PROJECT_MUTATION_CONFLICT') {
      return NextResponse.json({
        error: 'Project changed while editing the HTML scene; reload and retry',
        code: error.code,
        currentRevision: error.currentRevision,
      }, { status: 409 });
    }
    console.error('HTML Scene Edit Error:', error);
    return NextResponse.json({ 
      error: 'Failed to edit HTML scene'
    }, { status: 500 });
  }
}
