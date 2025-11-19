/**
 * LangChain Tool Wrappers V2 - Type-Specific Tools
 * 
 * Replaces universal addTrack/editTrack with type-specific tools.
 * Each track type has dedicated add/edit tools with focused schemas.
 * 
 * Architecture:
 * - Zod schemas for validation
 * - Maps to core implementations in ai-tools-v2.ts
 * - State updates via callbacks
 * - Checkpoint integration
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  addTextTrack,
  editTextTrack,
  addVideoTrack,
  editVideoTrack,
  addAudioTrack,
  editAudioTrack,
  addImageTrack,
  editImageTrack,
  addShapeTrack,
  editShapeTrack,
  deleteTrack as deleteTrackCore,
  serializeProject,
  type ProjectState,
  type ProjectSummary,
} from "./ai-tools-v2";

// ============================================================================
// Zod Schemas for Type-Specific Tools
// ============================================================================

// TEXT TOOLS
const AddTextTrackSchema = z.object({
  content: z.string().describe("Text to display"),
  start: z.number().min(0).describe("Start frame"),
  duration: z.number().min(1).describe("Duration in frames"),
  // Placement (at least ONE is required, but Zod doesn't support oneOf, so we make all optional and validate in tool)
  row: z.number().int().min(0).optional().describe("Explicit timeline row (0-based). Use for simple projects. Lower rows = higher z-index."),
  aboveRow: z.number().int().min(0).optional().describe("Place above this row number. Use for high-priority overlays."),
  belowRow: z.number().int().min(0).optional().describe("Place below this row number. Use for backgrounds."),
  betweenRows: z.tuple([z.number(), z.number()]).optional().describe("Place between [min, max] row numbers."),
  left: z.number().optional().describe("Horizontal position. Omit to auto-center."),
  top: z.number().optional().describe("Vertical position. Omit to auto-center."),
  anchor: z.enum(["left", "center", "right"]).optional().describe("Position anchor. Default: center"),
  width: z.number().min(1).optional().describe("Width in pixels. Auto-calculated from fontSize if omitted."),
  height: z.number().min(1).optional().describe("Height in pixels. Auto-calculated from fontSize if omitted."),
  fontSize: z.string().optional().describe("Font size with unit (e.g., '48px'). Sizes: 24px (small), 48px (medium), 72px (large), 96px (xlarge)"),
  fontFamily: z.enum(["Inter", "Merriweather", "Roboto Mono", "VT323", "League Spartan", "Bungee Inline"]).optional().describe("Font family. Default: Inter"),
  fontWeight: z.enum(["400", "700"]).optional().describe("Font weight. 400=normal, 700=bold. Default: 400"),
  textAlign: z.enum(["left", "center", "right"]).optional().describe("Text horizontal alignment. Default: center"),
  color: z.string().optional().describe("Text color (CSS: '#ffffff', 'red', etc.). Default: #ffffff"),
  backgroundColor: z.string().optional().describe("Background color (CSS). Default: transparent"),
  opacity: z.number().min(0).max(1).optional().describe("Opacity 0-1. Default: 1"),
  rotation: z.number().optional().describe("Rotation in degrees. Default: 0"),
});

const EditTextTrackSchema = z.object({
  trackId: z.string().describe("Track ID to edit (e.g., 'text-1')"),
  content: z.string().optional(),
  start: z.number().min(0).optional(),
  duration: z.number().min(1).optional(),
  row: z.number().int().min(0).optional(),
  left: z.number().optional(),
  top: z.number().optional(),
  anchor: z.enum(["left", "center", "right"]).optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  fontSize: z.string().optional(),
  fontFamily: z.enum(["Inter", "Merriweather", "Roboto Mono", "VT323", "League Spartan", "Bungee Inline"]).optional(),
  fontWeight: z.enum(["400", "700"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
});

// VIDEO TOOLS
const AddVideoTrackSchema = z.object({
  assetId: z.string().describe("REQUIRED. Asset ID from uploaded video (e.g., 'a_K1t9BN3c')"),
  start: z.number().min(0).describe("Start frame"),
  duration: z.number().min(1).describe("Duration in frames"),
  row: z.number().int().min(0).optional().describe("Explicit timeline row. Lower rows = higher z-index."),
  aboveRow: z.number().int().min(0).optional().describe("Place above this row number."),
  belowRow: z.number().int().min(0).optional().describe("Place below this row number."),
  betweenRows: z.tuple([z.number(), z.number()]).optional().describe("Place between [min, max] row numbers."),
  left: z.number().optional().describe("Horizontal position. Omit to center."),
  top: z.number().optional().describe("Vertical position. Omit to center."),
  anchor: z.enum(["left", "center", "right"]).optional().describe("Position anchor. Default: center"),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  volume: z.number().min(0).max(1).optional().describe("Volume 0-1. Default: 1"),
  speed: z.number().min(0.1).max(10).optional().describe("Playback speed. 1=normal, 2=2x, 0.5=half. Default: 1"),
  videoStartTime: z.number().min(0).optional().describe("Start offset in seconds. Default: 0"),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
});

const EditVideoTrackSchema = z.object({
  trackId: z.string().describe("Track ID (e.g., 'video-1')"),
  assetId: z.string().optional(),
  start: z.number().min(0).optional(),
  duration: z.number().min(1).optional(),
  row: z.number().int().min(0).optional(),
  left: z.number().optional(),
  top: z.number().optional(),
  anchor: z.enum(["left", "center", "right"]).optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  volume: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.1).max(10).optional(),
  videoStartTime: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
});

// AUDIO TOOLS
const AddAudioTrackSchema = z.object({
  assetId: z.string().describe("REQUIRED. Asset ID from uploaded audio (e.g., 'a_K1t9BN3c')"),
  start: z.number().min(0).describe("Start frame"),
  duration: z.number().min(1).describe("Duration in frames"),
  row: z.number().int().min(0).optional().describe("Explicit timeline row."),
  aboveRow: z.number().int().min(0).optional().describe("Place above this row number."),
  belowRow: z.number().int().min(0).optional().describe("Place below this row number."),
  betweenRows: z.tuple([z.number(), z.number()]).optional().describe("Place between [min, max] row numbers."),
  volume: z.number().min(0).max(1).optional().describe("Volume 0-1. Default: 1"),
  startFromSound: z.number().min(0).optional().describe("Start offset in seconds. Default: 0"),
});

const EditAudioTrackSchema = z.object({
  trackId: z.string().describe("Track ID (e.g., 'audio-1')"),
  assetId: z.string().optional(),
  start: z.number().min(0).optional(),
  duration: z.number().min(1).optional(),
  row: z.number().int().min(0).optional(),
  volume: z.number().min(0).max(1).optional(),
  startFromSound: z.number().min(0).optional(),
});

// IMAGE TOOLS
const AddImageTrackSchema = z.object({
  assetId: z.string().describe("REQUIRED. Asset ID from uploaded image (e.g., 'a_K1t9BN3c')"),
  start: z.number().min(0).describe("Start frame"),
  duration: z.number().min(1).describe("Duration in frames"),
  row: z.number().int().min(0).optional().describe("Explicit timeline row."),
  aboveRow: z.number().int().min(0).optional().describe("Place above this row number."),
  belowRow: z.number().int().min(0).optional().describe("Place below this row number."),
  betweenRows: z.tuple([z.number(), z.number()]).optional().describe("Place between [min, max] row numbers."),
  left: z.number().optional(),
  top: z.number().optional(),
  anchor: z.enum(["left", "center", "right"]).optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
});

const EditImageTrackSchema = z.object({
  trackId: z.string().describe("Track ID (e.g., 'image-1')"),
  assetId: z.string().optional(),
  start: z.number().min(0).optional(),
  duration: z.number().min(1).optional(),
  row: z.number().int().min(0).optional(),
  left: z.number().optional(),
  top: z.number().optional(),
  anchor: z.enum(["left", "center", "right"]).optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
});

// SHAPE TOOLS
const AddShapeTrackSchema = z.object({
  start: z.number().min(0).describe("Start frame"),
  duration: z.number().min(1).describe("Duration in frames"),
  row: z.number().int().min(0).optional().describe("Explicit timeline row."),
  aboveRow: z.number().int().min(0).optional().describe("Place above this row number."),
  belowRow: z.number().int().min(0).optional().describe("Place below this row number."),
  betweenRows: z.tuple([z.number(), z.number()]).optional().describe("Place between [min, max] row numbers."),
  left: z.number().optional(),
  top: z.number().optional(),
  anchor: z.enum(["left", "center", "right"]).optional(),
  width: z.number().min(1).describe("REQUIRED for shapes"),
  height: z.number().min(1).describe("REQUIRED for shapes"),
  fill: z.string().optional().describe("Fill color (CSS). Default: #ffffff"),
  stroke: z.string().optional().describe("Stroke color (CSS)"),
  strokeWidth: z.number().min(0).optional().describe("Stroke width in pixels"),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
});

const EditShapeTrackSchema = z.object({
  trackId: z.string().describe("Track ID (e.g., 'shape-1')"),
  start: z.number().min(0).optional(),
  duration: z.number().min(1).optional(),
  row: z.number().int().min(0).optional(),
  left: z.number().optional(),
  top: z.number().optional(),
  anchor: z.enum(["left", "center", "right"]).optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
});

// DELETE TOOL (Universal)
const DeleteTrackSchema = z.object({
  trackId: z.union([
    z.string().describe("Single track ID to delete"),
    z.array(z.string()).min(1).describe("Array of track IDs to delete"),
  ]).describe("Track ID(s) to delete"),
});

// ============================================================================
// Tool Context Interface
// ============================================================================

export interface ToolContext {
  projectState: ProjectState;
  sessionId: string;
  onStateUpdate: (newState: ProjectState) => void;
}

// ============================================================================
// LangChain Tool Implementations
// ============================================================================

class AddTextTrackTool extends StructuredTool {
  name = "addTextTrack";
  description = `Add a text overlay to the video.

CRITICAL: Must provide ONE placement parameter: row, aboveRow, belowRow, or betweenRows.
AUTO-SIZING: If fontSize provided without width/height, dimensions are auto-calculated.
CENTERING: Omit left/top to auto-center. Or use anchor="center" with left/top for center positioning.`;
  schema = AddTextTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof AddTextTrackSchema>): Promise<string> {
    const result = await addTextTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class EditTextTrackTool extends StructuredTool {
  name = "editTextTrack";
  description = "Modify an existing text track. Only include fields you want to change.";
  schema = EditTextTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof EditTextTrackSchema>): Promise<string> {
    const result = await editTextTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class AddVideoTrackTool extends StructuredTool {
  name = "addVideoTrack";
  description = "Add a video clip to the timeline. Requires assetId from uploaded media.";
  schema = AddVideoTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof AddVideoTrackSchema>): Promise<string> {
    const result = await addVideoTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class EditVideoTrackTool extends StructuredTool {
  name = "editVideoTrack";
  description = "Modify an existing video track.";
  schema = EditVideoTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof EditVideoTrackSchema>): Promise<string> {
    const result = await editVideoTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class AddAudioTrackTool extends StructuredTool {
  name = "addAudioTrack";
  description = "Add an audio track. Requires assetId from uploaded audio.";
  schema = AddAudioTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof AddAudioTrackSchema>): Promise<string> {
    const result = await addAudioTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class EditAudioTrackTool extends StructuredTool {
  name = "editAudioTrack";
  description = "Modify an existing audio track.";
  schema = EditAudioTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof EditAudioTrackSchema>): Promise<string> {
    const result = await editAudioTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class AddImageTrackTool extends StructuredTool {
  name = "addImageTrack";
  description = "Add an image overlay. Requires assetId from uploaded image.";
  schema = AddImageTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof AddImageTrackSchema>): Promise<string> {
    const result = await addImageTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class EditImageTrackTool extends StructuredTool {
  name = "editImageTrack";
  description = "Modify an existing image track.";
  schema = EditImageTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof EditImageTrackSchema>): Promise<string> {
    const result = await editImageTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class AddShapeTrackTool extends StructuredTool {
  name = "addShapeTrack";
  description = "Add a shape overlay (rectangle, circle, etc.).";
  schema = AddShapeTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof AddShapeTrackSchema>): Promise<string> {
    const result = await addShapeTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class EditShapeTrackTool extends StructuredTool {
  name = "editShapeTrack";
  description = "Modify an existing shape track.";
  schema = EditShapeTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof EditShapeTrackSchema>): Promise<string> {
    const result = await editShapeTrack(input, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

class DeleteTrackTool extends StructuredTool {
  name = "deleteTrack";
  description = "Delete any track from the timeline.";
  schema = DeleteTrackSchema;

  constructor(private context: ToolContext) {
    super();
  }

  async _call(input: z.infer<typeof DeleteTrackSchema>): Promise<string> {
    const trackId = input.trackId;
    const result = await deleteTrackCore(trackId, this.context.projectState);
    
    if (result.success && result.newState) {
      this.context.onStateUpdate(result.newState);
    }
    
    return JSON.stringify(result);
  }
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create all video editor tools with proper context binding
 */
export function createVideoEditorTools(context: ToolContext): StructuredTool[] {
  return [
    // Text tools
    new AddTextTrackTool(context),
    new EditTextTrackTool(context),
    // Video tools
    new AddVideoTrackTool(context),
    new EditVideoTrackTool(context),
    // Audio tools
    new AddAudioTrackTool(context),
    new EditAudioTrackTool(context),
    // Image tools
    new AddImageTrackTool(context),
    new EditImageTrackTool(context),
    // Shape tools
    new AddShapeTrackTool(context),
    new EditShapeTrackTool(context),
    // Universal delete
    new DeleteTrackTool(context),
  ];
}
