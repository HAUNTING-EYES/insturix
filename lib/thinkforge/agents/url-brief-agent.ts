/**
 * URL Brief Agent - Extracts structured brief from URL content
 * 
 * Purpose: Analyze scraped web content and produce a structured brief
 * that can be used to generate content ideas and scripts.
 * 
 * Key rules:
 * - Pure structured output (no streaming)
 * - Stateless and replaceable
 * - No persistence assumptions
 * 
 * The agent only knows: extracted page content in → reasoning → structured brief out
 */

import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';
import { assertSafeAssetUrl } from '@/lib/shared/safe-asset-url';

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

export const UrlBriefSchema = z.object({
    title: z.string().describe('Cleaned, concise content title'),
    summary: z.string().describe('2-3 sentence summary of the content'),
    keyTopics: z.array(z.string()).min(2).max(6).describe('Main themes or topics (3-5 items)'),
    targetAudience: z.string().describe('Who this content is for'),
    suggestedAngles: z.array(z.string()).min(2).max(5).describe('3-4 content angles to explore for repurposing'),
    platform: z.string().describe('Detected source platform (e.g. YouTube, Medium, Twitter, Blog)'),
    contentType: z.enum(['video', 'article', 'social_post', 'podcast', 'other']).describe('Type of the source content'),
});

export type UrlBriefOutput = z.infer<typeof UrlBriefSchema>;

// =============================================================================
// URL CONTENT EXTRACTION (server-side only)
// =============================================================================

interface ExtractedContent {
    url: string;
    title: string;
    description: string;
    bodyText: string;
    platform: string;
    contentType: 'video' | 'article' | 'social_post' | 'podcast' | 'other';
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 2_000_000;

async function fetchSafePage(rawUrl: string): Promise<Response> {
    let currentUrl = new URL(rawUrl);
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        await assertSafeAssetUrl(currentUrl.toString());
        const response = await fetch(currentUrl, {
            redirect: 'manual',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThinkForge/1.0)' },
        });
        if (response.status < 300 || response.status >= 400) return response;

        const location = response.headers.get('location');
        if (!location || redirectCount === MAX_REDIRECTS) {
            throw new Error('URL redirect limit reached or redirect target was unavailable');
        }
        currentUrl = new URL(location, currentUrl);
    }
    throw new Error('URL redirect limit reached');
}

async function readPageText(response: Response): Promise<string> {
    const declaredLength = Number(response.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
        throw new Error(`URL response exceeds the ${MAX_HTML_BYTES} byte limit`);
    }
    if (!response.body) return '';

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_HTML_BYTES) {
                await reader.cancel('response_too_large');
                throw new Error(`URL response exceeds the ${MAX_HTML_BYTES} byte limit`);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
}

/** Detect the platform from a URL */
function detectPlatform(url: string): { platform: string; contentType: ExtractedContent['contentType'] } {
    const u = url.toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return { platform: 'YouTube', contentType: 'video' };
    if (u.includes('tiktok.com')) return { platform: 'TikTok', contentType: 'video' };
    if (u.includes('instagram.com')) return { platform: 'Instagram', contentType: 'social_post' };
    if (u.includes('twitter.com') || u.includes('x.com')) return { platform: 'X / Twitter', contentType: 'social_post' };
    if (u.includes('linkedin.com')) return { platform: 'LinkedIn', contentType: 'social_post' };
    if (u.includes('medium.com')) return { platform: 'Medium', contentType: 'article' };
    if (u.includes('substack.com')) return { platform: 'Substack', contentType: 'article' };
    if (u.includes('reddit.com')) return { platform: 'Reddit', contentType: 'social_post' };
    if (u.includes('spotify.com') || u.includes('podcasts.apple.com')) return { platform: 'Podcast', contentType: 'podcast' };
    return { platform: 'Web', contentType: 'article' };
}

/** Strip HTML tags and extract clean text */
function stripHtml(html: string): string {
    // Remove script and style blocks entirely
    let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
    clean = clean.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    clean = clean.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    clean = clean.replace(/<header[\s\S]*?<\/header>/gi, '');
    clean = clean.replace(/<aside[\s\S]*?<\/aside>/gi, '');
    // Remove all remaining tags
    clean = clean.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    clean = clean.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    // Collapse whitespace
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
}

/** Extract meta tag content from HTML */
function extractMeta(html: string, nameOrProperty: string): string {
    // Try property= first (OpenGraph), then name=
    const propMatch = html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${nameOrProperty}["'][^>]+content=["']([^"']+)["']`, 'i')
    );
    if (propMatch) return propMatch[1];
    // Try reverse attribute order (content before property)
    const reverseMatch = html.match(
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${nameOrProperty}["']`, 'i')
    );
    return reverseMatch ? reverseMatch[1] : '';
}

/** Extract title from HTML */
function extractTitle(html: string): string {
    const ogTitle = extractMeta(html, 'og:title');
    if (ogTitle) return ogTitle;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : '';
}

