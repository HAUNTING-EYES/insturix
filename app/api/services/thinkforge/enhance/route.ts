import { NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createThinkForgeModel } from '@/lib/thinkforge/agents/model-factory';
import { auth } from '@clerk/nextjs/server';
import { checkCredits } from '@/lib/services/creditsMiddleware';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
        return new NextResponse('Prompt is required', { status: 400 });
    }

    // Check and deduct credits for generation
    const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message');
    if (!creditCheck.allowed) {
        return creditCheck.errorResponse || new NextResponse('Insufficient credits', { status: 402 });
    }

    try {
        await creditCheck.deduct();

        const model = createThinkForgeModel('gemini-2.5-flash');

        // Stream back enhanced prompt
        const result = streamText({
            model,
            system: "You are an expert creative director and YouTube producer. The user will give you a very short, generic idea or niche. Your job is to return a highly detailed, exciting, and specific 2-3 sentence video concept. Do not include any conversational filler (no 'Here is an idea:'). Just return the enhanced prompt directly. Make it cinematic, trendy, and highly specific. Do not use quotes.",
            prompt,
            temperature: 0.8,
        });

        return result.toTextStreamResponse();
    } catch (error: any) {
        await creditCheck.refund(error?.message || 'Enhance failed');
        console.error('Enhance error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
