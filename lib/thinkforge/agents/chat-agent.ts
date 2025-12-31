/**
 * Chat Agent - Simple Q&A using Google Generative AI with streaming
 * Supports API key authentication via @ai-sdk/google
 * Target: <500ms first token
 */

import { streamText } from 'ai';
import type { SessionState, ProjectMeta } from '../state/types';
import type { BlockTree } from '../schemas/canonical';
import { createThinkForgeModel } from './model-factory';

interface ChatAgentOptions {
  sessionState: SessionState;
  script?: { blocks?: BlockTree; content?: string; title?: string } | null;
  project?: ProjectMeta | null;
  selection?: string | null;
  skipPersistUser?: boolean;
}

/**
 * Enrich vague prompts with project context internally
 * This happens on the backend so users only see their original message
 */
function enrichPrompt(prompt: string, project: ProjectMeta | null): string {
  if (!project) return prompt;
  
  const text = prompt.trim();
  const low = text.toLowerCase();
  
  // Detect vague prompts
  const vague = /(write( the)? script|generate( the)? script|create( the)? script|draft( the)? script|write it|make the script)/i.test(low) || text.length < 30;
  const alreadyHas = /\bcontext:\b/i.test(text) || /\bidea:\b/i.test(text);
  
  if (!vague || alreadyHas) return prompt;
  
  // Build context bits
  const bits: string[] = [];
  if (project.idea) bits.push(`- Idea: ${project.idea}`);
  if (project.platform) bits.push(`- Platform: ${project.platform}`);
  if (project.tone) bits.push(`- Tone: ${project.tone}`);
  if (project.style) bits.push(`- Style: ${project.style}`);
  if (project.format) bits.push(`- Format: ${project.format}`);
  if (project.purpose) bits.push(`- Purpose: ${project.purpose}`);
  
  if (bits.length === 0) return prompt;
  
  return `${text}\n\nContext:\n${bits.join('\n')}`;
}

/**
 * Generate chat response with streaming
 * Returns a ReadableStream that can be used directly in Response
 */
export async function chatAgent(
  prompt: string,
  options: ChatAgentOptions
): Promise<ReadableStream<Uint8Array>> {
  const { sessionState, script, project, selection } = options;
  
  // Enrich prompt internally (user won't see this enrichment)
  const enrichedPrompt = enrichPrompt(prompt, project);
  
  // Load minimal context (last 5 messages + project meta)
  const recentChat = sessionState.chat.slice(-5);
  
  // Build context messages
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  // Add system context for ThinkForge
  messages.push({
    role: 'user',
    content: `You are a creative writing assistant helping with content creation. Be concise, helpful, and creative. Focus on the user's specific request.`
  });
  
  // Add project context if available (already included in enriched prompt, but keep for system context)
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
        role: 'assistant',
        content: `I understand. Here's the project context:\n${projectContext.join('\n')}`
      });
    }
  }
  
  // Add script context if available
  if (script && script.title) {
    messages.push({
      role: 'user',
      content: `Current Script: "${script.title}"\n${script.content?.slice(0, 500) || ''}`
    });
    messages.push({
      role: 'assistant',
      content: 'I see the current script. How can I help you with it?'
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
  
  // Add current prompt (enriched internally, but user only sees original)
  messages.push({
    role: 'user',
    content: enrichedPrompt
  });
  
  const model = createThinkForgeModel();
  
  const result = streamText({
    model,
    messages,
    temperature: 0.7
  });
  
  // Convert textStream (ReadableStream<string>) to ReadableStream<Uint8Array>
  const encoder = new TextEncoder();
  const textStream = result.textStream;
  
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of textStream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        console.error('[ChatAgent] Stream error:', error);
        controller.error(error);
      }
    }
  });
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
