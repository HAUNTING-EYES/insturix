import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createUrlBriefAgent, extractUrlContent } from '@/lib/thinkforge/agents/url-brief-agent';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { CreditsMigrationService } from '@/lib/services/creditsMigrationService';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * URL-to-Brief endpoint
 * Accepts a URL, extracts content, and generates a structured brief
 * for content ideation.
 */
export async function POST(req: Request) {
    const { userId, orgId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    let url: string = '';
    try {
        const body = await req.json();
        url = String(body?.url || '').trim();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!url) {
        return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Ensure user exists and is migrated
    await CreditsMigrationService.ensureMigrated(userId);

    // P3.1: the active context at WORK-START decides who pays (stamped surfaces).
    const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());

    // Check and prepare credit deduction
    const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', undefined, billingWallet);
    if (!creditCheck.allowed) {
        return creditCheck.errorResponse;
    }

    try {
        // Deduct credits before processing
        await creditCheck.deduct();

        // Step 1: Extract content from URL
        const extracted = await extractUrlContent(url);

        if (!extracted.bodyText && !extracted.description) {
            // Refund if we couldn't extract anything useful
            await creditCheck.refund('No content extracted from URL');
            return NextResponse.json(
                { error: 'Could not extract content from this URL. The page may be behind a login wall or require JavaScript.' },
                { status: 422 }
            );
        }

        // Step 2: Generate brief using the agent
        const agent = createUrlBriefAgent();
        const brief = await agent.generateBrief(extracted);

        return NextResponse.json({ brief });
    } catch (error: any) {
        // Refund on failure
        await creditCheck.refund(error?.message || 'URL brief generation failed');

        console.error('Error in url-brief endpoint:', error);
        return NextResponse.json(
            { error: 'Failed to generate brief', details: error?.message },
            { status: 500 }
        );
    }
}