/** Fetch and extract content from a YouTube URL */
async function extractYouTubeContent(url: string): Promise<Partial<ExtractedContent>> {
    try {
        // Use oEmbed for the canonical video title.
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });

        let title = '';
        if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            title = oembed.title || '';
        }

        // Also fetch the page for description
        const pageRes = await fetchSafePage(url);

        let description = '';
        let bodyText = '';
        if (pageRes.ok) {
            const html = await readPageText(pageRes);
            description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
            if (!title) title = extractTitle(html);
            // For YouTube, the description IS the main content
            bodyText = description;
        }

        return { title, description, bodyText };
    } catch {
        return {};
    }
}

/** Fetch and extract content from a generic URL */
async function extractGenericContent(url: string): Promise<Partial<ExtractedContent>> {
    try {
        const res = await fetchSafePage(url);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = await readPageText(res);
        const title = extractTitle(html);
        const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');

        // Extract main body text (first ~3000 chars)
        // Try to find <main> or <article> content first
        let bodyHtml = '';
        const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
        const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);

        if (articleMatch) {
            bodyHtml = articleMatch[0];
        } else if (mainMatch) {
            bodyHtml = mainMatch[0];
        } else {
            // Fallback: use <body>
            const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
            bodyHtml = bodyMatch ? bodyMatch[0] : html;
        }

        const bodyText = stripHtml(bodyHtml).slice(0, 3000);

        return { title, description, bodyText };
    } catch {
        return {};
    }
}

/** Main extraction function */
export async function extractUrlContent(url: string): Promise<ExtractedContent> {
    await assertSafeAssetUrl(url);
    const { platform, contentType } = detectPlatform(url);

    let extracted: Partial<ExtractedContent> = {};

    if (platform === 'YouTube') {
        extracted = await extractYouTubeContent(url);
    } else {
        extracted = await extractGenericContent(url);
    }

    return {
        url,
        title: extracted.title || 'Untitled',
        description: extracted.description || '',
        bodyText: extracted.bodyText || extracted.description || '',
        platform,
        contentType,
    };
}

// =============================================================================
// AGENT
// =============================================================================

/**
 * URL Brief Agent - extends StructuredAgent for structured brief generation
 * from extracted URL content.
 * 
 * Stateless and pure. Takes extracted page content and produces a structured brief.
 */
export class UrlBriefAgent extends StructuredAgent<UrlBriefOutput> {
    protected schema = UrlBriefSchema;

    constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
        super({
            ...config,
            agentType: 'url_brief',
            temperature: config?.temperature ?? 0.6,
            maxTokens: config?.maxTokens ?? 2000,
        });
    }

    private buildTrustedInstruction(): string {
        // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
        return `<role>You are a content analyst generating structured briefs for content creation.</role>

<task>Analyze the web content below and extract a structured brief for repurposing.</task>

<rules>
- Extract the core message and key themes.
- Identify the target audience.
- Suggest 3-4 unique, specific, actionable angles for repurposing (videos, threads, posts).
- Detect source platform and content type accurately.
- Summary: 2-3 concise sentences.
- Key topics: exactly 3-5 specific keywords/themes. NEVER more than 5. Not generic categories.
</rules>

<runtime_data_contract>
Read the source URL, page title, and extracted page content only from tf_untrusted_data.data.
</runtime_data_contract>`;
    }

    buildPrompt(input: AgentInput): string {
        const parts = this.buildPromptParts(input);
        return `${parts.systemInstruction}\n\n${parts.prompt}`;
    }

    buildPromptParts({ context, userPrompt }: AgentInput): IsolatedPromptParts {
        return buildIsolatedPromptParts({
            systemInstruction: this.applyGlobalConstraints(this.buildTrustedInstruction()),
            data: {
                sourceUrl: context.projectSummary || null,
                pageTitle: userPrompt,
                pageContent: context.currentScript || null,
            },
            fieldLimits: {
                sourceUrl: 8_000,
                pageTitle: 8_000,
                pageContent: 48_000,
            },
        });
    }

    /**
     * Generate a brief from extracted URL content
     */
    async generateBrief(content: ExtractedContent): Promise<UrlBriefOutput> {
        const input: AgentInput = {
            context: {
                projectSummary: content.url,
                currentScript: `Title: ${content.title}\nDescription: ${content.description}\n\nBody:\n${content.bodyText}`,
            },
            userPrompt: content.title,
        };

        const { result } = await this.runStructured(input);

        // Override platform and contentType with our detected values (more reliable)
        return {
            ...result,
            platform: content.platform,
            contentType: content.contentType,
        };
    }
}

/**
 * Factory function for creating UrlBriefAgent instances
 */
export function createUrlBriefAgent(
    config?: Partial<Omit<AgentConfig, 'agentType'>>
): UrlBriefAgent {
    return new UrlBriefAgent(config);
}
