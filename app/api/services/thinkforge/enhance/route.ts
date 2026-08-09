import { NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createThinkForgeModelForRoute, resolveThinkForgeProviderRoute } from '@/lib/thinkforge/agents/model-factory';
import { auth } from '@clerk/nextjs/server';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { readAiSdkUsage, recordThinkForgeDirectCost } from '@/lib/thinkforge/services/provider-cost-telemetry';
import { buildIsolatedPromptParts } from '@/lib/thinkforge/agents/prompt-boundary';
import { assertProviderPromptAllowed } from '@/lib/thinkforge/privacy/provider-privacy-gateway';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
    const { userId, orgId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
        return new NextResponse('Prompt is required', { status: 400 });
    }

    // P3.1: the active context at WORK-START decides who pays (stamped surfaces).
    const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());

    // Check and deduct credits for generation
    const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', undefined, billingWallet);
    if (!creditCheck.allowed) {
        return creditCheck.errorResponse || new NextResponse('Insufficient credits', { status: 402 });
    }

    try {
        await creditCheck.deduct();

        const routePurpose = 'creative_authoring';
        const privacyClass = 'business_confidential';
        const modelRoute = resolveThinkForgeProviderRoute({ routePurpose, privacyClass });
        const model = createThinkForgeModelForRoute({
            routePurpose,
            privacyClass,
            preferredProvider: modelRoute.provider,
            modelName: modelRoute.model,
        });
        const system = "<role>You are an expert creative director and YouTube producer.</role>\n<task>The user will give you a very short, generic idea or niche. Return a highly detailed, exciting, and specific 2-3 sentence video concept. Make it cinematic, trendy, and highly specific.</task>\n<rules>\n1. Do not include any conversational filler (no 'Here is an idea:')\n2. Just return the enhanced prompt directly\n3. Do not use quotes\n</rules>\n<output_format>2-3 sentence detailed video concept. No preamble, no quotes, no filler - just the concept.</output_format>";
        const promptParts = buildIsolatedPromptParts({
            systemInstruction: system,
            data: { userPrompt: prompt },
            fieldLimits: { userPrompt: 8_000 },
            totalLimit: 8_000,
        });
        const privacy = assertProviderPromptAllowed({
            provider: modelRoute.provider,
            model: modelRoute.model,
            routePurpose,
            declaredPrivacyClass: privacyClass,
            prompt: promptParts.prompt,
            fieldsSent: ['userPrompt'],
        });
        console.info('[ThinkForgePrivacy] Provider prompt approved', privacy.audit);
        const startedAt = Date.now();

        // Stream back enhanced prompt
        const result = streamText({
            model,
            system: promptParts.systemInstruction,
            prompt: privacy.prompt,
            temperature: 0.8,
            onFinish: async ({ text, usage, finishReason }) => {
                await recordThinkForgeDirectCost({
                    status: 'success',
                    action: 'prompt_enhance',
                    route: 'app/api/services/thinkforge/enhance',
                    provider: modelRoute.provider,
                    modelName: modelRoute.model,
                    operation: 'llm_stream_direct',
                    userId,
                    promptChars: promptParts.systemInstruction.length + privacy.prompt.length,
                    outputChars: text?.length,
                    functionMs: Date.now() - startedAt,
                    usage: await readAiSdkUsage(usage),
                    routePurpose,
                    privacyClass: privacy.audit.privacyClass,
                    temperature: 0.8,
                    sourceKind: 'prompt_panel_enhance',
                    finishReason,
                });
            },
        });
        return result.toTextStreamResponse();
    } catch (error: any) {
        await creditCheck.refund(error?.message || 'Enhance failed');
        console.error('Enhance error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
