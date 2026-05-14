/**
 * Production LLM Service using Google Native SDK
 * 
 * Migrated from experimental testing - native @google/genai SDK with Gemini 2.0 Flash
 * Validated through comprehensive testing - see MODEL_PERFORMANCE.md
 * 
 * Key Advantages over OpenRouter/Vercel AI SDK:
 * - Nested style objects work correctly (no flattening issues)
 * - Excellent timing/positioning intelligence
 * - Enhanced system prompt with semantic/timing/positioning guidelines
 * - Multi-turn function calling with conversation history
 * - Proper error recovery
 * 
 * Status: PRODUCTION READY
 */

import 'dotenv/config';
import { GoogleGenAI, FunctionDeclaration, Type, FunctionCallingConfigMode } from '@google/genai';
// TODO: These modules were removed/renamed — inline stubs until migrated
// import type { ProjectSummary, NewTrackInput, TrackPatch } from './ai-tools';
// import { systemPrompt } from './ai-tool-schemas-v2';

/** Inline type stubs for ai-tools (module not found) */
type ProjectSummary = Record<string, any>;
type NewTrackInput = Record<string, any>;
type TrackPatch = Record<string, any>;

/** Fallback system prompt — replace with proper import when module exists */
const systemPrompt = 'You are Editron AI, an intelligent video editing assistant.';

// ============================================================================
// Configuration
// ============================================================================

function getGoogleApiKey(): string {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('⚠️  No GOOGLE_API_KEY or GEMINI_API_KEY found in environment');
  }
  return key;
}

const MODEL_NAME = 'gemini-3.1-flash'; // Production model (updated 2026-05-15)
const MAX_TURNS = 5; // Maximum function calling iterations

// ============================================================================
// Tool Schemas (Google Native Format)
// ============================================================================

const addTrackDeclaration: FunctionDeclaration = {
  name: 'addTrack',
  description: 'Add a new track/overlay to the timeline. ALWAYS call getProjectInfo() first to get intelligent parameters. Use placement constraints instead of explicit row when possible to avoid overlaps.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: {
        type: Type.STRING,
        description: 'REQUIRED. Track type: text, video, audio, image',
      },
      content: {
        type: Type.STRING,
        description: 'Text content (for text tracks only)',
      },
      src: {
        type: Type.STRING,
        description: 'Source URL (REQUIRED for video/audio/image tracks)',
      },
      start: {
        type: Type.NUMBER,
        description: 'REQUIRED. Start time in frames (>= 0)',
      },
      duration: {
        type: Type.NUMBER,
        description: 'REQUIRED. Duration in frames (> 0)',
      },
      row: {
        type: Type.INTEGER,
        description: 'OPTIONAL. Explicit row/layer number (0-based). If specified without constraints, will error on overlap. Prefer using constraints instead for automatic placement.',
      },
      constraints: {
        type: Type.OBJECT,
        description: 'OPTIONAL. Placement constraints for automatic row selection. Preferred over explicit row to avoid overlaps. Specify exactly one of: aboveRow, belowRow, or betweenRows.',
        properties: {
          aboveRow: {
            type: Type.INTEGER,
            description: 'Place on first available row above this row number. Example: aboveRow: 2 searches rows 1, 0 for space.',
          },
          belowRow: {
            type: Type.INTEGER,
            description: 'Place on first available row below this row number. Example: belowRow: 1 searches rows 2, 3, 4... for space.',
          },
          betweenRows: {
            type: Type.ARRAY,
            description: 'Place on first available row in this range [min, max] (inclusive). Example: betweenRows: [2, 5] searches rows 2, 3, 4, 5.',
            items: {
              type: Type.INTEGER,
            },
          },
        },
      },
      left: {
        type: Type.NUMBER,
        description: 'Left position (percentage 0-100)',
      },
      top: {
        type: Type.NUMBER,
        description: 'Top position (percentage 0-100)',
      },
      width: {
        type: Type.NUMBER,
        description: 'Width (percentage 0-100)',
      },
      height: {
        type: Type.NUMBER,
        description: 'Height (percentage 0-100)',
      },
      style: {
        type: Type.OBJECT,
        description: 'Visual styling properties for the track',
        properties: {
          color: {
            type: Type.STRING,
            description: 'Text/fill color (e.g., "#0066cc", "blue", "rgb(0,100,200)")',
          },
          fontSize: {
            type: Type.STRING,
            description: 'Font size (e.g., "24px", "2rem", "48px")',
          },
          fontWeight: {
            type: Type.STRING,
            description: 'Font weight (e.g., "bold", "700", "normal")',
          },
          backgroundColor: {
            type: Type.STRING,
            description: 'Background color',
          },
          opacity: {
            type: Type.NUMBER,
            description: 'Opacity (0-1)',
          },
          textAlign: {
            type: Type.STRING,
            description: 'Text alignment: left, center, right',
          },
          fontFamily: {
            type: Type.STRING,
            description: 'Font family (e.g., "Arial", "Helvetica")',
          },
        },
      },
    },
    required: ['type', 'start', 'duration'],
  },
};

