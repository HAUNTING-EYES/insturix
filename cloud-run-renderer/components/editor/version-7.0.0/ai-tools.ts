/**
 * AI Tools for Video Editor
 * 
 * This module provides AI-accessible tools for manipulating the video editor state.
 * 
 * KEY CONCEPTS:
 * 
 * 1. **ID vs TrackID**:
 *    - `id` (number): Permanent internal overlay ID (e.g., 791325)
 *      - Stays the same for the lifetime of an overlay
 *      - Used internally by the editor UI
 *    - `trackId` (string): Session-specific identifier (e.g., "text-7", "video-2")
 *      - Generated per AI session for stable references
 *      - Maps to the overlay's `id` via SessionMapping
 *      - LLM uses this to reference tracks across tool calls
 * 
 * 2. **Session Management**:
 *    - Each AI conversation gets a unique `sessionId`
 *    - Session maintains bidirectional mapping: trackId ↔ overlay.id
 *    - Ensures consistent trackIds even as overlays are added/removed
 * 
 * 3. **Checkpoints**:
 *    - Automatically saved before and after LLM actions
 *    - Allows rollback if LLM makes mistakes
 *    - Skipped if no changes detected (same overlay hash)
 */

import {
  Overlay,
  OverlayType,
  TextOverlay,
  ImageOverlay,
  ShapeOverlay,
  ClipOverlay,
  SoundOverlay,
  CaptionOverlay,
  Caption,
  StickerOverlay,
  CaptionStyles,
} from "./types";
import { defaultCaptionStyles } from "./components/overlays/captions/default-caption-styles";
import { createCheckpoint } from "./checkpoint-manager";
import { 
  PlacementConstraints, 
  resolveTrackPlacement,
  PlacementError,
  PlacementErrorCode 
} from "./ai-tools-placement";
import { assetResolver } from "@/lib/services/asset-resolver";

export type TrackType =
  | "video"
  | "audio"
  | "text"
  | "image"
  | "shape"
  | "sticker"
  | "caption";

export interface TrackStyleSnapshot {
  opacity?: number;
  zIndex?: number;
  color?: string;
  backgroundColor?: string;
  background?: string;
  fontSize?: string | number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textDecoration?: string;
  lineHeight?: string | number;
  letterSpacing?: string | number;
  textAlign?: "left" | "center" | "right";
  textShadow?: string;
  WebkitBackgroundClip?: string;
  WebkitTextFillColor?: string;
  padding?: string;
  paddingBackgroundColor?: string;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  objectPosition?: string;
  filter?: string;
  transform?: string;
  scale?: number;
  volume?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  gradient?: string;
}

export interface TrackMeta {
  originalId?: number;
  overlayType: OverlayType;
  additional?: Record<string, unknown>;
}

export interface TrackSummary {
  trackId: string; // Format: "{type}-{id}" e.g., "text-1", "video-3"
  type: TrackType;
  start: number;
  duration: number;
  row: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotation?: number;
  content?: string;
  assetId?: string; // Asset reference (e.g., 'a_K1t9BN3c') - REQUIRED for video/audio/image
  // src is NOT included - it's resolved on-demand by asset resolver for display only
  // x, y are center-based positioning (preferred by LLM)
  x?: number | "center";  // Center X position - number or "center"
  y?: number | "center";  // Center Y position - number or "center"
  captions?: Caption[];
  category?: StickerOverlay["category"];
  template?: string;
  videoStartTime?: number;
  speed?: number;
  startFromSound?: number;
  captionStyles?: CaptionStyles;
  style?: TrackStyleSnapshot;
  meta: TrackMeta;
}

export interface ProjectSummary {
  sessionId: string; // UUID for session-scoped trackId determinism
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
  tracks: TrackSummary[];
}

// Session mapping: trackId -> originalId
interface SessionMapping {
  trackIdToOriginalId: Map<string, number>;
  originalIdToTrackId: Map<number, string>;
  nextIdByType: Map<TrackType, number>;
}

// In-memory session store
const sessionStore = new Map<string, SessionMapping>();

export interface ProjectState {
  overlays: Overlay[];
  durationInFrames?: number;
  width?: number;
  height?: number;
  fps?: number;
}

export type TrackStylePatch = TrackStyleSnapshot;

export type TrackPatch = Partial<
  Omit<
    TrackSummary,
    | "trackId"
    | "meta"
    | "style"
    | "captions"
    | "captionStyles"
    | "category"
    | "type"
  >
> & {
  style?: TrackStylePatch;
  captions?: Caption[];
  captionStyles?: CaptionStyles;
  category?: StickerOverlay["category"];
  // New structured positioning (overrides x, y, left, top from TrackSummary)
  position?: {
    anchor: "center" | "top-left";
    x?: number | "center";
    y?: number | "center";
    left?: number;
    top?: number;
  };
};

export interface NewTrackInput {
  // Core properties
  type: TrackType;
  start: number;
  duration: number;
  content?: string;
  assetId?: string;
  
  // Dimensions
  width?: number;
  height?: number;
  rotation?: number;
  
  // NEW: Structured positioning with explicit anchor mode
  position?: {
    anchor: "center" | "top-left";
    // For center anchor:
    x?: number | "center";
    y?: number | "center";
    // For top-left anchor:
    left?: number;
    top?: number;
  };
  
  // Styling
  style?: TrackStylePatch;
  meta?: Partial<TrackMeta>;
  
  // Video/audio specific
  videoStartTime?: number;
  speed?: number;
  startFromSound?: number;
  
  // Caption specific
  captions?: Caption[];
  captionStyles?: CaptionStyles;
  
  // Sticker specific
  category?: StickerOverlay["category"];
  template?: string;
  
  /**
   * Explicit row placement (0-based index).
   * If specified without constraints, will error on overlap.
   * Optional if placement constraints are provided.
   */
  row?: number;
  
  /**
   * Placement constraints for automatic row selection.
   * Use instead of explicit row for intelligent placement:
   * - aboveRow: Place on first available row above target
   * - belowRow: Place on first available row below target
   * - betweenRows: Place on first available row in range
   */
  constraints?: PlacementConstraints;
}

export type ToolSuccess<T> = {
  success: true;
  data: T;
  warnings?: string[];
};

