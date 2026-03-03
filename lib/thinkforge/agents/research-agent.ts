/**
 * Research Agent - Web-grounded research and trend discovery
 * 
 * Purpose: Perform live Google searches to find trends, examples,
 * references, meme hooks, and sources relevant to the user's query.
 * 
 * Uses Gemini's built-in Search Grounding (no extra API keys needed).
 * Uses generateText (non-streaming) to access grounding metadata,
 * then streams the verified response to the chat.
 * 
 * Key rules:
 * - Extract VERIFIED sources from grounding metadata (never trust inline URLs)
 * - Structure output with trends, ideas, examples, and references
 * - Stateless and pure (no DB calls)
 */

import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { SessionState, ProjectMeta } from '../state/types';

// ─────────────────────────────────────────────────────────────────────
// Provider with Search Grounding
// ─────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) {
        throw new Error(
            'No Google AI API key found. Set one of: GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
        );
    }
    return key;
}

let cachedSearchProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

function getSearchProvider(): ReturnType<typeof createGoogleGenerativeAI> {
    if (!cachedSearchProvider) {
        cachedSearchProvider = createGoogleGenerativeAI({ apiKey: getApiKey() });
    }
    return cachedSearchProvider;
}

function createSearchGroundedModel(): LanguageModel {
    const provider = getSearchProvider();
    return provider('gemini-2.5-flash') as LanguageModel;
}

// ─────────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `You are ThinkForge's Research Agent — an expert content strategist with live access to Google Search.

Your job is to research the user's query using real-time web data and return a structured, actionable report.

## Output Structure

Structure your response with these sections (use markdown headers):

### 🔍 Key Findings
A concise summary of what you found (2-3 sentences).

### 📈 Trends & Patterns
List current trends relevant to the query. Each trend should include:
- **Trend name** — brief description
- Why it's relevant
- Evidence from search results

### 💡 Ideas & Suggestions
Concrete, actionable ideas the user can apply. Be specific:
- Idea title — detailed explanation of the idea itself (not how to find it)
- How to execute it
- Inspiration source

### 🎯 Examples & References
Real-world examples. For each:
- **Title/Creator** — what it is
- Why it's relevant
- Platform and context

## CRITICAL RULES FOR SOURCES
- YOU MUST PULL REAL, ACCURATE LINKS FROM YOUR WEB SEARCH. Do not return "N/A" or "Search YouTube".
- DO NOT fabricate, guess, or hallucinate any URLs. If you provide a link, it must be the exact URL from your search results.
- Include these real links directly in your response so the user can easily click them.
- Be specific and actionable, not generic.
- Focus on the content creation angle (this is a creative tool for video scripts, social media content, etc.).
- If the query is about a specific platform (YouTube, Instagram, TikTok), tailor advice to that platform.
- Use current data — the user wants to know what's happening NOW.
- Keep it concise but thorough. Quality over quantity.`;

// ─────────────────────────────────────────────────────────────────────
// Grounding Metadata Extraction
// ─────────────────────────────────────────────────────────────────────

interface GroundingSource {
    title: string;
    url: string;
}

/**
 * Extract verified sources from the Gemini grounding metadata.
 * These are URLs that Google Search actually returned — not hallucinated.
 */
function extractGroundingSources(response: any): GroundingSource[] {
    const sources: GroundingSource[] = [];
    const seen = new Set<string>();

    try {
        // The grounding metadata is in the response's providerMetadata
        const providerMeta = response?.experimental_providerMetadata ?? response?.providerMetadata;
        const googleMeta = providerMeta?.google;

        if (!googleMeta) {
            console.log('[ResearchAgent] No Google provider metadata found');
            return sources;
        }

        // Extract from groundingMetadata.groundingChunks
        const groundingMeta = googleMeta.groundingMetadata;
        if (groundingMeta?.groundingChunks) {
            for (const chunk of groundingMeta.groundingChunks) {
                const web = chunk?.web;
                if (web?.uri && web?.title && !seen.has(web.uri)) {
                    seen.add(web.uri);
                    sources.push({ title: web.title, url: web.uri });
                }
            }
        }

        // Also check groundingSupports for additional references
        if (groundingMeta?.groundingSupports) {
            for (const support of groundingMeta.groundingSupports) {
                if (support?.groundingChunkIndices) {
                    // These reference the chunks above, already extracted
                }
            }
        }

        // Also check webSearchQueries for debug info
        if (groundingMeta?.webSearchQueries && process.env.NODE_ENV === 'development') {
            console.log('[ResearchAgent] Search queries used:', groundingMeta.webSearchQueries);
        }

        console.log(`[ResearchAgent] Extracted ${sources.length} grounding sources`);
    } catch (err) {
        console.error('[ResearchAgent] Error extracting grounding sources:', err);
    }

    return sources;
}

/**
 * Format grounding sources as a markdown section
 */
function formatSourcesSection(sources: GroundingSource[]): string {
    if (sources.length === 0) return '';

    const sourceLines = sources
        .slice(0, 10) // Cap at 10 sources
        .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
        .join('\n');

    return `\n\n---\n\n### 🔗 Verified Sources\n*These links are verified from Google Search results:*\n\n${sourceLines}`;
}

// ─────────────────────────────────────────────────────────────────────
// Research Agent
// ─────────────────────────────────────────────────────────────────────

export interface ResearchAgentOptions {
    sessionState: SessionState;
    project?: ProjectMeta | null;
}

/**
 * Run the research agent.
 * Uses generateText (non-streaming) to access grounding metadata,
 * then returns the full response with verified sources appended.
 */
export async function runResearchAgent(
    prompt: string,
    options: ResearchAgentOptions,
    abortSignal?: AbortSignal
): Promise<{ text: string; sources: GroundingSource[] }> {
    const { sessionState, project } = options;

    // Build context-aware prompt
    const projectContext = project
        ? `\n\nProject context:\n- Name: ${(project as any).projectName || project.sessionName || 'Unknown'}\n- Platform: ${project.platform || 'Unknown'}\n- Style: ${project.style || 'Unknown'}\n- Tone: ${project.tone || 'Unknown'}`
        : '';

    const chatHistory = sessionState.chat?.length
        ? `\n\nRecent conversation:\n${sessionState.chat
            .slice(-6)
            .map((m: any) => `${m.role}: ${m.content}`)
            .join('\n')}`
        : '';

    const fullPrompt = `${RESEARCH_SYSTEM_PROMPT}${projectContext}${chatHistory}\n\n## User Research Query\n${prompt}`;

    const model = createSearchGroundedModel();

    console.log('[ResearchAgent] Starting search-grounded generation for:', prompt.substring(0, 80));

    const provider = getSearchProvider();

    const result = await generateText({
        model,
        prompt: fullPrompt,
        temperature: 0.4,
        maxOutputTokens: 4096,
        abortSignal,
        tools: {
            google_search: provider.tools.googleSearch({}),
        },
    });

    // Extract verified sources from grounding metadata
    const sources = extractGroundingSources(result);

    // Append verified sources section to the response
    const sourcesSection = formatSourcesSection(sources);
    const finalText = result.text + sourcesSection;

    console.log(`[ResearchAgent] Generation complete. Text length: ${result.text.length}, Sources: ${sources.length}`);

    return { text: finalText, sources };
}