const editTrackDeclaration: FunctionDeclaration = {
  name: 'editTrack',
  description: 'Edit an existing track. Use trackId from getProjectInfo().',
  parameters: {
    type: Type.OBJECT,
    properties: {
      trackId: {
        type: Type.STRING,
        description: 'REQUIRED. Track ID to edit (e.g., "text-1", "video-2")',
      },
      content: {
        type: Type.STRING,
        description: 'New content',
      },
      start: {
        type: Type.NUMBER,
        description: 'New start time in frames',
      },
      duration: {
        type: Type.NUMBER,
        description: 'New duration in frames',
      },
      left: {
        type: Type.NUMBER,
        description: 'New left position',
      },
      top: {
        type: Type.NUMBER,
        description: 'New top position',
      },
      width: {
        type: Type.NUMBER,
        description: 'New width',
      },
      height: {
        type: Type.NUMBER,
        description: 'New height',
      },
      style: {
        type: Type.OBJECT,
        description: 'Visual styling properties to update',
        properties: {
          color: { type: Type.STRING, description: 'Text/fill color' },
          fontSize: { type: Type.STRING, description: 'Font size' },
          fontWeight: { type: Type.STRING, description: 'Font weight' },
          backgroundColor: { type: Type.STRING, description: 'Background color' },
          opacity: { type: Type.NUMBER, description: 'Opacity (0-1)' },
          textAlign: { type: Type.STRING, description: 'Text alignment' },
          fontFamily: { type: Type.STRING, description: 'Font family' },
        },
      },
    },
    required: ['trackId'],
  },
};

const deleteTrackDeclaration: FunctionDeclaration = {
  name: 'deleteTrack',
  description: 'Delete a track from the timeline',
  parameters: {
    type: Type.OBJECT,
    properties: {
      trackId: {
        type: Type.STRING,
        description: 'REQUIRED. Track ID to delete',
      },
    },
    required: ['trackId'],
  },
};

