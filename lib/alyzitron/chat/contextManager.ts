import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMessageDoc } from "../dbUtils";

// Gemini 1.5 Flash context: ~1M tokens. We use a conservative budget.
// For chat, we budget:
//   - System prompt (video analysis + transcript): ~8,000 tokens
//   - Conversation window: ~8,000 tokens
//   - Response buffer: ~2,000 tokens
// Total safe budget: ~18,000 tokens

export const CONTEXT_CONFIG = {
  maxConversationTokens: 8_000,
  summarizationThreshold: 0.5, // Summarize when at 50% of budget
  recentMessagesToKeep: 6,     // Always keep last N messages verbatim
  estimatedTokensPerChar: 0.25, // ~4 chars per token (conservative)
};

/**
 * Rough token estimator (no tokenizer dependency needed).
 * ~4 chars = 1 token for English. Adjust if multilingual.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * CONTEXT_CONFIG.estimatedTokensPerChar);
}

export function estimateMessageTokens(msg: ChatMessageDoc): number {
  // Role label overhead (~5 tokens) + content
  return 5 + estimateTokens(msg.content);
}

export function estimateConversationTokens(messages: ChatMessageDoc[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

/**
 * Determines if summarization is needed.
 */
export function needsSummarization(messages: ChatMessageDoc[]): boolean {
  const tokens = estimateConversationTokens(messages);
  const threshold =
    CONTEXT_CONFIG.maxConversationTokens * CONTEXT_CONFIG.summarizationThreshold;
  return tokens > threshold;
}

/**
 * Splits messages into "to summarize" and "to keep verbatim".
 * Always keeps the last N messages verbatim for coherence.
 */
export function splitMessagesForSummarization(messages: ChatMessageDoc[]): {
  toSummarize: ChatMessageDoc[];
  toKeep: ChatMessageDoc[];
} {
  const keepCount = Math.min(
    CONTEXT_CONFIG.recentMessagesToKeep,
    messages.length
  );
  const toSummarize = messages.slice(0, messages.length - keepCount);
  const toKeep = messages.slice(messages.length - keepCount);
  return { toSummarize, toKeep };
}

/**
 * Generate a rolling summary of older messages using Gemini.
 * If there's an existing summary, it's rolled in.
 */
export async function summarizeMessages(
  messagesToSummarize: ChatMessageDoc[],
  existingSummary: string | null,
  videoTitle?: string
): Promise<string> {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY!,
    maxOutputTokens: 512,
    temperature: 0.2,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  });

  const conversationText = messagesToSummarize
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const existingContext = existingSummary
    ? `Previously summarized context:\n${existingSummary}\n\n`
    : "";

  const prompt = `<role>You are a conversation summarizer for video analysis discussions.</role>
<task>Summarize the conversation about a video${videoTitle ? ` titled "${videoTitle}"` : ""}.</task>
<rules>
1. Preserve all key questions asked and answers given
2. Note any specific timestamps, speakers, or data points referenced
3. Capture the user's areas of interest or confusion
4. Write in third-person ("The user asked about...", "The assistant explained...")
5. No longer than 300 words
</rules>
<output_format>A single concise, information-dense summary paragraph or short set of paragraphs.</output_format>
<input_data>
${existingContext}New conversation to incorporate into the summary:
${conversationText}
</input_data>

Summary:`;

  const response = await llm.invoke(prompt);
  return response.content as string;
}

/**
 * Build the final messages array to send to the LLM.
 * If summarization exists, prepends it as a system context message.
 * Includes only the recent verbatim messages.
 */
export function buildConversationWindow(
  allMessages: ChatMessageDoc[],
  existingSummary: string | null,
  summarizedUpToIndex: number
): { role: string; content: string }[] {
  const recentMessages = allMessages.slice(summarizedUpToIndex);
  const result: { role: string; content: string }[] = [];

  // Inject summary as a special context block before recent messages
  if (existingSummary) {
    result.push({
      role: "user",
      content: `[CONVERSATION CONTEXT - Earlier discussion summary]\n${existingSummary}`,
    });
    result.push({
      role: "assistant",
      content:
        "Understood. I have the context of our earlier discussion and will continue from there.",
    });
  }

  // Add recent verbatim messages
  for (const msg of recentMessages) {
    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}