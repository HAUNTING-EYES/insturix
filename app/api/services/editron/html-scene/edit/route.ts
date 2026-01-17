import { NextRequest, NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, overlayId, currentHtml, editPrompt, width, height } = await request.json();

    if (!projectId || !overlayId || !currentHtml || !editPrompt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const safeWidth = width || 1920;
    const safeHeight = height || 1080;

    // Initialize the model
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.5, // Slightly lower for more faithful edits
    });

    const systemPrompt = `You are an expert HTML/CSS editor. You will receive existing HTML code and an edit request.
Your task is to modify the HTML according to the user's instructions while preserving the overall structure and functionality.

**CANVAS**: ${safeWidth}×${safeHeight}px

**CRITICAL RULES**:
1. Return ONLY the modified HTML. NO markdown fences. NO explanations.
2. Preserve the outer wrapper structure (position:absolute; inset:0; width:100%; height:100%;)
3. Do NOT use viewport units (vw, vh) - use % or px instead
4. Keep animations and interactive elements working
5. Make targeted changes based on the user's request
6. Maintain the same level of quality and polish

**OUTPUT**: Just the raw HTML string starting with <`;

    const result = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`
CURRENT HTML:
${currentHtml}

EDIT REQUEST:
${editPrompt}

Return the modified HTML:`)
    ]);

    const newHtml = (result.content as string).replace(/```html/g, '').replace(/```/g, '').trim();

    // Update the overlay in the database
    await projectService.updateOverlay(userId, projectId, overlayId, {
      content: newHtml,
    } as any);

    return NextResponse.json({ 
      success: true, 
      newHtml,
      message: 'HTML scene updated successfully' 
    });

  } catch (error: any) {
    console.error('HTML Scene Edit Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to edit HTML scene' 
    }, { status: 500 });
  }
}