export type ToolError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ToolResult<T> = ToolSuccess<T> | ToolError;

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FPS = 30;

const DEFAULT_TEXT_STYLES: TrackStyleSnapshot = {
  fontSize: "2rem",
  fontWeight: "400",
  color: "#ffffff",
  backgroundColor: "transparent",
  fontFamily: "sans-serif",
  fontStyle: "normal",
  textDecoration: "none",
  textAlign: "center",
  opacity: 1,
};

const DEFAULT_SHAPE_STYLES: TrackStyleSnapshot = {
  fill: "#ffffff",
  stroke: "#000000",
  strokeWidth: 0,
  opacity: 1,
};

const DEFAULT_IMAGE_STYLES: TrackStyleSnapshot = {
  objectFit: "cover",
  opacity: 1,
};

const DEFAULT_VIDEO_STYLES: TrackStyleSnapshot = {
  objectFit: "cover",
  opacity: 1,
};

const DEFAULT_SOUND_STYLES: TrackStyleSnapshot = {
  volume: 1,
  opacity: 1,
};

const DEFAULT_STICKER_STYLES: TrackStyleSnapshot = {
  scale: 1,
  opacity: 1,
  fill: "#ffffff",
  stroke: "#000000",
};

const DEFAULT_ROW = 0;

// Session management helpers
const generateSessionId = (): string => {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const createSessionMapping = (): SessionMapping => ({
  trackIdToOriginalId: new Map(),
  originalIdToTrackId: new Map(),
  nextIdByType: new Map(),
});

const getOrCreateSession = (sessionId?: string): { sessionId: string; mapping: SessionMapping } => {
  if (sessionId && sessionStore.has(sessionId)) {
    return { sessionId, mapping: sessionStore.get(sessionId)! };
  }
  const newSessionId = sessionId || generateSessionId();
  const mapping = createSessionMapping();
  sessionStore.set(newSessionId, mapping);
  return { sessionId: newSessionId, mapping };
};

const generateTrackId = (type: TrackType, mapping: SessionMapping): string => {
  const nextId = mapping.nextIdByType.get(type) || 1;
  mapping.nextIdByType.set(type, nextId + 1);
  return `${type}-${nextId}`;
};

export const serializeProject = (state: ProjectState, sessionId?: string): ProjectSummary => {
  const { sessionId: actualSessionId, mapping } = getOrCreateSession(sessionId);
  
  // Create initial checkpoint if this is a new session
  if (!sessionId && state.overlays) {
    createCheckpoint(
      actualSessionId,
      state.overlays,
      "Initial project state",
      "initial"
    );
  }
  
  const width = state.width ?? DEFAULT_WIDTH;
  const height = state.height ?? DEFAULT_HEIGHT;
  const fps = state.fps ?? DEFAULT_FPS;
  const duration = Math.max(
    state.durationInFrames ?? 0,
    calculateDurationFromOverlays(state.overlays)
  );

  const tracks = state.overlays.map((overlay) => {
    // Check if we already have a trackId for this overlay in this session
    let trackId = mapping.originalIdToTrackId.get(overlay.id);
    if (!trackId) {
      // Generate new trackId
      const type = mapOverlayTypeToTrackType(overlay.type);
      trackId = generateTrackId(type, mapping);
      mapping.trackIdToOriginalId.set(trackId, overlay.id);
      mapping.originalIdToTrackId.set(overlay.id, trackId);
    }
    return mapOverlayToTrackSummary(overlay, trackId);
  });

  return {
    sessionId: actualSessionId,
    durationInFrames: duration,
    width,
    height,
    fps,
    tracks,
  };
};

export const getProjectSummary = (
  state: ProjectState,
  sessionId?: string
): ToolResult<ProjectSummary> => {
  try {
    return createSuccess(serializeProject(state, sessionId));
  } catch (error) {
    return createError("SUMMARY_FAILED", "Failed to serialize project", error);
  }
};

export const listTracks = (
  summary: ProjectSummary
): ToolResult<TrackSummary[]> => {
  return createSuccess(summary.tracks);
};

export const getTrack = (
  summary: ProjectSummary,
  trackId: string
): ToolResult<TrackSummary> => {
  const track = summary.tracks.find((t) => t.trackId === trackId);
  if (!track) {
    return createError(
      "TRACK_NOT_FOUND",
      `Track ${trackId} was not found in the provided summary.`
    );
  }
  return createSuccess(track);
};

export const editTrack = (
  state: ProjectState,
  sessionId: string,
  trackId: string,
  patch: TrackPatch
): ToolResult<{
  overlays: Overlay[];
  trackId: string;
  message: string;
}> => {
  // Validate session exists
  const mapping = sessionStore.get(sessionId);
  if (!mapping) {
    return createError(
      "INVALID_SESSION",
      `Session ${sessionId} not found. Call serializeProject first to create a session.`
    );
  }

  // Find original overlay ID from trackId
  const originalId = mapping.trackIdToOriginalId.get(trackId);
  if (!originalId) {
    return createError(
      "TRACK_NOT_FOUND",
      `Track ${trackId} was not found in session ${sessionId}.`
    );
  }

  const overlayIndex = state.overlays.findIndex(
    (overlay) => overlay.id === originalId
  );

  if (overlayIndex === -1) {
    return createError(
      "OVERLAY_NOT_FOUND",
      `Original overlay ${originalId} no longer exists. Refresh the summary.`
    );
  }

  const validationError = validateTrackPatch(patch);
  if (validationError) {
    return validationError;
  }

  // Create "before-llm" checkpoint
  createCheckpoint(
    sessionId,
    state.overlays,
    `Before editing track ${trackId}`,
    "before-llm"
  );

  const updatedOverlay = applyPatchToOverlay(
    state.overlays[overlayIndex],
    patch
  );

  const overlays = [...state.overlays];
  overlays[overlayIndex] = updatedOverlay;

  // Create "after-llm" checkpoint (will be skipped if no changes)
  createCheckpoint(
    sessionId,
    overlays,
    `After editing track ${trackId}`,
    "after-llm"
  );

  // Return overlays, trackId, and success message
  return createSuccess({ 
    overlays,
    trackId,
    message: "Track updated successfully"
  });
};

export const addTrack = (
  state: ProjectState,
  sessionId: string,
  newTrack: NewTrackInput
): ToolResult<{
  overlays: Overlay[];
  trackId: string;
  message: string;
  placement?: string;
}> => {
  // 🔍 DEBUG: Log incoming track data
  console.log('[DEBUG] addTrack called with:', {
    type: newTrack.type,
    content: newTrack.content?.substring(0, 50),
    style: newTrack.style,
    start: newTrack.start,
    duration: newTrack.duration,
    row: newTrack.row,
    constraints: newTrack.constraints,
  });

  // Validate session exists
  const mapping = sessionStore.get(sessionId);
  if (!mapping) {
    return createError(
      "INVALID_SESSION",
      `Session ${sessionId} not found. Call serializeProject first to create a session.`
    );
  }

  const validationError = validateNewTrackInput(newTrack);
  if (validationError) return validationError;

  // Resolve track placement using placement resolver
  let resolvedRow: number;
  let placementMessage: string | undefined;
  
  try {
    const placementResult = resolveTrackPlacement(
      state.overlays,
      newTrack.row,
      newTrack.start,
      newTrack.duration,
      newTrack.constraints
    );
    
    resolvedRow = placementResult.row;
    placementMessage = placementResult.message;
    
    // Note: needsNewRow is informational - the UI handles row creation automatically
    // when overlays are placed on rows beyond current visible range
    console.log('[DEBUG] Placement resolved:', {
      resolvedRow,
      needsNewRow: placementResult.needsNewRow,
      message: placementMessage,
    });
  } catch (error) {
    if (error instanceof PlacementError) {
      // Convert PlacementError to ToolError with appropriate code
      return createError(
        error.code,
        error.message
      );
    }
    // Unexpected error
    return createError(
      "PLACEMENT_FAILED",
      "Unexpected error during placement resolution",
      error
    );
  }

  // Create "before-llm" checkpoint
  createCheckpoint(
    sessionId,
    state.overlays,
    `Before adding ${newTrack.type} track`,
    "before-llm"
  );

  const overlays = [...state.overlays];
  const newId = generateOverlayId(overlays);

  try {
    // Create overlay with resolved row
    const trackWithResolvedRow = {
      ...newTrack,
      row: resolvedRow,
    };
    
    const compositionDimensions = {
      width: state.width ?? DEFAULT_WIDTH,
      height: state.height ?? DEFAULT_HEIGHT,
    };
    
    console.log('[DEBUG] Composition dimensions for centering:', compositionDimensions);
    
    const overlay = createOverlayFromTrack(trackWithResolvedRow, newId, compositionDimensions);
    
    // 🔍 DEBUG: Log created overlay
    console.log('[DEBUG] Created overlay:', {
      id: overlay.id,
      type: overlay.type,
      content: (overlay as any).content?.substring(0, 50),
      left: overlay.left,
      top: overlay.top,
      width: overlay.width,
      height: overlay.height,
      row: overlay.row,
      styles: (overlay as any).styles,
    });
    
    overlays.push(overlay);
    
    // Create "after-llm" checkpoint (will be skipped if no changes)
    createCheckpoint(
      sessionId,
      overlays,
      `After adding ${newTrack.type} track`,
      "after-llm"
    );

    const updatedSummary = serializeProject({ ...state, overlays }, sessionId);
    
    // Find the newly created track by its originalId
    const trackSummary = updatedSummary.tracks.find(
      (t) => t.meta.originalId === overlay.id
    );

    if (!trackSummary) {
      return createError(
        "TRACK_NOT_SERIALIZED",
        "New track could not be serialized after creation."
      );
    }

    // Build success message
    let message = `${newTrack.type} track created successfully`;
    if (placementMessage) {
      message += ` - ${placementMessage}`;
    }

    // Return trackId, message, placement info, and updated overlays
    return createSuccess({ 
      overlays,
      trackId: trackSummary.trackId,
      message,
      placement: placementMessage,
    });
  } catch (error) {
    return createError(
      "TRACK_CREATE_FAILED",
      "Failed to create track from provided data.",
      error
    );
  }
};

export const deleteTrack = (
  state: ProjectState,
  sessionId: string,
  trackId: string | string[]
): ToolResult<{
  overlays: Overlay[];
  message: string;
}> => {
  // Validate session exists
  const mapping = sessionStore.get(sessionId);
  if (!mapping) {
    return createError(
      "INVALID_SESSION",
      `Session ${sessionId} not found. Call serializeProject first to create a session.`
    );
  }

  // Normalize to array for uniform processing
  const trackIds = Array.isArray(trackId) ? trackId : [trackId];
  
  if (trackIds.length === 0) {
    return createError(
      "INVALID_INPUT",
      "At least one track ID must be provided"
    );
  }

  // Validate all tracks exist before deleting any
  const originalIds: number[] = [];
  const notFoundTracks: string[] = [];
  
  for (const id of trackIds) {
    const originalId = mapping.trackIdToOriginalId.get(id);
    if (!originalId) {
      notFoundTracks.push(id);
    } else {
      originalIds.push(originalId);
    }
  }

  if (notFoundTracks.length > 0) {
    return createError(
      "TRACK_NOT_FOUND",
      `Track(s) not found in session ${sessionId}: ${notFoundTracks.join(", ")}`
    );
  }

  // Create "before-llm" checkpoint
  const trackIdsList = trackIds.join(", ");
  createCheckpoint(
    sessionId,
    state.overlays,
    `Before deleting track(s): ${trackIdsList}`,
    "before-llm"
  );

  // Delete all tracks
  const overlays = state.overlays.filter(
    (overlay) => !originalIds.includes(overlay.id)
  );

  // Remove from mapping
  for (let i = 0; i < trackIds.length; i++) {
    const id = trackIds[i];
    const originalId = originalIds[i];
    mapping.trackIdToOriginalId.delete(id);
    mapping.originalIdToTrackId.delete(originalId);
  }

  // Create "after-llm" checkpoint (will be skipped if no changes)
  createCheckpoint(
    sessionId,
    overlays,
    `After deleting track(s): ${trackIdsList}`,
    "after-llm"
  );

  // Return overlays and success message
  const count = trackIds.length;
  const message = count === 1 
    ? `Track ${trackIds[0]} deleted successfully`
    : `${count} tracks deleted successfully: ${trackIdsList}`;
    
  return createSuccess({ 
    overlays,
    message
  });
};

export const overwriteProject = (
  state: ProjectState,
  summary: ProjectSummary
): ToolResult<{
  overlays: Overlay[];
  message: string;
}> => {
  try {
    // Validate session exists
    const mapping = sessionStore.get(summary.sessionId);
    if (!mapping) {
      return createError(
        "INVALID_SESSION",
        `Session ${summary.sessionId} not found. Use the sessionId from serializeProject.`
      );
    }

    const existingById = new Map<number, Overlay>();
    for (const overlay of state.overlays) {
      existingById.set(overlay.id, overlay);
    }

    let maxId = getMaxOverlayId(state.overlays);

    const overlays: Overlay[] = summary.tracks.map((track) => {
      // Try to find existing overlay by trackId -> originalId mapping
      const originalId = mapping.trackIdToOriginalId.get(track.trackId);
      const existing = originalId ? existingById.get(originalId) : undefined;
      
      if (existing) {
        return applyPatchToOverlay(existing, convertTrackToPatch(track));
      }
      
      // New track - assign new ID
      let assignedId: number;
      if (track.meta.originalId) {
        assignedId = track.meta.originalId;
        maxId = Math.max(maxId, assignedId);
      } else {
        assignedId = maxId + 1;
        maxId = assignedId;
      }

      const overlayInput = trackSummaryToNewTrackInput(track);
      const newOverlay = createOverlayFromTrack(overlayInput, assignedId, {
        width: summary.width,
        height: summary.height,
      });
      
      // Update mapping for new overlay
      mapping.trackIdToOriginalId.set(track.trackId, assignedId);
      mapping.originalIdToTrackId.set(assignedId, track.trackId);
      
      return newOverlay;
    });

    // Return overlays and success message
    return createSuccess({ 
      overlays,
      message: `Project overwritten successfully with ${overlays.length} tracks` 
    });
  } catch (error) {
    return createError(
      "OVERWRITE_FAILED",
      "Failed to overwrite project with provided summary.",
      error
    );
  }
};

const createSuccess = <T>(data: T): ToolSuccess<T> => ({ success: true, data });

const createError = (
  code: string,
  message: string,
  details?: unknown
): ToolError => ({
  success: false,
  error: {
    code,
    message,
    details,
  },
});

const calculateDurationFromOverlays = (overlays: Overlay[]): number => {
  if (!overlays.length) return 0;
  return overlays.reduce((max, overlay) => {
    const end = overlay.from + overlay.durationInFrames;
    return Math.max(max, end);
  }, 0);
};

const mapOverlayToTrackSummary = (
  overlay: Overlay,
  trackId: string
): TrackSummary => {
  const style = extractStyleSnapshot(overlay);
  const base: TrackSummary = {
    trackId,
    type: mapOverlayTypeToTrackType(overlay.type),
    start: overlay.from,
    duration: overlay.durationInFrames,
    row: overlay.row ?? DEFAULT_ROW,
    left: overlay.left,
    top: overlay.top,
    width: overlay.width,
    height: overlay.height,
    rotation: overlay.rotation,
    content: (overlay as any).content,
    style,
    meta: {
      originalId: overlay.id,
      overlayType: overlay.type,
    },
  };

  switch (overlay.type) {
    case OverlayType.VIDEO: {
      const clip = overlay as ClipOverlay;
      base.assetId = (clip as any).assetId; // Only assetId, no src
      base.videoStartTime = clip.videoStartTime;
      base.speed = clip.speed;
      break;
    }
    case OverlayType.SOUND: {
      const sound = overlay as SoundOverlay;
      base.assetId = (sound as any).assetId; // Only assetId, no src
      base.startFromSound = sound.startFromSound;
      break;
    }
    case OverlayType.IMAGE: {
      const image = overlay as ImageOverlay;
      base.assetId = (image as any).assetId; // Only assetId, no src
      break;
    }
    case OverlayType.CAPTION: {
      const caption = overlay as CaptionOverlay;
      base.captions = caption.captions;
      base.captionStyles = caption.styles;
      base.template = caption.template;
      break;
    }
    case OverlayType.STICKER: {
      const sticker = overlay as StickerOverlay;
      base.category = sticker.category;
      break;
    }
    case OverlayType.SHAPE: {
      break;
    }
    case OverlayType.TEXT: {
      break;
    }
  }

  return base;
};

const mapOverlayTypeToTrackType = (type: OverlayType): TrackType => {
  switch (type) {
    case OverlayType.VIDEO:
      return "video";
    case OverlayType.SOUND:
      return "audio";
    case OverlayType.TEXT:
      return "text";
    case OverlayType.IMAGE:
      return "image";
    case OverlayType.SHAPE:
      return "shape";
    case OverlayType.STICKER:
      return "sticker";
    case OverlayType.CAPTION:
      return "caption";
    default:
      return "text";
  }
};

const extractStyleSnapshot = (overlay: Overlay): TrackStyleSnapshot | undefined => {
  const styles: Record<string, unknown> | undefined = (overlay as any).styles;
  const snapshot: TrackStyleSnapshot = {};

  if (typeof overlay.rotation === "number") {
    snapshot.transform = `rotate(${overlay.rotation}deg)`;
  }

  if (!styles) {
    return Object.keys(snapshot).length ? snapshot : undefined;
  }

  const maybeAssign = (key: keyof TrackStyleSnapshot, value: unknown) => {
    if (value !== undefined) {
      (snapshot as any)[key] = value;
    }
  };

  maybeAssign("opacity", styles.opacity);
  maybeAssign("zIndex", styles.zIndex);
  maybeAssign("color", styles.color);
  maybeAssign("backgroundColor", styles.backgroundColor);
  maybeAssign("background", (styles as any).background);
  maybeAssign("fontSize", styles.fontSize);
  maybeAssign("fontFamily", styles.fontFamily);
  maybeAssign("fontWeight", styles.fontWeight);
  maybeAssign("fontStyle", styles.fontStyle);
  maybeAssign("textDecoration", styles.textDecoration);
  maybeAssign("lineHeight", styles.lineHeight);
  maybeAssign("letterSpacing", styles.letterSpacing);
  maybeAssign("textAlign", styles.textAlign);
  maybeAssign("textShadow", styles.textShadow);
  maybeAssign("WebkitBackgroundClip", (styles as any).WebkitBackgroundClip);
  maybeAssign("WebkitTextFillColor", (styles as any).WebkitTextFillColor);
  maybeAssign("padding", styles.padding);
  maybeAssign("paddingBackgroundColor", styles.paddingBackgroundColor);
  maybeAssign("border", styles.border);
  maybeAssign("borderRadius", styles.borderRadius);
  maybeAssign("boxShadow", styles.boxShadow);
  maybeAssign("objectFit", styles.objectFit);
  maybeAssign("objectPosition", styles.objectPosition);
  maybeAssign("filter", styles.filter);
  maybeAssign("scale", styles.scale);
  maybeAssign("volume", styles.volume);
  maybeAssign("fill", (styles as any).fill);
  maybeAssign("stroke", (styles as any).stroke);
  maybeAssign("strokeWidth", (styles as any).strokeWidth);
  maybeAssign("gradient", (styles as any).gradient);

  return Object.keys(snapshot).length ? snapshot : undefined;
};

const validateTrackPatch = (patch: TrackPatch): ToolError | null => {
  if (patch.start !== undefined && patch.start < 0) {
    return createError("INVALID_START", "Track start frame cannot be negative.");
  }

  if (patch.duration !== undefined && patch.duration <= 0) {
    return createError(
      "INVALID_DURATION",
      "Track duration must be greater than zero."
    );
  }

  if (patch.style && patch.style.volume !== undefined) {
    const volume = patch.style.volume;
    if (volume < 0 || volume > 1) {
      return createError(
        "INVALID_VOLUME",
        "Volume must be between 0 and 1 (inclusive)."
      );
    }
  }

  return null;
};

const validateNewTrackInput = (track: NewTrackInput): ToolError | null => {
  // Validate type
  if (!track.type) {
    return createError(
      "MISSING_REQUIRED_FIELD", 
      "Missing required field: 'type'. Must be one of: text, video, image, audio, shape, sticker, caption."
    );
  }

  const validTypes = ["text", "video", "image", "audio", "shape", "sticker", "caption"];
  if (!validTypes.includes(track.type)) {
    return createError(
      "INVALID_TYPE",
      `Invalid track type: '${track.type}'. Must be one of: ${validTypes.join(", ")}.`
    );
  }

  // Validate required fields by type
  if (track.type === "text" && !track.content) {
    return createError(
      "MISSING_REQUIRED_FIELD",
      "Missing required field for text track: 'content'. Text tracks must have content to display."
    );
  }

  if ((track.type === "video" || track.type === "image" || track.type === "audio")) {
    // ENFORCE: Only assetId is allowed, no direct src URLs
    if (!track.assetId) {
      return createError(
        "MISSING_REQUIRED_FIELD",
        `Missing required field for ${track.type} track: 'assetId'. You must provide an assetId from uploaded media. Use the media upload endpoint first, then use the returned assetId here. Direct URLs are not allowed.`
      );
    }
    
    console.log(`[AI-TOOLS] Using assetId: ${track.assetId} for ${track.type} track`);
  }

  if (track.type === "caption" && !track.captions) {
    return createError(
      "MISSING_REQUIRED_FIELD",
      "Missing required field for caption track: 'captions'. Provide an array of caption objects (can be empty)."
    );
  }

  // Validate duration
  if (track.duration === undefined || track.duration === null) {
    return createError(
      "MISSING_REQUIRED_FIELD",
      "Missing required field: 'duration'. All tracks must specify duration in frames."
    );
  }

  if (track.duration <= 0) {
    return createError(
      "INVALID_DURATION",
      `Invalid duration: ${track.duration}. Duration must be a positive number (in frames). Example: 90 frames = 3 seconds at 30fps.`
    );
  }

  // Validate start time
  if (track.start === undefined || track.start === null) {
    return createError(
      "MISSING_REQUIRED_FIELD",
      "Missing required field: 'start'. Specify when the track should begin on the timeline (in frames, 0 = beginning)."
    );
  }

  if (track.start < 0) {
    return createError(
      "INVALID_START_TIME",
      `Invalid start time: ${track.start}. Start must be >= 0 (beginning of timeline).`
    );
  }

  // Validate row or constraints
  if (track.row === undefined && !track.constraints) {
    return createError(
      "MISSING_REQUIRED_FIELD",
      "Missing required field: either 'row' or 'constraints' must be specified. " +
      "Use 'row' for explicit placement, or 'constraints' (aboveRow, belowRow, betweenRows) for automatic placement."
    );
  }

  if (track.row !== undefined && track.row < 0) {
    return createError(
      "INVALID_ROW",
      `Invalid row: ${track.row}. Row must be >= 0. Use 0 for bottom layer, higher numbers for layers on top.`
    );
  }
  
  // Validate constraints if provided
  if (track.constraints) {
    const { aboveRow, belowRow, betweenRows } = track.constraints;
    const constraintCount = [aboveRow, belowRow, betweenRows].filter(c => c !== undefined).length;
    
    if (constraintCount === 0) {
      return createError(
        "INVALID_CONSTRAINTS",
        "Constraints object provided but empty. Specify one of: aboveRow, belowRow, or betweenRows."
      );
    }
    
    if (constraintCount > 1) {
      return createError(
        "INVALID_CONSTRAINTS",
        "Only one constraint can be specified at a time: aboveRow, belowRow, or betweenRows."
      );
    }
  }

  // Validate positioning for visual tracks (values are in PIXELS)
  const visualTypes = ["text", "image", "video", "shape", "sticker", "caption"];
  if (visualTypes.includes(track.type)) {
    // Allow negative values for off-screen positioning (useful for animations)
    // No upper limit validation - trust LLM to use reasonable values
    
    if (track.width !== undefined && track.width <= 0) {
      return createError(
        "INVALID_SIZE",
        `Invalid width: ${track.width}. Width must be greater than 0.`
      );
    }

    if (track.height !== undefined && track.height <= 0) {
      return createError(
        "INVALID_SIZE",
        `Invalid height: ${track.height}. Height must be greater than 0.`
      );
    }
  }

  return null;
};

const applyPatchToOverlay = (overlay: Overlay, patch: TrackPatch): Overlay => {
  const updated: Overlay = { ...overlay } as Overlay;

  if (patch.start !== undefined) {
    updated.from = Math.max(0, Math.round(patch.start));
  }

  if (patch.duration !== undefined) {
    updated.durationInFrames = Math.max(1, Math.round(patch.duration));
  }

  if (patch.row !== undefined) {
    updated.row = patch.row;
  }

  // Handle new structured position object
  if (patch.position) {
    if (patch.position.anchor === "center") {
      // Convert center-based to corner-based
      const x = patch.position.x ?? "center";
      const y = patch.position.y ?? "center";
      const converted = convertCenterToCorner(
        x,
        y,
        updated.width,
        updated.height,
        DEFAULT_WIDTH, // TODO: Get from state
        DEFAULT_HEIGHT
      );
      updated.left = converted.left;
      updated.top = converted.top;
    } else {
      // Direct top-left positioning
      if (patch.position.left !== undefined) {
        updated.left = patch.position.left;
      }
      if (patch.position.top !== undefined) {
        updated.top = patch.position.top;
      }
    }
  }
  // Legacy: direct left/top from patch (for backward compatibility during transition)
  else if (patch.left !== undefined || patch.top !== undefined) {
    if (patch.left !== undefined) {
      updated.left = patch.left;
    }
    if (patch.top !== undefined) {
      updated.top = patch.top;
    }
  }
  // Legacy: direct x/y from patch (for backward compatibility during transition)  
  else if (patch.x !== undefined || patch.y !== undefined) {
    const converted = convertCenterToCorner(
      patch.x,
      patch.y,
      updated.width,
      updated.height,
      DEFAULT_WIDTH, // TODO: Get from state
      DEFAULT_HEIGHT
    );
    updated.left = converted.left;
    updated.top = converted.top;
  }

  if (patch.width !== undefined) {
    updated.width = patch.width;
  }

  if (patch.height !== undefined) {
    updated.height = patch.height;
  }

  if (patch.rotation !== undefined) {
    updated.rotation = patch.rotation;
  }

  if (patch.content !== undefined) {
    (updated as any).content = patch.content;
  }

  if (patch.assetId !== undefined) {
    if (updated.type === OverlayType.VIDEO || updated.type === OverlayType.IMAGE) {
      (updated as ClipOverlay | ImageOverlay).assetId = patch.assetId;
    }
    if (updated.type === OverlayType.SOUND) {
      (updated as SoundOverlay).assetId = patch.assetId;
    }
  }

  if (patch.videoStartTime !== undefined && updated.type === OverlayType.VIDEO) {
    (updated as ClipOverlay).videoStartTime = patch.videoStartTime;
  }

  if (patch.speed !== undefined && updated.type === OverlayType.VIDEO) {
    (updated as ClipOverlay).speed = patch.speed;
  }

  if (patch.startFromSound !== undefined && updated.type === OverlayType.SOUND) {
    (updated as SoundOverlay).startFromSound = patch.startFromSound;
  }

  if (patch.captions !== undefined && updated.type === OverlayType.CAPTION) {
    (updated as CaptionOverlay).captions = patch.captions;
  }

  if (patch.captionStyles !== undefined && updated.type === OverlayType.CAPTION) {
    (updated as CaptionOverlay).styles = patch.captionStyles;
  }

  if (patch.template !== undefined && updated.type === OverlayType.CAPTION) {
    (updated as CaptionOverlay).template = patch.template;
  }

  if (patch.category !== undefined && updated.type === OverlayType.STICKER) {
    (updated as StickerOverlay).category = patch.category;
  }

  if (patch.style) {
    applyStylePatch(updated, patch.style);
  }

  return updated;
};;

const applyStylePatch = (overlay: Overlay, patch: TrackStylePatch) => {
  const styles: Record<string, unknown> = { ...(overlay as any).styles };

  const assign = (key: string, value: unknown) => {
    if (value !== undefined) {
      styles[key] = value;
    }
  };

  assign("opacity", patch.opacity);
  assign("zIndex", patch.zIndex);
  assign("color", patch.color);
  assign("backgroundColor", patch.backgroundColor);
  assign("background", patch.background);
  assign("fontSize", normalizeFontSize(patch.fontSize));
  assign("fontFamily", patch.fontFamily);
  assign("fontWeight", patch.fontWeight);
  assign("fontStyle", patch.fontStyle);
  assign("textDecoration", patch.textDecoration);
  assign("lineHeight", patch.lineHeight);
  assign("letterSpacing", patch.letterSpacing);
  assign("textAlign", patch.textAlign);
  assign("textShadow", patch.textShadow);
  assign("WebkitBackgroundClip", patch.WebkitBackgroundClip);
  assign("WebkitTextFillColor", patch.WebkitTextFillColor);
  assign("padding", patch.padding);
  assign("paddingBackgroundColor", patch.paddingBackgroundColor);
  assign("border", patch.border);
  assign("borderRadius", patch.borderRadius);
  assign("boxShadow", patch.boxShadow);
  assign("objectFit", patch.objectFit);
  assign("objectPosition", patch.objectPosition);
  assign("filter", patch.filter);
  assign("transform", patch.transform);
  assign("scale", patch.scale);

  if (patch.volume !== undefined) {
    const volume = clamp(patch.volume, 0, 1);
    assign("volume", volume);
  }

  (overlay as any).styles = styles;
};

const normalizeFontSize = (
  fontSize: TrackStyleSnapshot["fontSize"]
): string | undefined => {
  if (fontSize === undefined) return undefined;
  if (typeof fontSize === "number") {
    return `${fontSize}px`;
  }
  return fontSize;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const generateOverlayId = (overlays: Overlay[]): number => {
  return getMaxOverlayId(overlays) + 1;
};

/**
 * Convert center-based positioning (x, y) to corner-based (left, top)
 * 
 * @param x - Center X position: number in pixels or "center"
 * @param y - Center Y position: number in pixels or "center"
 * @param width - Element width in pixels (required for center conversion)
 * @param height - Element height in pixels (required for center conversion)
 * @param canvasWidth - Canvas width for "center" calculation
 * @param canvasHeight - Canvas height for "center" calculation
 * @returns { left, top } - Corner-based position
 */
const convertCenterToCorner = (
  x: number | "center" | undefined,
  y: number | "center" | undefined,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { left: number; top: number } => {
  // Calculate center X
  let centerX: number;
  if (x === "center" || x === undefined) {
    centerX = canvasWidth / 2;
  } else {
    centerX = x;
  }
  
  // Calculate center Y
  let centerY: number;
  if (y === "center" || y === undefined) {
    centerY = canvasHeight / 2;
  } else {
    centerY = y;
  }
  
  // Convert center to top-left corner
  const left = centerX - (width / 2);
  const top = centerY - (height / 2);
  
  return { left, top };
};

const createOverlayFromTrack = (
  track: NewTrackInput,
  overlayId: number,
  dimensions: { width: number; height: number }
): Overlay => {
  // Smart dimension handling for text tracks with fontSize
  let width: number;
  let height: number;
  
  if (track.type === "text" && track.style?.fontSize && !track.width && !track.height) {
    // Auto-calculate dimensions based on fontSize
    const fontSize = typeof track.style.fontSize === 'string' 
      ? parseInt(track.style.fontSize) 
      : track.style.fontSize;
    
    if (!isNaN(fontSize) && fontSize > 0) {
      const contentLength = track.content?.length || 10;
      const estimatedCharsPerLine = 30; // Reasonable default
      const numLines = Math.max(1, Math.ceil(contentLength / estimatedCharsPerLine));
      
      // Calculate width: fontSize * average chars per line * character width ratio
      width = Math.min(dimensions.width * 0.8, fontSize * estimatedCharsPerLine * 0.6);
      
      // Calculate height: fontSize * line height * number of lines + padding
      height = fontSize * 1.4 * numLines + fontSize * 0.4; // 1.4 line height + padding
      
      console.log(`[AI-TOOLS] Auto-calculated dimensions for text with fontSize ${fontSize}px: ${Math.round(width)}x${Math.round(height)}`);
    } else {
      // Invalid fontSize, use defaults
      width = track.width ?? dimensions.width;
      height = track.height ?? dimensions.height;
    }
  } else {
    // Use provided dimensions or defaults
    width = track.width ?? dimensions.width;
    height = track.height ?? dimensions.height;
  }
  
  // Determine if this track type needs positioning
  const needsPositioning = ["text", "image", "shape", "sticker", "caption"].includes(track.type);
  
  // Process position using structured position object
  let left: number;
  let top: number;
  
  if (track.position) {
    // Use new structured positioning
    if (track.position.anchor === "center") {
      // Center-based positioning
      const x = track.position.x ?? "center";
      const y = track.position.y ?? "center";
      const converted = convertCenterToCorner(
        x,
        y,
        width,
        height,
        dimensions.width,
        dimensions.height
      );
      left = converted.left;
      top = converted.top;
      console.log(`[AI-TOOLS] Position (center anchor): x=${x}, y=${y} → left=${Math.round(left)}, top=${Math.round(top)}`);
    } else {
      // Top-left anchor positioning
      left = track.position.left ?? 0;
      top = track.position.top ?? 0;
      console.log(`[AI-TOOLS] Position (top-left anchor): left=${left}, top=${top}`);
    }
  } else if (needsPositioning) {
    // No position specified - default to center for visual tracks
    const converted = convertCenterToCorner(
      "center",
      "center",
      width,
      height,
      dimensions.width,
      dimensions.height
    );
    left = converted.left;
    top = converted.top;
    console.log(`[AI-TOOLS] No position provided for ${track.type} track, defaulting to center: left=${Math.round(left)}, top=${Math.round(top)}`);
  } else {
    // Audio/video tracks don't need positioning
    left = 0;
    top = 0;
  }
  
  const baseProps = {
    id: overlayId,
    durationInFrames: Math.max(1, Math.round(track.duration)),
    from: Math.max(0, Math.round(track.start ?? 0)),
    height,
    width,
    row: track.row ?? DEFAULT_ROW,
    left,
    top,
    rotation: track.rotation ?? 0,
    isDragging: false,
  };

  switch (track.type) {
    case "video": {
      const styles = buildStylesForOverlay(
        OverlayType.VIDEO,
        track.style,
        DEFAULT_VIDEO_STYLES
      );
      const overlay: ClipOverlay = {
        ...baseProps,
        type: OverlayType.VIDEO,
        content: track.content ?? "",
        src: "", // Will be resolved from assetId by asset resolver
        videoStartTime: track.videoStartTime ?? 0,
        speed: track.speed ?? 1,
        styles: styles as ClipOverlay["styles"],
      };
      // Store assetId (REQUIRED)
      if (track.assetId) {
        (overlay as any).assetId = track.assetId;
      }
      return overlay;
    }
    case "audio": {
      const styles = buildStylesForOverlay(
        OverlayType.SOUND,
        track.style,
        DEFAULT_SOUND_STYLES
      );
      const overlay: SoundOverlay = {
        ...baseProps,
        type: OverlayType.SOUND,
        content: track.content ?? "Audio Clip",
        src: "", // Will be resolved from assetId by asset resolver
        startFromSound: track.startFromSound ?? 0,
        styles: styles as SoundOverlay["styles"],
      };
      // Store assetId (REQUIRED)
      if (track.assetId) {
        (overlay as any).assetId = track.assetId;
      }
      return overlay;
    }
    case "text": {
      const styles = buildStylesForOverlay(
        OverlayType.TEXT,
        track.style,
        DEFAULT_TEXT_STYLES
      );
      const overlay: TextOverlay = {
        ...baseProps,
        type: OverlayType.TEXT,
        content: track.content ?? "",
        styles: styles as TextOverlay["styles"],
      };
      return overlay;
    }
    case "image": {
      const styles = buildStylesForOverlay(
        OverlayType.IMAGE,
        track.style,
        DEFAULT_IMAGE_STYLES
      );
      const overlay: ImageOverlay = {
        ...baseProps,
        type: OverlayType.IMAGE,
        content: track.content ?? "",
        src: "", // Will be resolved from assetId by asset resolver
        styles: styles as ImageOverlay["styles"],
      };
      // Store assetId (REQUIRED)
      if (track.assetId) {
        (overlay as any).assetId = track.assetId;
      }
      return overlay;
    }
    case "shape": {
      const styles = buildStylesForOverlay(
        OverlayType.SHAPE,
        track.style,
        DEFAULT_SHAPE_STYLES
      );
      const overlay: ShapeOverlay = {
        ...baseProps,
        type: OverlayType.SHAPE,
        content: track.content ?? "rectangle",
        styles: styles as ShapeOverlay["styles"],
      };
      return overlay;
    }
    case "sticker": {
      const styles = buildStylesForOverlay(
        OverlayType.STICKER,
        track.style,
        DEFAULT_STICKER_STYLES
      );
      const overlay: StickerOverlay = {
        ...baseProps,
        type: OverlayType.STICKER,
        content: track.content ?? "",
        category: track.category ?? "Default",
        styles: styles as StickerOverlay["styles"],
      };
      return overlay;
    }
    case "caption": {
      const overlay: CaptionOverlay = {
        ...baseProps,
        type: OverlayType.CAPTION,
        captions: track.captions ?? [],
        styles: track.captionStyles ?? defaultCaptionStyles,
        template: track.template,
      };
      return overlay;
    }
    default: {
      throw new Error(`Unsupported track type: ${track.type}`);
    }
  }
};

const buildStylesForOverlay = (
  overlayType: OverlayType,
  patch: TrackStylePatch | undefined,
  defaults: TrackStyleSnapshot
): Record<string, unknown> => {
  // 🔍 DEBUG: Log style building
  console.log('[DEBUG] buildStylesForOverlay called:', {
    overlayType,
    patch,
    defaults: Object.keys(defaults),
  });
  
  const styles: Record<string, unknown> = { ...defaults };
  if (!patch) {
    console.log('[DEBUG] No style patch provided, using defaults');
    return styles;
  }

  const assign = (key: string, value: unknown) => {
    if (value !== undefined) {
      styles[key] = value;
    }
  };

  assign("opacity", patch.opacity);
  assign("zIndex", patch.zIndex);
  assign("color", patch.color);
  assign("backgroundColor", patch.backgroundColor);
  assign("background", patch.background);
  assign("fontSize", normalizeFontSize(patch.fontSize));
  assign("fontFamily", patch.fontFamily);
  assign("fontWeight", patch.fontWeight);
  assign("fontStyle", patch.fontStyle);
  assign("textDecoration", patch.textDecoration);
  assign("lineHeight", patch.lineHeight);
  assign("letterSpacing", patch.letterSpacing);
  assign("textAlign", patch.textAlign);
  assign("textShadow", patch.textShadow);
  assign("WebkitBackgroundClip", patch.WebkitBackgroundClip);
  assign("WebkitTextFillColor", patch.WebkitTextFillColor);
  assign("padding", patch.padding);
  assign("paddingBackgroundColor", patch.paddingBackgroundColor);
  assign("border", patch.border);
  assign("borderRadius", patch.borderRadius);
  assign("boxShadow", patch.boxShadow);
  assign("objectFit", patch.objectFit);
  assign("objectPosition", patch.objectPosition);
  assign("filter", patch.filter);
  assign("transform", patch.transform);
  assign("scale", patch.scale);
  const currentFill = (styles as any).fill;
  assign("fill", patch.fill ?? patch.color ?? currentFill);
  assign("stroke", patch.stroke);
  assign("strokeWidth", patch.strokeWidth);
  assign("gradient", patch.gradient);

  if (overlayType === OverlayType.SOUND || overlayType === OverlayType.VIDEO) {
    if (patch.volume !== undefined) {
      assign("volume", clamp(patch.volume, 0, 1));
    }
  }

  // 🔍 DEBUG: Log final styles
  console.log('[DEBUG] Final styles built:', styles);

  return styles;
};

const convertTrackToPatch = (track: TrackSummary): TrackPatch => {
  const patch: TrackPatch = {
    start: track.start,
    duration: track.duration,
    row: track.row,
    left: track.left,
    top: track.top,
    width: track.width,
    height: track.height,
    rotation: track.rotation,
    content: track.content,
    assetId: track.assetId,
    videoStartTime: track.videoStartTime,
    speed: track.speed,
    startFromSound: track.startFromSound,
    captions: track.captions,
    captionStyles: track.captionStyles,
    template: track.template,
    category: track.category,
    style: track.style,
  };

  return patch;
};

const trackSummaryToNewTrackInput = (track: TrackSummary): NewTrackInput => {
  const input: NewTrackInput = {
    type: track.type,
    start: track.start,
    duration: track.duration,
    row: track.row,
    width: track.width,
    height: track.height,
    rotation: track.rotation,
    content: track.content,
    assetId: track.assetId,
    captions: track.captions,
    captionStyles: track.captionStyles,
    template: track.template,
    category: track.category,
    videoStartTime: track.videoStartTime,
    speed: track.speed,
    startFromSound: track.startFromSound,
    style: track.style,
  };

  // Convert old positioning fields to new position object
  if (track.x !== undefined || track.y !== undefined) {
    // Track uses center-based positioning
    input.position = {
      anchor: "center",
      x: track.x,
      y: track.y,
    };
  } else if (track.left !== undefined || track.top !== undefined) {
    // Track uses top-left positioning
    input.position = {
      anchor: "top-left",
      left: track.left,
      top: track.top,
    };
  }

  return input;
};

const getMaxOverlayId = (overlays: Overlay[]): number => {
  if (!overlays.length) return 0;
  return overlays.reduce((max, overlay) => Math.max(max, overlay.id), 0);
};

// Re-export checkpoint utilities for convenience
export {
  createCheckpoint,
  getCheckpoints,
  getCheckpoint,
  restoreCheckpoint,
  clearCheckpoints,
  getLatestCheckpoint,
  getCheckpointCount,
} from "./checkpoint-manager";
export type { Checkpoint, CheckpointType } from "./checkpoint-manager";

