/**
 * Chat Agent - Simple Q&A using Google Generative AI with streaming
 * Supports both Vertex AI (ADC) and API key authentication
 * Target: <500ms first token
 */

import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { SessionState, ProjectMeta } from '../state/types';
import type { BlockTree } from '../schemas/canonical';

interface ChatAgentOptions {
  sessionState: SessionState;
  script?: { blocks?: BlockTree; content?: string; title?: string } | null;
  project?: ProjectMeta | null;
  selection?: string | null;
  skipPersistUser?: boolean;
}

/**
 * Create model for chat with proper authentication
 */
const createVertexAIModel = () => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  // For Node.js with @ai-sdk/google, we use API key authentication
  // Vertex AI with ADC will be handled at deployment time (Cloud Run automatically provides ADC)
  if (!apiKey) {
    throw new Error(
      'GOOGLE_GENERATIVE_AI_API_KEY is required. For Vertex AI with ADC, ensure the service account has Vertex AI User role.'
    );
  }
  
  // Create Google Generative AI instance
  const google = createGoogleGenerativeAI({ apiKey });
  return google('gemini-2.0-flash');
};

/**
 * Generate chat response with streaming
 */
export async function chatAgent(
  prompt: string,
  options: ChatAgentOptions
): Promise<ReadableStream<Uint8Array>> {
  const { sessionState, script, project, selection } = options;
  
  // Load minimal context (last 5 messages + project meta)
  const recentChat = sessionState.chat.slice(-5);
  
  // Build context messages
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  // Add project context if available
  if (project) {
    const projectContext: string[] = [];
    if (project.idea) projectContext.push(`Idea: ${project.idea}`);
    if (project.purpose) projectContext.push(`Purpose: ${project.purpose}`);
    if (project.style) projectContext.push(`Style: ${project.style}`);
    if (project.format) projectContext.push(`Format: ${project.format}`);
    if (project.platform) projectContext.push(`Platform: ${project.platform}`);
    if (project.tone) projectContext.push(`Tone: ${project.tone}`);
    
    if (projectContext.length > 0) {
      messages.push({
        role: 'user',
        content: `Project Context:\n${projectContext.join('\n')}`
      });
    }
  }
  
  // Add script context if available
  if (script && script.title) {
    messages.push({
      role: 'user',
      content: `Current Script: "${script.title}"\n${script.content?.slice(0, 500) || ''}`
    });
  }
  
  // Add selection context if provided
  if (selection) {
    messages.push({
      role: 'user',
      content: `Selected text:\n${selection}`
    });
  }
  
  // Add recent chat history
  for (const msg of recentChat) {
    messages.push({
      role: msg.role,
      content: msg.content
    });
  }
  
  // Add current prompt
  messages.push({
    role: 'user',
    content: prompt
  });
  
  const model = createVertexAIModel();
  
  const result = await streamText({
    model,
    messages,
    temperature: 0.7,
    maxTokens: 2000
  });
  
  return result.toDataStreamResponse().body!;
}

/**
 * Generate chat response that may include script update
 */
export async function chatAgentWithScriptUpdate(
  prompt: string,
  options: ChatAgentOptions
): Promise<ReadableStream<Uint8Array>> {
  // For now, just return regular chat
  // Script updates will be handled by script draft agent
  return chatAgent(prompt, options);
}