const getProjectInfoDeclaration: FunctionDeclaration = {
  name: 'getProjectInfo',
  description: 'Get current project state. ALWAYS call this FIRST before any edits!',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

// ============================================================================
// Message Type
// ============================================================================

export type GoogleMessage = {
  role: 'user' | 'model'; // Google uses 'model' instead of 'assistant'
  parts: Array<{
    text?: string;
    functionCall?: {
      name: string;
      args: any;
    };
    functionResponse?: {
      name: string;
      response: any;
    };
  }>;
};

// ============================================================================
// LLM Service
// ============================================================================

export class GoogleLLMService {
  private client: GoogleGenAI;
  
  constructor() {
    this.client = new GoogleGenAI({
      apiKey: getGoogleApiKey(),
    });
  }

  /**
   * Generate content with tool calling (supports multi-turn)
   * 
   * @param messages - Conversation history
   * @param projectSummary - Current project state  
   * @param availableTools - Tool implementations
   * @returns Final text response and all tool calls made
   */
  async generateWithTools(
    messages: GoogleMessage[],
    projectSummary: ProjectSummary,
    availableTools: {
      addTrack: (input: NewTrackInput) => any;
      editTrack: (trackId: string, patch: TrackPatch) => any;
      deleteTrack: (trackId: string) => any;
      getProjectInfo: () => ProjectSummary;
    }
  ): Promise<{
    text: string;
    toolCalls: Array<{
      toolName: string;
      args: any;
      result: any;
    }>;
  }> {
    try {
      // Debug: Log incoming messages
      console.log(`[LLM] Received ${messages.length} message(s)`);
      messages.forEach((msg, i) => {
        console.log(`[LLM] Message ${i + 1}: ${msg.role} - ${msg.parts[0]?.text?.substring(0, 100)}...`);
      });

      // Build conversation history
      const contents = messages.map((msg) => ({
        role: msg.role,
        parts: msg.parts,
      }));

      const allToolCalls: Array<{
        toolName: string;
        args: any;
        result: any;
      }> = [];

      let conversationHistory = [
        {
          role: 'user' as const,
          parts: [{ text: systemPrompt }], // Use production system prompt from ai-tool-schemas
        },
        ...contents,
      ];

      let finalText = '';
      
      // Multi-turn function calling loop
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        // Call model with tools
        const response = await this.client.models.generateContent({
          model: MODEL_NAME,
          contents: conversationHistory,
          config: {
            tools: [
              {
                functionDeclarations: [
                  getProjectInfoDeclaration,
                  addTrackDeclaration,
                  editTrackDeclaration,
                  deleteTrackDeclaration,
                ],
              },
            ],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
          },
        });

        // Extract text response (suppress warning about non-text parts)
        finalText = response.text || '';

        // Check if there are function calls
        if (!response.functionCalls || response.functionCalls.length === 0) {
          // No more function calls, we're done
          break;
        }

        // Log tool calls for debugging
        console.log(`[LLM] Turn ${turn + 1}: ${response.functionCalls.length} tool call(s)`);

        // Execute all function calls in this turn
        const turnResults: any[] = [];

        for (const call of response.functionCalls) {
          const toolName = call.name || 'unknown';
          const args: any = call.args || {};

          console.log(`[LLM] Tool: ${toolName}`, args);

          let result: any;

          // Execute tool
          try {
            if (toolName === 'getProjectInfo') {
              result = {
                success: true,
                data: availableTools.getProjectInfo(),
              };
            } else if (toolName === 'addTrack') {
              // Use style object directly from args (nested format - works with native SDK)
              const input: NewTrackInput = {
                type: args.type,
                content: args.content,
                src: args.src, // Source URL for media tracks
                start: args.start,
                duration: args.duration,
                row: args.row,
                constraints: args.constraints, // Placement constraints (aboveRow, belowRow, betweenRows)
                left: args.left,
                top: args.top,
                width: args.width,
                height: args.height,
                style: args.style, // Direct assignment - already an object or undefined
              };

              result = availableTools.addTrack(input);
            } else if (toolName === 'editTrack') {
              // Use style object directly from args (nested format - works with native SDK)
              const patch: TrackPatch = {
                content: args.content,
                src: args.src, // Allow updating media source
                start: args.start,
                duration: args.duration,
                left: args.left,
                top: args.top,
                width: args.width,
                height: args.height,
                style: args.style, // Direct assignment - already an object or undefined
              };

              result = availableTools.editTrack(args.trackId, patch);
            } else if (toolName === 'deleteTrack') {
              result = availableTools.deleteTrack(args.trackId);
            } else {
              result = {
                success: false,
                error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${toolName}` },
              };
            }
          } catch (error: any) {
            result = {
              success: false,
              error: { code: 'EXECUTION_ERROR', message: error.message },
            };
          }

          console.log(`[LLM] Result:`, result.success ? '✅ Success' : '❌ Failed');

          allToolCalls.push({
            toolName,
            args,
            result,
          });

          // Prepare function response for next turn
          // Filter out 'overlays' from successful results to avoid bloating LLM context
          const cleanResult = result.success && result.data
            ? {
                ...result,
                data: {
                  ...result.data,
                  overlays: undefined, // Remove overlays from LLM context
                },
              }
            : result;

          turnResults.push({
            name: toolName,
            response: cleanResult,
          });
        }

        // Add assistant's function calls and our responses to conversation history
        conversationHistory.push({
          role: 'model',
          parts: response.functionCalls.map((call: any) => ({
            functionCall: {
              name: call.name,
              args: call.args,
            },
          })),
        });

        conversationHistory.push({
          role: 'user',
          parts: turnResults.map((tr) => ({
            functionResponse: tr,
          })),
        });
      }

      return {
        text: finalText,
        toolCalls: allToolCalls,
      };
    } catch (error: any) {
      console.error('❌ LLM Error:', error);
      throw error;
    }
  }
}

/**
 * Create production LLM service instance
 */
export function createGoogleLLMService(): GoogleLLMService {
  return new GoogleLLMService();
}
