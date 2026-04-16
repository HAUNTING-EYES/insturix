import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { ChatMessageDoc } from "@/lib/alyzitron";
import {
  buildConversationWindow,
  estimateConversationTokens,
  needsSummarization,
  splitMessagesForSummarization,
  summarizeMessages,
} from "./contextManager";
import { buildSystemPrompt, SystemPromptOptions } from "./systemPrompt";

export interface ChatEngineOptions {
  systemPromptOptions: SystemPromptOptions;
  existingSummary: string | null;
  summarizedUpToIndex: number;
  messages: ChatMessageDoc[]; // Full history from DB
  userMessage: string;
  videoTitle?: string;
}

export interface ChatEngineResult {
  assistantMessage: string;
  newSummary: string | null;
  newSummarizedUpToIndex: number;
  didSummarize: boolean;
  estimatedTokensUsed: number;
}

/**
 * Main chat engine.
 * 1. Checks if summarization is needed before sending.
 * 2. Builds system prompt with video analysis + transcript.
 * 3. Builds conversation window (summary + recent messages).
 * 4. Calls Gemini via LangChain.
 * 5. Returns response + updated summarization state.
 */
export async function runChatTurn(
  options: ChatEngineOptions
): Promise<ChatEngineResult> {
  const {
    systemPromptOptions,
    existingSummary,
    summarizedUpToIndex,
    messages,
    userMessage,
    videoTitle,
  } = options;

  let currentSummary = existingSummary;
  let currentSummarizedUpToIndex = summarizedUpToIndex;
  let didSummarize = false;

  // --- Step 1: Check if summarization is needed ---
  const unsummarizedMessages = messages.slice(summarizedUpToIndex);

  if (needsSummarization(unsummarizedMessages)) {
    const { toSummarize, toKeep } = splitMessagesForSummarization(unsummarizedMessages);

    if (toSummarize.length > 0) {
      currentSummary = await summarizeMessages(
        toSummarize,
        currentSummary,
        videoTitle
      );
      currentSummarizedUpToIndex = summarizedUpToIndex + toSummarize.length;
      didSummarize = true;
    }
  }

  // --- Step 2: Build system prompt ---
  const systemPromptText = buildSystemPrompt(systemPromptOptions);

  // --- Step 3: Build conversation window ---
  const conversationWindow = buildConversationWindow(
    messages,
    currentSummary,
    currentSummarizedUpToIndex
  );

  // --- Step 4: Build LangChain messages ---
  const langchainMessages: BaseMessage[] = [
    new SystemMessage(systemPromptText),
  ];

  for (const msg of conversationWindow) {
    if (msg.role === "user") {
      langchainMessages.push(new HumanMessage(msg.content));
    } else if (msg.role === "assistant") {
      langchainMessages.push(new AIMessage(msg.content));
    }
  }

  // Add the new user message
  langchainMessages.push(new HumanMessage(userMessage));

  // --- Step 5: Call Gemini ---
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY!,
    maxOutputTokens: 1024,
    temperature: 0.4,
    thinkingConfig: { thinkingBudget: 0 },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT" as any, threshold: "BLOCK_MEDIUM_AND_ABOVE" as any },
    ],
  });

  const response = await llm.invoke(langchainMessages);
  const assistantMessage = extractChunkText(response.content as string | unknown[]);

  // Estimate tokens used (rough)
  const estimatedTokensUsed =
    Math.ceil(systemPromptText.length * 0.25) +
    estimateConversationTokens([
      ...messages.slice(currentSummarizedUpToIndex),
      { role: "user", content: userMessage, timestamp: new Date() },
      { role: "assistant", content: assistantMessage, timestamp: new Date() },
    ]);

  return {
    assistantMessage,
    newSummary: currentSummary,
    newSummarizedUpToIndex: currentSummarizedUpToIndex,
    didSummarize,
    estimatedTokensUsed,
  };
}

/**
 * Streaming version — returns an async generator of text chunks.
 * Use with Server-Sent Events or streaming response in Next.js.
 */
export async function* runChatTurnStreaming(
  options: ChatEngineOptions
): AsyncGenerator<string> {
  const {
    systemPromptOptions,
    existingSummary,
    summarizedUpToIndex,
    messages,
    userMessage,
    videoTitle,
  } = options;

  let currentSummary = existingSummary;
  let currentSummarizedUpToIndex = summarizedUpToIndex;

  // Summarize if needed (non-streaming part)
  const unsummarizedMessages = messages.slice(summarizedUpToIndex);
  if (needsSummarization(unsummarizedMessages)) {
    const { toSummarize } = splitMessagesForSummarization(unsummarizedMessages);
    if (toSummarize.length > 0) {
      currentSummary = await summarizeMessages(toSummarize, currentSummary, videoTitle);
      currentSummarizedUpToIndex = summarizedUpToIndex + toSummarize.length;
    }
  }

  const systemPromptText = buildSystemPrompt(systemPromptOptions);
  const conversationWindow = buildConversationWindow(
    messages,
    currentSummary,
    currentSummarizedUpToIndex
  );

  const langchainMessages: BaseMessage[] = [new SystemMessage(systemPromptText)];
  for (const msg of conversationWindow) {
    if (msg.role === "user") langchainMessages.push(new HumanMessage(msg.content));
    else if (msg.role === "assistant") langchainMessages.push(new AIMessage(msg.content));
  }
  langchainMessages.push(new HumanMessage(userMessage));

  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY!,
    maxOutputTokens: 1024,
    temperature: 0.4,
    thinkingConfig: { thinkingBudget: 0 },
    streaming: true,
  });

  const stream = await llm.stream(langchainMessages);
  for await (const chunk of stream) {
    const text = extractChunkText(chunk.content);
    if (text) yield text;
  }
}

/**
 * Gemini via LangChain returns chunk.content as either:
 *   - a plain string
 *   - an array of content blocks: [{ type: "text", text: "..." }, ...]
 *   - an array with "thinking" blocks that have no text (must be skipped)
 * This extracts only the actual text, ignoring thought tokens.
 */
function extractChunkText(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((block: any) => block?.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text)
    .join("");
}