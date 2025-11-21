/**
 * LangChain Tool Wrappers for Video Editor AI Tools
 * 
 * Wraps existing ai-tools.ts functions with LangChain's StructuredTool interface
 * for use with LangGraph agent workflows.
 * 
 * Key Design:
 * - Zod schemas for input validation
 * - State update via callbacks (no direct mutation)
 * - Checkpoint creation integrated
 * - Same tool logic as ai-tools.ts (no duplication)
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  addTrack as addTrackCore,
  editTrack as editTrackCore,
  deleteTrack as deleteTrackCore,
  serializeProject,
  type ProjectState,
  type NewTrackInput,
  type TrackPatch,
  type ProjectSummary,
} from "./ai-tools";

// ============================================================================
// Zod Schemas (simplified for Google Gemini API compatibility)
// ============================================================================

const AddTrackSchema = z.object({
  type: z.enum(["text", "video", "audio", "image", "shape", "sticker", "caption"]),
  content: z.string().optional().describe("REQUIRED for text/caption. Text content to display."),
  assetId: z.string().optional().describe("REQUIRED for video/audio/image. Asset ID from uploaded media (e.g., 'a_K1t9BN3c')."),
  start: z.number().min(0).describe("Start time in frames"),
  duration: z.number().min(1).describe("Duration in frames"),
  row: z.number().int().min(0).optional().describe("Explicit row/layer number (optional, prefer constraints)"),
  constraints: z.object({
    aboveRow: z.number().int().optional(),
    belowRow: z.number().int().optional(),
    betweenRows: z.array(z.number().int()).optional(),
  }).optional().describe("PREFERRED. Automatic row placement constraints"),
  // Center-based positioning (PREFERRED)
  x: z.union([z.number(), z.enum(["center"])]).optional().describe("Center X position: number in pixels OR 'center'"),
  y: z.union([z.number(), z.enum(["center"])]).optional().describe("Center Y position: number in pixels OR 'center'"),
  width: z.number().optional().describe("Width in pixels (optional for text)"),
  // Legacy positioning (for backward compatibility)
  left: z.number().optional().describe("LEGACY: Left position in pixels"),
  top: z.number().optional().describe("LEGACY: Top position in pixels"),
  height: z.number().optional().describe("LEGACY: Height in pixels"),
  rotation: z.number().optional().describe("Rotation in degrees"),
  style: z.any().optional().describe("Visual styling (color, fontSize, fontWeight, etc.)"),
  videoStartTime: z.number().optional(),
  speed: z.number().optional(),
  startFromSound: z.number().optional(),
  captions: z.array(z.any()).optional(),
  captionStyles: z.any().optional(),
  template: z.string().optional(),
  category: z.string().optional(),
});

const EditTrackSchema = z.object({
  trackId: z.string().describe("REQUIRED. Track ID to edit (e.g., 'text-1', 'video-2')"),
  content: z.string().optional().describe("New text content (text/caption only)"),
  assetId: z.string().optional().describe("New asset ID (video/audio/image only, e.g., 'a_K1t9BN3c')"),
  start: z.number().min(0).optional().describe("New start frame"),
  duration: z.number().min(1).optional().describe("New duration in frames"),
  row: z.number().int().min(0).optional().describe("New row/layer"),
  // Center-based positioning (PREFERRED)
  x: z.union([z.number(), z.enum(["center"])]).optional().describe("New center X: number OR 'center'"),
  y: z.union([z.number(), z.enum(["center"])]).optional().describe("New center Y: number OR 'center'"),
  width: z.number().optional().describe("New width in pixels"),
  // Legacy positioning
  left: z.number().optional().describe("LEGACY: New left position"),
  top: z.number().optional().describe("LEGACY: New top position"),
  height: z.number().optional().describe("LEGACY: New height"),
  rotation: z.number().optional(),
  style: z.any().optional().describe("Style properties to update"),
  videoStartTime: z.number().optional(),
  speed: z.number().optional(),
  startFromSound: z.number().optional(),
  captions: z.array(z.any()).optional(),
  captionStyles: z.any().optional(),
  template: z.string().optional(),
  category: z.string().optional(),
});

const DeleteTrackSchema = z.object({
  trackId: z.union([
    z.string().describe("Single track ID to delete"),
    z.array(z.string()).min(1).describe("Array of track IDs to delete"),
  ]).describe("Track ID(s) to delete - can be a single string or array of strings"),
});

const GetProjectInfoSchema = z.object({}).optional();

// ============================================================================
// Tool State Interface
// ============================================================================

/**
 * State context passed to tools via runManager
 */
export interface ToolContext {
  projectState: ProjectState;
  sessionId: string;
  onStateUpdate: (newState: ProjectState) => void;
}

// ============================================================================
// LangChain Tools
// ============================================================================

/**
 * Add Track Tool
 * 
 * Creates a new track on the video timeline.
 * Automatically updates state via onStateUpdate callback.
 */
