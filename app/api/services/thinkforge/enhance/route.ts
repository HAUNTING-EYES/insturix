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
import {
    describeThinkForgeAuthoringDeliverable,
    ThinkForgeAuthoringRequestSchema,
    type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';

export const maxDuration = 30;

function artifactContract(request: ThinkForgeAuthoringRequest): string {
    const outputKind = request.contentContract.outputKind;
    if (outputKind === 'social_post') {
        return 'Expand toward a written social post brief. Define the audience tension, angle, credible support, voice, and intended response. Do not introduce scenes, shots, narration, or video production.';
    }
    if (outputKind === 'carousel') {
        return `Expand toward a ${request.contentContract.carouselSlideCount}-slide carousel brief. Define one coherent narrative progression and what each stage must accomplish. Preserve the exact slide count; do not convert it into a video or single post.`;
    }
    return 'Expand toward a video-script brief. Define the narrative spine, audience tension, credible support, and visual-verbal relationship. Preserve the requested runtime when supplied; do not write the final script.';
}

export async function POST(req: NextRequest) {
    const { userId, orgId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { prompt, authoringRequest: requestInput } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
        return new NextResponse('Prompt is required', { status: 400 });
    }
    const parsedAuthoringRequest = ThinkForgeAuthoringRequestSchema.safeParse(requestInput);
    if (!parsedAuthoringRequest.success) {
        return NextResponse.json({
            error: 'Invalid authoring request',
            code: 'invalid_authoring_request',
            details: parsedAuthoringRequest.error.flatten(),
        }, { status: 422 });
    }
    const authoringRequest = parsedAuthoringRequest.data;

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
        const system = `<role>You are a multi-format creative brief editor.</role>
<task>Expand the user's short input into a precise, specific 2-3 sentence creative brief for the authoritative destination in tf_untrusted_data. Preserve that artifact category exactly.</task>
<artifact_contract>${artifactContract(authoringRequest)}</artifact_contract>
<rules>
1. Preserve the user's subject, facts, constraints, language, and intent. Add no unsupported claims.
2. Increase specificity through audience, tension, angle, evidence needs, voice, and useful execution detail.
3. Never change the output kind, platform, publishing surface, runtime, carousel count, CTA policy, hashtag policy, or emoji policy supplied in tf_untrusted_data.
4. Do not include conversational filler, a preamble, quotes, or the final finished artifact.
</rules>
<output_format>2-3 sentence enhanced creative brief only.</output_format>`;
        const promptParts = buildIsolatedPromptParts({
            systemInstruction: system,
            data: {
                userPrompt: prompt,
                authoringDestination: {
                    deliverable: describeThinkForgeAuthoringDeliverable(authoringRequest),
                    authoringRequest,
                },
            },
            fieldLimits: { userPrompt: 8_000, deliverable: 300 },
            totalLimit: 12_000,
        });
        const privacy = assertProviderPromptAllowed({
            provider: modelRoute.provider,
            model: modelRoute.model,
            routePurpose,
            declaredPrivacyClass: privacyClass,
            prompt: promptParts.prompt,
            fieldsSent: ['userPrompt', 'authoringDestination'],
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
