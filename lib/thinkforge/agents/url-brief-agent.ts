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
import {
    fetchThinkForgeUrlDocument,
    UrlIngestionError,
} from '@/lib/thinkforge/security/url-ingestion-gateway';

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

const MAX_EXTRACTED_BODY_CHARACTERS = 48_000;

function hostnameMatches(hostname: string, domain: string): boolean {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Detect the platform from a URL */
function detectPlatform(url: string): { platform: string; contentType: ExtractedContent['contentType'] } {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    if (hostnameMatches(hostname, 'youtube.com') || hostnameMatches(hostname, 'youtu.be')) return { platform: 'YouTube', contentType: 'video' };
    if (hostnameMatches(hostname, 'tiktok.com')) return { platform: 'TikTok', contentType: 'video' };
    if (hostnameMatches(hostname, 'instagram.com')) return { platform: 'Instagram', contentType: 'social_post' };
    if (hostnameMatches(hostname, 'twitter.com') || hostnameMatches(hostname, 'x.com')) return { platform: 'X / Twitter', contentType: 'social_post' };
    if (hostnameMatches(hostname, 'linkedin.com')) return { platform: 'LinkedIn', contentType: 'social_post' };
    if (hostnameMatches(hostname, 'medium.com')) return { platform: 'Medium', contentType: 'article' };
    if (hostnameMatches(hostname, 'substack.com')) return { platform: 'Substack', contentType: 'article' };
    if (hostnameMatches(hostname, 'reddit.com')) return { platform: 'Reddit', contentType: 'social_post' };
    if (hostnameMatches(hostname, 'spotify.com') || hostnameMatches(hostname, 'podcasts.apple.com')) return { platform: 'Podcast', contentType: 'podcast' };
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

function extractReadableBody(source: string): string {
    const articleMatch = source.match(/<article[\s\S]*?<\/article>/i);
    const mainMatch = source.match(/<main[\s\S]*?<\/main>/i);
    const bodyMatch = source.match(/<body[\s\S]*?<\/body>/i);
    return stripHtml(articleMatch?.[0] ?? mainMatch?.[0] ?? bodyMatch?.[0] ?? source)
        .slice(0, MAX_EXTRACTED_BODY_CHARACTERS);
}

/** Main extraction function */
export async function extractUrlContent(url: string): Promise<ExtractedContent> {
    const document = await fetchThinkForgeUrlDocument(url);
    const { platform, contentType } = detectPlatform(document.finalUrl);
    const title = extractTitle(document.text);
    const description = extractMeta(document.text, 'og:description') || extractMeta(document.text, 'description');
    const bodyText = platform === 'YouTube' ? description : extractReadableBody(document.text);
    if (!bodyText && !description) throw new UrlIngestionError('content_unavailable');

    return {
        url: document.requestedUrl,
        title: title || new URL(document.finalUrl).hostname,
        description,
        bodyText: bodyText || description,
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