export class AddTrackTool extends StructuredTool {
  name = "addTrack";
  description = `Add a new track/overlay to the video timeline.

ALWAYS call getProjectInfo() first to understand current project state before adding tracks.

Use placement constraints instead of explicit row to avoid overlaps:
- aboveRow: Place on first available row above this row
- belowRow: Place on first available row below this row  
- betweenRows: Place on first available row in this range [min, max]

Track types:
- text: Requires 'content' field
- video/audio/image: Requires 'src' field (URL)
- shape/sticker/caption: See docs for specific fields

All tracks require: type, start, duration, and either row or constraints.`;

  schema = AddTrackSchema;
  
  // Store context as instance property
  private context: ToolContext;

  constructor(context: ToolContext) {
    super();
    this.context = context;
  }

  async _call(input: z.infer<typeof AddTrackSchema>): Promise<string> {
    const { projectState, sessionId, onStateUpdate } = this.context;

    // Call core tool function
    const result = addTrackCore(projectState, sessionId, input as NewTrackInput);

    if (!result.success) {
      throw new Error(`AddTrack failed: ${result.error.message}`);
    }

    // Update state via callback
    const newState: ProjectState = {
      ...projectState,
      overlays: result.data.overlays,
    };
    onStateUpdate(newState);

    // Return success message with trackId
    return JSON.stringify({
      success: true,
      trackId: result.data.trackId,
      message: result.data.message,
      placement: result.data.placement,
    });
  }
}

/**
 * Edit Track Tool
 * 
 * Modifies properties of an existing track.
 * Automatically updates state via onStateUpdate callback.
 */
export class EditTrackTool extends StructuredTool {
  name = "editTrack";
  description = `Edit an existing track/overlay on the timeline.

ALWAYS call getProjectInfo() first to get track IDs and current values.

Can update any combination of:
- Position/timing: start, duration, row
- Visual properties: left, top, width, height, rotation
- Content: content (for text), src (for media)
- Styling: style object, captionStyles object

Requires trackId (get from getProjectInfo).`;

  schema = EditTrackSchema;
  
  // Store context as instance property
  private context: ToolContext;

  constructor(context: ToolContext) {
    super();
    this.context = context;
  }

  async _call(input: z.infer<typeof EditTrackSchema>): Promise<string> {
    const { projectState, sessionId, onStateUpdate } = this.context;

    // Extract trackId and patch from input
    const { trackId, ...patch } = input;

    // Call core tool function
    const result = editTrackCore(projectState, sessionId, trackId, patch as TrackPatch);

    if (!result.success) {
      throw new Error(`EditTrack failed: ${result.error.message}`);
    }

    // Update state via callback
    const newState: ProjectState = {
      ...projectState,
      overlays: result.data.overlays,
    };
    onStateUpdate(newState);

    return JSON.stringify({
      success: true,
      message: result.data.message,
    });
  }
}

/**
 * Delete Track Tool
 * 
 * Removes one or more tracks from the timeline.
 */
export class DeleteTrackTool extends StructuredTool {
  name = "deleteTrack";
  description = `Delete one or more tracks from the timeline by trackId.

You can delete a single track or multiple tracks at once:
- Single: trackId: "text-1"
- Multiple: trackId: ["text-1", "text-2", "audio-1"]

Use trackId from getProjectInfo() to identify the track(s) to delete.`;

  schema = DeleteTrackSchema;
  
  // Store context as instance property
  private context: ToolContext;

  constructor(context: ToolContext) {
    super();
    this.context = context;
  }

  async _call(input: z.infer<typeof DeleteTrackSchema>): Promise<string> {
    const { projectState, sessionId, onStateUpdate } = this.context;

    // Call core tool function
    const result = deleteTrackCore(projectState, sessionId, input.trackId);

    if (!result.success) {
      throw new Error(`DeleteTrack failed: ${result.error.message}`);
    }

    // Update state
    const newState: ProjectState = {
      ...projectState,
      overlays: result.data.overlays,
    };
    onStateUpdate(newState);

    return JSON.stringify({
      success: true,
      message: result.data.message,
    });
  }
}

/**
 * Get Project Info Tool
 * 
 * Returns current project state in simplified format.
 * ALWAYS call this FIRST before making any edits.
 */
export class GetProjectInfoTool extends StructuredTool {
  name = "getProjectInfo";
  description = `Get current project state with all tracks, canvas specs, and timeline info.

ALWAYS call this FIRST before adding or editing tracks to understand:
- Current tracks and their IDs
- Available space on timeline
- Canvas dimensions (width, height)
- Current video duration
- FPS (frames per second)

Returns a summary of all tracks with their IDs, types, positions, and styles.`;

  schema = GetProjectInfoSchema;
  
  // Store context as instance property
  private context: ToolContext;

  constructor(context: ToolContext) {
    super();
    this.context = context;
  }

  async _call(input: any): Promise<string> {
    const { projectState, sessionId } = this.context;

    // Serialize project state
    const summary = serializeProject(projectState, sessionId);

    return JSON.stringify(summary, null, 2);
  }
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create all tools for LangGraph workflow with context bound
 */
export function createVideoEditorTools(context: ToolContext) {
  return [
    new GetProjectInfoTool(context),
    new AddTrackTool(context),
    new EditTrackTool(context),
    new DeleteTrackTool(context),
  ];
}
