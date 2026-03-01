import { z } from 'zod';

/**
 * Zod schema for the Sketch to Edit request.
 */
export const SketchToEditRequestSchema = z.object({
  originalImage: z.string().describe("Base64 string of the original image"),
  annotatedImage: z.string().describe("Base64 string of the annotated/sketch image"),
  model: z.string().describe("The ID of the AI model to use"),
  sessionId: z.string().optional().describe("Optional session ID mapping"),
  prompt: z.string().optional().describe("Optional user text prompt"),
});

/**
 * Type derived from the Zod schema for Sketch to Edit request.
 */
export type SketchToEditRequest = z.infer<typeof SketchToEditRequestSchema>;

/**
 * Result of a single Sketch to Edit operation.
 */
export interface SketchToEditResult {
  success: boolean;
  editedImage?: string; // Base64 string of the result
  model: string;
  processingTimeMs: number;
  error?: string;
}

/**
 * Payload sent to the backend AI services.
 */
export interface SketchToEditPayload {
  originalImage: string;
  annotatedImage: string;
  prompt: string;
  systemPrompt: string;
}

/**
 * Response returned by the Sketch to Edit API endpoint.
 */
export interface SketchToEditResponse {
  success: boolean;
  editedImage?: string;
  model: string;
  processingTimeMs: number;
  error?: string;
}

/**
 * Metadata stored in a Variation for Sketch to Edit operations.
 */
export interface SketchToEditMetadata {
  sketchToEdit: boolean;
  model: string;
  imageDimensions: {
    width: number;
    height: number;
  };
  processingTimeMs: number;
  originalPrompt?: string;
}
