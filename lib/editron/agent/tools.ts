import { tool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { projectService } from '../services/project-service';
import { generateTimelineView } from '../utils/timeline-utils';
import { Overlay, OverlayType as EditorOverlayType, HtmlGenerationMetadata } from '@/components/editron/editor/version-7.0.0/types';
import { 
  findBestRow, 
  resolveCoordinates, 
  getDefaultSize, 
  hasCollisionOnRow,
  OverlayType,
  ExistingOverlay 
} from '../core/physics';
import {
  sanitizeHtml,
  createSandboxedWrapper,
  extractStyleMetadata,
  classifyWordTimings,
  buildFancyCaptionPrompt,
  type WordTiming,
} from '../utils/html-generator-utils';


// Factory to create tools with context
export const createTools = (userId: string, projectId: string) => {
  
  // Helper to load project
  const loadProject = async () => {
    const project = await projectService.loadProject(userId, projectId);
    if (!project) throw new Error("Project not found or unauthorized.");
    return project;
  };

  // Helper to get canvas dimensions from project
  const getCanvasDimensions = (project: any) => {
    let width = project.playerDimensions?.width || 1920;
    let height = project.playerDimensions?.height || 1080;
    
    if (!project.playerDimensions) {
      if (project.aspectRatio === "9:16") { width = 1080; height = 1920; }
      else if (project.aspectRatio === "4:5") { width = 1080; height = 1350; }
      else if (project.aspectRatio === "1:1") { width = 1080; height = 1080; }
      else if (project.aspectRatio === "16:9") { width = 1920; height = 1080; }
    }
    return { width, height };
  };

  // Helper to convert overlays to ExistingOverlay format for Physics Engine
  const toExistingOverlays = (overlays: any[]): ExistingOverlay[] => {
    return overlays.map(o => ({
      id: o.id,
      row: o.row,
      from: o.from,
      durationInFrames: o.durationInFrames,
      type: o.type as OverlayType
    }));
  };

  /**
   * Helper to coerce LLM inputs to correct types.
   * Gemini sometimes sends numbers as strings (e.g., "0" instead of 0).
   * This prevents Zod validation errors.
   */
  const coerceInput = <T extends Record<string, any>>(input: T): T => {
    const result = { ...input };
    for (const key of Object.keys(result)) {
      const value = result[key];
      // Coerce string numbers to actual numbers
      if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
        (result as any)[key] = parseFloat(value);
      }
      // Coerce string booleans
      if (value === 'true') (result as any)[key] = true;
      if (value === 'false') (result as any)[key] = false;
    }
    return result;
  };


  // --- READ TOOLS ---

  const readProjectFileSchema = z.object({
    mode: z.enum(['full', 'slice', 'byTrackIds']).optional().default('full'),
    start: z.coerce.number().optional(),
    end: z.coerce.number().optional(),
    trackIds: z.array(z.string()).optional(),
  });

  const readProjectFile = tool(
    async (input: z.infer<typeof readProjectFileSchema>) => {
      try {
        const { mode, start, end, trackIds } = input;
        const project = await loadProject();

        // Canonicalize
        const canonical = JSON.stringify(project, null, 2);
        const canvas = getCanvasDimensions(project);

        // Calculate duration if missing
        let durationInFrames = project.durationInFrames || 0;
        if (durationInFrames === 0 && project.overlays && project.overlays.length > 0) {
          durationInFrames = Math.max(...project.overlays.map((o: any) => (o.from || 0) + (o.durationInFrames || 0)));
        }
        if (durationInFrames === 0) durationInFrames = 300;

        const meta = {
          totalLength: canonical.length,
          fps: project.fps,
          durationInFrames,
          ...canvas,
        };

        if (mode === 'full') {
          return JSON.stringify({ jsonText: canonical, meta });
        } else if (mode === 'slice') {
          if (start === undefined || end === undefined) return "Error: start and end required for slice mode";
          return JSON.stringify({ jsonText: canonical.substring(start, end), meta: { totalLength: canonical.length } });
        } else if (mode === 'byTrackIds') {
          if (!trackIds) return "Error: trackIds required";
          const filtered = {
            ...project,
            overlays: project.overlays.filter((o: any) => trackIds.includes(String(o.id)))
          };
          return JSON.stringify({ jsonText: JSON.stringify(filtered, Object.keys(filtered).sort(), 2), meta });
        }
        return "Error: Invalid mode";
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    },
    {
      name: 'read_project_file',
      description: 'Read the project JSON file to understand its structure, overlays, and content.',
      schema: readProjectFileSchema,
    }
  );

  const getTimelineViewSchema = z.object({
    granularity: z.enum(['coarse', 'detailed']).optional().default('detailed').describe("Level of detail: 'coarse' or 'detailed' (default: detailed)"),
    fromFrame: z.coerce.number().optional().describe("Start frame (optional, defaults to 0)"),
    toFrame: z.coerce.number().optional().describe("End frame (optional, defaults to project end)"),
    includeVideo: z.coerce.boolean().optional().default(true).describe("Include video tracks (default: true)"),
    includeAudio: z.coerce.boolean().optional().default(true).describe("Include audio tracks (default: true)"),
    includeText: z.coerce.boolean().optional().default(true).describe("Include text/captions (default: true)"),
  });

  const getTimelineView = tool(
    async (rawInput: z.infer<typeof getTimelineViewSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const fps = project.fps || 30;
        
        // Build trackTypes array based on boolean flags
        const trackTypes: Array<'text' | 'image' | 'audio' | 'video'> = [];
        if (input.includeVideo) trackTypes.push('video');
        if (input.includeAudio) trackTypes.push('audio');
        if (input.includeText) trackTypes.push('text');
        
        // Build timeWindow if specified
        const timeWindow = (input.fromFrame !== undefined && input.toFrame !== undefined)
          ? { fromFrame: input.fromFrame, toFrame: input.toFrame }
          : undefined;
        
        const view = generateTimelineView(project, { 
          granularity: input.granularity, 
          timeWindow, 
          trackTypes: trackTypes.length > 0 ? trackTypes : undefined 
        });
        
        // Detect gaps between video clips
        const videoClips = project.overlays
          .filter((o: any) => o.type === 'video')
          .sort((a: any, b: any) => a.from - b.from);
        
        const gaps: Array<{ fromFrame: number; toFrame: number; durationSeconds: number }> = [];
        for (let i = 0; i < videoClips.length - 1; i++) {
          const currentEnd = videoClips[i].from + videoClips[i].durationInFrames;
          const nextStart = videoClips[i + 1].from;
          if (nextStart > currentEnd) {
            gaps.push({
              fromFrame: currentEnd,
              toFrame: nextStart,
              durationSeconds: Math.round(((nextStart - currentEnd) / fps) * 10) / 10,
            });
          }
        }
        
        // Calculate total video duration (from first clip start to last clip end)
        const allOverlays = project.overlays.filter((o: any) => ['video', 'audio', 'text', 'caption'].includes(o.type));
        const totalDurationFrames = allOverlays.length > 0
          ? Math.max(...allOverlays.map((o: any) => o.from + o.durationInFrames))
          : 0;
        
        return JSON.stringify({
          ...view,
          totalDurationFrames,
          totalDurationSeconds: Math.round((totalDurationFrames / fps) * 10) / 10,
          videoClipCount: videoClips.length,
          gaps: gaps.length > 0 ? gaps : 'none',
          gapCount: gaps.length,
        });
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    },
    {
      name: 'get_timeline_view',
      description: `Get a visual ASCII timeline of the project. Shows:
- ASCII visualization of all clips and overlays
- Total video duration
- Gaps between video clips (if any)
- Clip counts

Call with no arguments to get full timeline.`,
      schema: getTimelineViewSchema,
    }
  );

  // --- UNIFIED ADD OVERLAY TOOL ---
  // This replaces the 4 separate add_*_overlay tools with one powerful tool

  const addOverlaySchema = z.object({
    type: z.enum(['text', 'image', 'video', 'sound', 'shape', 'sticker']).describe("Type of overlay to add"),
    
    // Timing (required)
    start: z.coerce.number().describe("Start frame (0-based)"),
    duration: z.coerce.number().describe("Duration in frames"),
    
    // Content (type-specific)
    text: z.string().optional().describe("Text content (required for type='text')"),
    assetId: z.string().optional().describe("Asset ID (required for image/video/sound)"),
    
    // Position - accepts numbers (pixels) or strings (percentages like '50%' or 'center')
    x: z.union([z.coerce.number(), z.string()]).optional().describe("X position: number for pixels, string for '50%' or 'center'. Default: center"),
    y: z.union([z.coerce.number(), z.string()]).optional().describe("Y position: number for pixels, string for '50%' or 'center'. Default: center"),
    width: z.union([z.coerce.number(), z.string()]).optional().describe("Width: number for pixels, string for '50%'. Default: type-specific"),
    height: z.union([z.coerce.number(), z.string()]).optional().describe("Height: number for pixels, string for '50%'. Default: type-specific"),
    rotation: z.coerce.number().optional().default(0),
    
    // Row override (Smart Placement by default)
    row: z.coerce.number().optional().describe("Force specific row. If omitted, Physics Engine auto-places: Videos at bottom, Text on top."),
    
    // Styles (all optional, type-specific fields ignored if not applicable)
    styles: z.object({
      // Text styles
      fontSize: z.coerce.number().optional().describe("Font size in pixels (for text). e.g., 32 for body, 48 for title"),
      fontFamily: z.enum([
        'font-sans',      // Inter (modern sans-serif)
        'font-serif',     // Merriweather (elegant serif)
        'font-mono',      // Roboto Mono (code/technical)
        'font-retro',     // VT323 (retro pixel style)
        'font-league-spartan', // League Spartan (bold display)
        'font-bungee-inline'   // Bungee Inline (fun/playful)
      ]).optional().describe("Font family (for text). Default: font-sans"),
      fontWeight: z.coerce.number().optional().describe("Font weight 400-900 (for text). Default: 700"),
      color: z.string().optional().describe("Text color hex (for text). Default: #ffffff"),
      textAlign: z.enum(['left', 'center', 'right']).optional().describe("Text alignment. Default: center"),
      backgroundColor: z.string().optional().describe("Background color (for text). Default: transparent"),
      
      // Animation (for text - recommended to use fade by default)
      animation: z.object({
        enter: z.enum([
          'fade',       // Simple fade in (default, recommended)
          'slideUp',    // Slide from bottom
          'slideRight', // Slide from left
          'scale',      // Scale up
          'bounce',     // Elastic bounce
          'floatIn',    // Smooth floating
          'flipX',      // 3D flip
          'zoomBlur',   // Zoom with blur
          'snapRotate', // Quick rotate
          'glitch',     // Digital glitch
          'swipeReveal' // Swipe reveal
        ]).optional().describe("Entry animation. Default: fade"),
        exit: z.enum([
          'fade',       // Simple fade out (default, recommended)
          'slideUp',
          'slideRight',
          'scale',
          'bounce',
          'floatIn',
          'flipX',
          'zoomBlur',
          'snapRotate',
          'glitch',
          'swipeReveal'
        ]).optional().describe("Exit animation. Default: fade"),
      }).optional().describe("Animation config. Recommended: use fade for smooth transitions"),
      
      // Media styles
      objectFit: z.enum(['cover', 'contain', 'fill']).optional().describe("Object fit (for image/video)"),
      volume: z.coerce.number().optional().describe("Volume 0-1 (for video/sound)"),
      
      // Shape styles
      fill: z.string().optional().describe("Fill color (for shape)"),
      stroke: z.string().optional().describe("Stroke color (for shape)"),
      strokeWidth: z.coerce.number().optional().describe("Stroke width (for shape)"),
      
      // Common styles
      opacity: z.coerce.number().optional().describe("Opacity 0-1"),
      borderRadius: z.string().optional().describe("Border radius (e.g. '8px')"),
    }).optional(),
    
    // Video-specific
    videoStartTime: z.coerce.number().optional().describe("Start time within source video in seconds (for video)"),
    startFromSound: z.coerce.number().optional().describe("Start time within source audio in seconds (for sound)"),
  });

  const addOverlay = tool(
    async (input: z.infer<typeof addOverlaySchema>) => {
      try {
        const project = await loadProject();
        const canvas = getCanvasDimensions(project);
        const existingOverlays = toExistingOverlays(project.overlays || []);
        
        // Validate type-specific required fields
        if (input.type === 'text' && !input.text) {
          return JSON.stringify({ status: 'error', message: "'text' field is required for type='text'" });
        }
        if (['image', 'video', 'sound'].includes(input.type) && !input.assetId) {
          return JSON.stringify({ status: 'error', message: `'assetId' field is required for type='${input.type}'` });
        }
        
        // Generate unique ID
        const id = Date.now() + Math.floor(Math.random() * 10000);
        
        // Smart row placement via Physics Engine
        const physicsType = input.type === 'sound' ? OverlayType.SOUND : 
                           input.type === 'video' ? OverlayType.VIDEO :
                           input.type === 'image' ? OverlayType.IMAGE :
                           input.type === 'text' ? OverlayType.TEXT :
                           input.type === 'shape' ? OverlayType.SHAPE :
                           OverlayType.STICKER;
        
        const row = findBestRow(
          physicsType,
          { from: input.start, duration: input.duration },
          existingOverlays,
          input.row // forceRow override
        );
        
        // Resolve coordinates using Physics Engine
        const defaultSize = getDefaultSize(physicsType);
        const coords = resolveCoordinates(
          { x: input.x, y: input.y, width: input.width, height: input.height },
          canvas,
          defaultSize
        );
        
        // Build base overlay
        const baseOverlay = {
          id,
          type: input.type,
          from: input.start,
          durationInFrames: input.duration,
          row,
          left: coords.left,
          top: coords.top,
          width: coords.width,
          height: coords.height,
          rotation: input.rotation ?? 0,
          isDragging: false,
        };
        
        // Build type-specific overlay
        let newOverlay: any;
        
        switch (input.type) {
          case 'text': {
            const fontSize = input.styles?.fontSize ?? 32;
            const textContent = input.text || '';
            const explicitLines = textContent.split('\n');
            const maxLineChars = Math.max(...explicitLines.map(l => l.length), 1);
            
            // Cap width to 90% of canvas to prevent overflow
            const maxAllowedWidth = canvas.width * 0.9;
            
            // Calculate width: auto-fit to content but cap to canvas
            const rawAutoWidth = Math.max(200, maxLineChars * fontSize * 0.6);
            const autoWidth = Math.min(rawAutoWidth, maxAllowedWidth);
            
            // If text needs to wrap, calculate wrapped height
            const charsPerLine = Math.max(1, Math.floor(autoWidth / (fontSize * 0.6)));
            let totalVisualLines = 0;
            for (const line of explicitLines) {
              totalVisualLines += line.length === 0 ? 1 : Math.ceil(line.length / charsPerLine);
            }
            const autoHeight = totalVisualLines * fontSize * 1.4;
            
            // Use auto-calculated if not specified, otherwise use resolved coords (also capped)
            const textWidth = input.width === undefined ? autoWidth : Math.min(coords.width, maxAllowedWidth);
            const textHeight = input.height === undefined ? autoHeight : coords.height;
            const textLeft = input.x === undefined ? (canvas.width - textWidth) / 2 : coords.left;
            const textTop = input.y === undefined ? (canvas.height - textHeight) / 2 : coords.top;
            
            newOverlay = {
              ...baseOverlay,
              left: textLeft,
              top: textTop,
              width: textWidth,
              height: textHeight,
              content: textContent,
              styles: {
                fontSize: `${fontSize}`,
                fontFamily: input.styles?.fontFamily ?? "font-sans",
                fontWeight: `${input.styles?.fontWeight ?? 700}`,
                textAlign: input.styles?.textAlign ?? "center",
                color: input.styles?.color ?? "#ffffff",
                backgroundColor: input.styles?.backgroundColor ?? "transparent",
                fontStyle: "normal",
                textDecoration: "none",
                opacity: input.styles?.opacity ?? 1,
                animation: { 
                  enter: input.styles?.animation?.enter ?? "fade", 
                  exit: input.styles?.animation?.exit ?? "fade", 
                  duration: 15 
                }
              }
            };
            break;
          }
            
          case 'image':
            newOverlay = {
              ...baseOverlay,
              assetId: input.assetId,
              styles: {
                objectFit: input.styles?.objectFit ?? "cover",
                opacity: input.styles?.opacity ?? 1,
                borderRadius: input.styles?.borderRadius,
                animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
              }
            };
            break;
            
          case 'video':
            newOverlay = {
              ...baseOverlay,
              assetId: input.assetId,
              videoStartTime: input.videoStartTime ?? 0,
              styles: {
                volume: input.styles?.volume ?? 1,
                objectFit: input.styles?.objectFit ?? "cover",
                opacity: input.styles?.opacity ?? 1,
                animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
              }
            };
            break;
            
          case 'sound':
            newOverlay = {
              ...baseOverlay,
              assetId: input.assetId,
              startFromSound: input.startFromSound ?? 0,
              // Sound has no visual position
              left: 0, top: 0, width: 0, height: 0,
              styles: {
                volume: input.styles?.volume ?? 1,
              }
            };
            break;
            
          case 'shape':
            newOverlay = {
              ...baseOverlay,
              content: 'rectangle', // Default shape
              styles: {
                fill: input.styles?.fill ?? "#3b82f6",
                stroke: input.styles?.stroke,
                strokeWidth: input.styles?.strokeWidth,
                opacity: input.styles?.opacity ?? 1,
                borderRadius: input.styles?.borderRadius,
              }
            };
            break;
            
          case 'sticker':
            newOverlay = {
              ...baseOverlay,
              content: 'emoji',
              category: 'Default',
              styles: {
                opacity: input.styles?.opacity ?? 1,
                animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
              }
            };
            break;
        }
        
        await projectService.addOverlay(userId, projectId, newOverlay as any);
        return JSON.stringify({ 
          status: 'success', 
          id, 
          row,
          position: { left: coords.left, top: coords.top, width: coords.width, height: coords.height },
          message: `${input.type} overlay added with ID ${id} on row ${row}` 
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_overlay',
      description: `Add an overlay to the video timeline. Supports text, image, video, sound, shape, sticker.
      
SMART PLACEMENT: If 'row' is not specified, the Physics Engine auto-places:
- Videos/Audio pack from bottom (row 0, 1...)
- Text/Images/Stickers stack on top of existing content

POSITIONING: Use percentages ('50%', 'center') or pixels. Default is centered.

TYPE-SPECIFIC FIELDS:
- text: requires 'text' field
- image/video/sound: requires 'assetId' field
- video: optional 'videoStartTime' (seconds)
- sound: optional 'startFromSound' (seconds)`,
      schema: addOverlaySchema
    }
  );

  // --- UPDATE OVERLAY (Enhanced) ---
  
  const updateOverlaySchema = z.object({
    id: z.coerce.number().describe("The ID of the overlay to update"),
    start: z.coerce.number().optional().describe("New start frame"),
    duration: z.coerce.number().optional().describe("New duration in frames"),
    text: z.string().optional().describe("New text content (for text overlays)"),
    x: z.union([z.coerce.number(), z.string()]).optional().describe("New X position (pixels or %)"),
    y: z.union([z.coerce.number(), z.string()]).optional().describe("New Y position (pixels or %)"),
    width: z.union([z.coerce.number(), z.string()]).optional().describe("New width"),
    height: z.union([z.coerce.number(), z.string()]).optional().describe("New height"),
    rotation: z.coerce.number().optional(),
    row: z.coerce.number().optional().describe("Move to specific row"),
    styles: z.any().optional().describe("Partial styles object to merge"),
  });

  const updateOverlay = tool(
    async (input: z.infer<typeof updateOverlaySchema>) => {
      try {
        const project = await loadProject();
        const canvas = getCanvasDimensions(project);
        const overlay = project.overlays.find((o: any) => o.id === input.id);
        
        if (!overlay) {
          return JSON.stringify({ status: 'error', message: "Overlay not found" });
        }
        
        const updates: any = {};
        
        // Timing updates
        if (input.start !== undefined) updates.from = input.start;
        if (input.duration !== undefined) updates.durationInFrames = input.duration;
        if (input.row !== undefined) updates.row = input.row;
        
        // Text content
        if (input.text !== undefined && overlay.type === 'text') {
          updates.content = input.text;
        }
        
        // Position updates - resolve coordinates if provided
        const hasPositionUpdate = input.x !== undefined || input.y !== undefined || 
                                  input.width !== undefined || input.height !== undefined;
        
        if (hasPositionUpdate) {
          // Use current values as defaults for missing props
          const newCoords = resolveCoordinates(
            {
              x: input.x,
              y: input.y,
              width: input.width,
              height: input.height
            },
            canvas,
            { width: overlay.width, height: overlay.height }
          );
          
          if (input.x !== undefined) updates.left = newCoords.left;
          if (input.y !== undefined) updates.top = newCoords.top;
          if (input.width !== undefined) updates.width = newCoords.width;
          if (input.height !== undefined) updates.height = newCoords.height;
        }
        
        if (input.rotation !== undefined) updates.rotation = input.rotation;
        
        // Styles merge
        if (input.styles) {
          updates.styles = { ...overlay.styles, ...input.styles };
        }
        
        await projectService.updateOverlay(userId, projectId, input.id, updates);
        return JSON.stringify({ status: 'success', message: `Overlay ${input.id} updated`, updates });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'update_overlay',
      description: 'Update an existing overlay. Provide only the fields you want to change. Supports percentage positions.',
      schema: updateOverlaySchema
    }
  );

  // --- BATCH UPDATE OVERLAYS ---
  
  const batchUpdateOverlaysSchema = z.object({
    updates: z.array(z.object({
      id: z.coerce.number().describe("Overlay ID to update"),
      start: z.coerce.number().optional(),
      duration: z.coerce.number().optional(),
      text: z.string().optional(),
      x: z.union([z.coerce.number(), z.string()]).optional(),
      y: z.union([z.coerce.number(), z.string()]).optional(),
      width: z.union([z.coerce.number(), z.string()]).optional(),
      height: z.union([z.coerce.number(), z.string()]).optional(),
      rotation: z.coerce.number().optional(),
      row: z.coerce.number().optional(),
      styles: z.any().optional(),
    })).describe("Array of updates to apply")
  });

  const batchUpdateOverlays = tool(
    async (input: z.infer<typeof batchUpdateOverlaysSchema>) => {
      try {
        const project = await loadProject();
        const canvas = getCanvasDimensions(project);
        const results: any[] = [];
        
        for (const update of input.updates) {
          const overlay = project.overlays.find((o: any) => o.id === update.id);
          if (!overlay) {
            results.push({ id: update.id, status: 'error', message: 'Not found' });
            continue;
          }
          
          const updates: any = {};
          
          if (update.start !== undefined) updates.from = update.start;
          if (update.duration !== undefined) updates.durationInFrames = update.duration;
          if (update.row !== undefined) updates.row = update.row;
          if (update.text !== undefined && overlay.type === 'text') updates.content = update.text;
          if (update.rotation !== undefined) updates.rotation = update.rotation;
          
          // Position
          if (update.x !== undefined || update.y !== undefined || update.width !== undefined || update.height !== undefined) {
            const newCoords = resolveCoordinates(
              { x: update.x, y: update.y, width: update.width, height: update.height },
              canvas,
              { width: overlay.width, height: overlay.height }
            );
            if (update.x !== undefined) updates.left = newCoords.left;
            if (update.y !== undefined) updates.top = newCoords.top;
            if (update.width !== undefined) updates.width = newCoords.width;
            if (update.height !== undefined) updates.height = newCoords.height;
          }
          
          if (update.styles) {
            updates.styles = { ...overlay.styles, ...update.styles };
          }
          
          await projectService.updateOverlay(userId, projectId, update.id, updates);
          results.push({ id: update.id, status: 'success' });
        }
        
        return JSON.stringify({ 
          status: 'success', 
          message: `Batch updated ${results.filter(r => r.status === 'success').length}/${input.updates.length} overlays`,
          results 
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'batch_update_overlays',
      description: 'Update multiple overlays in a single operation. Use this when changing multiple elements at once (e.g., "make all text blue").',
      schema: batchUpdateOverlaysSchema
    }
  );

  // --- SPLIT OVERLAY ---
  
  const splitOverlaySchema = z.object({
    id: z.coerce.number().describe("ID of the overlay to split"),
    atFrame: z.coerce.number().describe("Frame at which to split the overlay"),
  });

  const splitOverlay = tool(
    async (input: z.infer<typeof splitOverlaySchema>) => {
      try {
        const project = await loadProject();
        const overlay = project.overlays.find((o: any) => o.id === input.id);
        
        if (!overlay) {
          return JSON.stringify({ status: 'error', message: 'Overlay not found' });
        }
        
        const overlayEnd = overlay.from + overlay.durationInFrames;
        
        if (input.atFrame <= overlay.from || input.atFrame >= overlayEnd) {
          return JSON.stringify({ status: 'error', message: 'Split point must be within the overlay duration' });
        }
        
        // Calculate durations
        const firstDuration = input.atFrame - overlay.from;
        const secondDuration = overlayEnd - input.atFrame;
        
        // Update original overlay (first part)
        await projectService.updateOverlay(userId, projectId, input.id, {
          durationInFrames: firstDuration
        });
        
        // Create second part
        const newId = Date.now() + Math.floor(Math.random() * 10000);
        
        // For video overlays, update videoStartTime so the second part continues from where the first ended
        // videoStartTime is in FRAMES (used by OffthreadVideo's startFrom prop)
        const isVideo = overlay.type === 'video';
        const isSound = overlay.type === 'sound';
        const secondOverlay = {
          ...overlay,
          id: newId,
          from: input.atFrame,
          durationInFrames: secondDuration,
          // Update videoStartTime: add the first part's duration (in frames) to continue playback
          ...(isVideo && {
            videoStartTime: (overlay.videoStartTime || 0) + firstDuration,
          }),
          // Update startFromSound for audio overlays (also in frames)
          ...(isSound && {
            startFromSound: (overlay.startFromSound || 0) + firstDuration,
          }),
        };
        
        await projectService.addOverlay(userId, projectId, secondOverlay as any);
        
        return JSON.stringify({
          status: 'success',
          message: `Split overlay ${input.id} at frame ${input.atFrame}`,
          firstPart: { id: input.id, from: overlay.from, duration: firstDuration },
          secondPart: { id: newId, from: input.atFrame, duration: secondDuration }
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'split_overlay',
      description: 'Split an overlay at a specific frame into two separate overlays.',
      schema: splitOverlaySchema
    }
  );

  // --- TRIM OVERLAY ---
  
  const trimOverlaySchema = z.object({
    id: z.coerce.number().describe("ID of the overlay to trim"),
    trimStart: z.coerce.number().optional().describe("Frames to remove from the start (positive = shorter)"),
    trimEnd: z.coerce.number().optional().describe("Frames to remove from the end (positive = shorter)"),
  });

  const trimOverlay = tool(
    async (rawInput: z.infer<typeof trimOverlaySchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const overlay = project.overlays.find((o: any) => o.id === input.id);
        
        if (!overlay) {
          return JSON.stringify({ status: 'error', message: 'Overlay not found' });
        }
        
        const updates: any = {};
        let newFrom = overlay.from;
        let newDuration = overlay.durationInFrames;
        
        if (input.trimStart !== undefined && input.trimStart > 0) {
          newFrom += input.trimStart;
          newDuration -= input.trimStart;
          
          // For video/sound overlays, update the internal start time
          // so playback begins from the correct position after trimming
          if (overlay.type === 'video') {
            updates.videoStartTime = (overlay.videoStartTime || 0) + input.trimStart;
          }
          if (overlay.type === 'sound') {
            updates.startFromSound = (overlay.startFromSound || 0) + input.trimStart;
          }
        }
        
        if (input.trimEnd !== undefined && input.trimEnd > 0) {
          newDuration -= input.trimEnd;
        }
        
        if (newDuration <= 0) {
          const totalTrim = (input.trimStart || 0) + (input.trimEnd || 0);
          return JSON.stringify({ 
            status: 'error', 
            message: `Trim too large: overlay is ${overlay.durationInFrames} frames, but tried to trim ${totalTrim} frames. Max trimEnd: ${overlay.durationInFrames - 1}`,
          });
        }
        
        updates.from = newFrom;
        updates.durationInFrames = newDuration;
        
        await projectService.updateOverlay(userId, projectId, input.id, updates);
        
        return JSON.stringify({
          status: 'success',
          message: `Trimmed overlay ${input.id}`,
          newTiming: { from: newFrom, duration: newDuration }
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'trim_overlay',
      description: 'Trim frames from the start or end of an overlay.',
      schema: trimOverlaySchema
    }
  );

  // --- DELETE OVERLAY ---
  
  const deleteOverlaySchema = z.object({
    id: z.coerce.number().describe("The ID of the overlay to delete"),
  });

  const deleteOverlay = tool(
    async (input: z.infer<typeof deleteOverlaySchema>) => {
      try {
        const project = await loadProject();
        const overlay = project.overlays.find((o: any) => o.id === input.id);
        
        // If deleting a video, also delete any linked captions
        if (overlay?.type === 'video') {
          const linkedCaptions = project.overlays.filter(
            (o: any) => o.type === 'caption' && o.sourceVideoId === input.id
          );
          for (const caption of linkedCaptions) {
            await projectService.deleteOverlay(userId, projectId, caption.id);
          }
        }
        
        await projectService.deleteOverlay(userId, projectId, input.id);
        return JSON.stringify({ status: 'success', message: `Overlay ${input.id} deleted${overlay?.type === 'video' ? ' (and linked captions)' : ''}` });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'delete_overlay',
      description: 'Delete an overlay by its ID. If deleting a video, also deletes any linked captions.',
      schema: deleteOverlaySchema
    }
  );

  // --- SYNC STYLE ---
  
  const syncStyleSchema = z.object({
    sourceId: z.coerce.number().describe("ID of the overlay to copy styles FROM"),
    targetIds: z.array(z.coerce.number()).describe("IDs of overlays to apply styles TO"),
    properties: z.array(z.string()).optional().describe("Specific style properties to copy (e.g. ['color', 'fontSize']). If omitted, copies all styles."),
  });

  const syncStyle = tool(
    async (input: z.infer<typeof syncStyleSchema>) => {
      try {
        const project = await loadProject();
        const source = project.overlays.find((o: any) => o.id === input.sourceId);
        
        if (!source) {
          return JSON.stringify({ status: 'error', message: 'Source overlay not found' });
        }
        
        const sourceStyles = source.styles || {};
        const results: any[] = [];
        
        for (const targetId of input.targetIds) {
          const target = project.overlays.find((o: any) => o.id === targetId);
          if (!target) {
            results.push({ id: targetId, status: 'error', message: 'Not found' });
            continue;
          }
          
          // Build update
          let stylesToApply: any;
          
          if (input.properties && input.properties.length > 0) {
            // Copy only specified properties
            stylesToApply = {};
            for (const prop of input.properties) {
              if (sourceStyles[prop] !== undefined) {
                stylesToApply[prop] = sourceStyles[prop];
              }
            }
          } else {
            // Copy all styles
            stylesToApply = { ...sourceStyles };
          }
          
          await projectService.updateOverlay(userId, projectId, targetId, {
            styles: { ...target.styles, ...stylesToApply }
          });
          
          results.push({ id: targetId, status: 'success' });
        }
        
        return JSON.stringify({
          status: 'success',
          message: `Synced styles from ${input.sourceId} to ${results.filter(r => r.status === 'success').length} overlays`,
          results
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'sync_style',
      description: 'Copy styles from one overlay to multiple others. Use this for "make these look like that one".',
      schema: syncStyleSchema
    }
  );

  // --- VISUAL INSPECT FRAME ---
  
  const visualInspectFrameSchema = z.object({
    frame: z.coerce.number(),
    question: z.string().optional(),
  });

  const visualInspectFrame = tool(
    async (input: z.infer<typeof visualInspectFrameSchema>) => {
      const { frame, question } = input;
      return JSON.stringify({
        action: 'capture_frame',
        frame,
        question
      });
    },
    {
      name: 'visual_inspect_frame',
      description: 'Inspect a visual frame of the video to check for layout, overlaps, or aesthetic issues.',
      schema: visualInspectFrameSchema,
    }
  );


  // 7. Generate HTML Scene
  const generateHtmlSceneSchema = z.object({
    start: z.coerce.number().describe("Start frame (0-based)"),
    duration: z.coerce.number().describe("Duration in frames"),
    row: z.coerce.number().optional().describe("Row index"),
    description: z.string().describe("Detailed description of the scene to generate (e.g., 'Retro vaporwave grid background with animated sun')"),
    x: z.coerce.number().optional().describe("Center X position"),
    y: z.coerce.number().optional().describe("Center Y position"),
    width: z.coerce.number().optional().describe("Width in pixels"),
    height: z.coerce.number().optional().describe("Height in pixels"),
    rotation: z.coerce.number().optional().default(0),
  });

  const generateHtmlScene = tool(
    async (input: z.infer<typeof generateHtmlSceneSchema>) => {
      try {
        const project = await loadProject(); // Load project to get dimensions
        const { width, height, aspectRatio } = project.playerDimensions 
          ? { ...project.playerDimensions, aspectRatio: project.aspectRatio } 
          : { width: 1920, height: 1080, aspectRatio: "16:9" };
        const safeWidth = width || 1920;
        const safeHeight = height || 1080;

        const id = Date.now() + Math.floor(Math.random() * 10000);

        // Call Sub-Agent
        const model = new ChatGoogleGenerativeAI({
          model: 'gemini-2.5-flash',
          apiKey: process.env.GEMINI_API_KEY,
          temperature: 0.7, // Higher temp for creativity
        });

        const durationSeconds = Math.round(input.duration / 30);
        
        const systemPrompt = `You are a world-class motion graphics designer creating AESTHETIC VIDEO BACKGROUNDS.
Generate a self-contained HTML/CSS/JS fragment for video production.

═══════════════════════════════════════════════════════════════════
CANVAS: ${safeWidth}×${safeHeight}px | Aspect Ratio: ${project.aspectRatio || '16:9'} | Duration: ~${durationSeconds}s
═══════════════════════════════════════════════════════════════════

▸ DESIGN PHILOSOPHY (CRITICAL):
  • Create SEAMLESS, PROFESSIONAL backgrounds that enhance video content
  • Subtle, non-distracting motion - the background supports, not competes
  • Harmonious 2-3 color palette max (use HSL for sophisticated colors)
  • SOFT gradients, blur effects, and organic movement

▸ PREFERRED STYLES (pick one or combine):
  ✓ Smooth multi-stop gradients (linear, radial, conic) with subtle animation
  ✓ Soft-blurred floating shapes (circles, blobs with filter:blur)
  ✓ Grid/dot patterns (subtle, low opacity)
  ✓ SVG mesh gradient effects
  ✓ Glassmorphism with backdrop-blur
  ✓ Noise/grain texture overlays
  ✓ Particle systems with glow (small, blurred, slow-moving)

▸ AVOID:
  ✗ Sharp-edged random shapes without blur (looks cheap)
  ✗ Too many colors (overwhelming)
  ✗ Fast, distracting animations
  ✗ Overly complex patterns
  ✗ Harsh color contrasts

▸ LAYOUT RULES (CRITICAL):
  • Outer wrapper: \`position:absolute; inset:0; width:100%; height:100%; overflow:hidden;\`
  • NO viewport units (\`vw\`, \`vh\`, \`vmin\`, \`vmax\`) - they break in video render
  • Use \`%\` for layout, \`px\` for fixed elements scaled to ${safeWidth}×${safeHeight}

▸ ANIMATION SYNC:
  • CSS variables available: \`--time\` (seconds), \`--progress\` (0→1), \`--duration\`
  • Use CSS @keyframes - host controls timing via animation-delay
  • For looping backgrounds: \`animation: x ${durationSeconds}s linear infinite;\`

▸ ALLOWED CDN RESOURCES:
  ✓ Google Fonts: \`<link href="https://fonts.googleapis.com/css2?family=...">\`
  ✓ Heroicons/Lucide SVGs: \`<img src="https://unpkg.com/lucide-static@latest/icons/...">\`
  ✓ Placeholder images: \`https://picsum.photos/800/600\` or \`https://placehold.co/\`
  ✓ Lottie animations: \`https://unpkg.com/@lottiefiles/lottie-player@latest\`
  ✓ Simple utility libs: GSAP from \`https://cdnjs.cloudflare.com/ajax/libs/gsap/\`

▸ AVOID:
  ✗ Three.js / heavy 3D libraries (performance issues in render)
  ✗ External API calls / fetch requests
  ✗ User input elements (forms, buttons with handlers)
  ✗ Audio elements (handled by separate audio tracks)
  ✗ localStorage / cookies / IndexedDB
  ✗ \`document.addEventListener("DOMContentLoaded")\` - code runs immediately
  ✗ Complex/detailed SVG graphics (low rendering accuracy - keep SVGs simple)

▸ CAPABILITIES:
  • Simple inline SVG graphics (basic icons, shapes - NOT complex illustrations)
  • CSS gradients, masks, clip-paths, filters, backdrop-blur
  • Keyframe animations, transitions, transforms
  • Text effects (gradients, shadows, animations)
  • Pseudo-elements (::before, ::after)
  • Google Fonts for typography
  • Great for: backgrounds, title cards, lower thirds, simple infographics

▸ OUTPUT FORMAT:
  Return ONLY the raw HTML string starting with \`<\`. 
  NO markdown fences. NO explanations. NO comments outside code.`;

        const result = await model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(`Create: ${input.description}`)
        ]);

        const generatedHtml = result.content as string;
        const rawHtml = generatedHtml.replace(/```html/g, '').replace(/```/g, '').trim();
        
        // Clean up the HTML - remove markdown fences, DOCTYPE, html/body tags
        let cleanHtml = rawHtml
          .replace(/<!DOCTYPE[^>]*>/gi, '')
          .replace(/<\/?html[^>]*>/gi, '')
          .replace(/<\/?body[^>]*>/gi, '')
          .replace(/<\/?head[^>]*>/gi, '')
          .replace(/<meta[^>]*>/gi, '')
          .replace(/<title[^>]*>.*?<\/title>/gi, '')
          .trim();
        
        // Sanitize for security
        cleanHtml = sanitizeHtml(cleanHtml);
        
        // Wrap in sandbox container
        const overlayWidth = input.width ?? safeWidth;
        const overlayHeight = input.height ?? safeHeight;
        const wrappedHtml = createSandboxedWrapper({
          html: cleanHtml,
          width: overlayWidth,
          height: overlayHeight,
          backgroundColor: 'transparent',
          autoFit: true,
        });

        
        // Extract metadata for style consistency
        const styleMetadata = extractStyleMetadata(cleanHtml);
        const metadata: HtmlGenerationMetadata = {
          ...styleMetadata,
          generatedAt: new Date(),
          sourceType: 'scene',
        };
        
        // Use physics engine for row placement (HTML_SCENE is a bottom type, so starts at row 0)
        const existingOverlays = toExistingOverlays(project.overlays || []);
        const timeRange = { from: input.start, duration: input.duration };
        const assignedRow = input.row ?? findBestRow('html-scene' as any, timeRange, existingOverlays);
        
        const newOverlay = {
          id,
          type: 'html-scene',
          from: input.start,
          durationInFrames: input.duration,
          content: wrappedHtml,
          prompt: input.description,
          metadata,
          row: assignedRow,
          // Position at 0,0 for full-screen scenes (unless user specifies x/y)
          left: input.x !== undefined ? (input.x - overlayWidth / 2) : 0,
          top: input.y !== undefined ? (input.y - overlayHeight / 2) : 0,
          width: overlayWidth,
          height: overlayHeight,
          rotation: input.rotation ?? 0,
          isDragging: false,
          styles: {
            animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
          }
        };

        await projectService.addOverlay(userId, projectId, newOverlay as any);
        
        // Return a SANITIZED message to the main agent so it doesn't see (and repeat) the code.
        return JSON.stringify({ 
          status: 'success', 
          id,
          metadata: { fonts: metadata.fonts, colors: metadata.colors.slice(0, 3) },
          message: `Generated HTML scene for "${input.description}". Resolution: ${safeWidth}x${safeHeight}. Fonts: ${metadata.fonts.join(', ') || 'system'}. (Code hidden from chat log)` 
        });

      } catch (e: any) {
         console.error("HTML Generation Error:", e);
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'generate_html_scene',
      description: 'Generate a custom, creative HTML/CSS animated scene, background, or infographic using AI. Returns the track ID.',
      schema: generateHtmlSceneSchema
    }
  );

  // 8. Generate HTML Sticker
  const generateHtmlStickerSchema = z.object({
    start: z.coerce.number().describe("Start frame (0-based)"),
    duration: z.coerce.number().describe("Duration in frames"),
    description: z.string().describe("Description of the sticker/element (e.g., 'Glowing fire emoji', 'Animated subscribe badge', 'Sparkle burst effect')"),
    
    // Position (flexible - supports % or px, defaults to center)
    x: z.union([z.coerce.number(), z.string()]).optional().describe("X position: number for pixels, '50%' for center. Default: center"),
    y: z.union([z.coerce.number(), z.string()]).optional().describe("Y position: number for pixels, '50%' for center. Default: center"),
    
    // Size (customizable - defaults to 200x200)
    width: z.coerce.number().optional().describe("Width in pixels. Default: 200"),
    height: z.coerce.number().optional().describe("Height in pixels. Default: 200"),
    
    // Animations
    enterAnimation: z.enum([
      "fade", "pop", "bounce", "slideUp", "slideDown", 
      "slideLeft", "slideRight", "scale", "spin", "elastic"
    ]).optional().describe("Entry animation. Default: pop"),
    exitAnimation: z.enum([
      "fade", "pop", "shrink", "slideUp", "slideDown",
      "slideLeft", "slideRight", "scale", "spin"
    ]).optional().describe("Exit animation. Default: fade"),
    
    // Optional
    rotation: z.coerce.number().optional().default(0),
    row: z.coerce.number().optional().describe("Force specific row. If omitted, auto-placed above other content."),
  });

  const generateHtmlSticker = tool(
    async (input: z.infer<typeof generateHtmlStickerSchema>) => {
      try {
        const project = await loadProject();
        const canvas = getCanvasDimensions(project);
        
        const id = Date.now() + Math.floor(Math.random() * 10000);
        
        // Default dimensions
        const stickerWidth = input.width ?? 200;
        const stickerHeight = input.height ?? 200;
        
        // Resolve position using physics engine
        const coords = resolveCoordinates(
          { 
            x: input.x ?? '50%', 
            y: input.y ?? '50%', 
            width: stickerWidth, 
            height: stickerHeight 
          },
          canvas,
          { width: stickerWidth, height: stickerHeight }
        );
        
        // Animation settings
        const enterAnim = input.enterAnimation ?? "pop";
        const exitAnim = input.exitAnimation ?? "fade";
        const durationSeconds = Math.round(input.duration / 30);
        
        // Call Sub-Agent for HTML generation
        const model = new ChatGoogleGenerativeAI({
          model: 'gemini-2.5-flash',
          apiKey: process.env.GEMINI_API_KEY,
          temperature: 0.8, // Higher creativity for stickers
        });
        
        const systemPrompt = `You are a creative motion graphics designer creating ANIMATED STICKER ELEMENTS.
Generate a SELF-CONTAINED HTML/CSS sticker with LOOPING ANIMATION.

═══════════════════════════════════════════════════════════════════
STICKER CONTAINER: ${stickerWidth}×${stickerHeight}px${input.width && input.height ? '' : ' (default size - adjust if needed)'} | Duration: ~${durationSeconds}s
═══════════════════════════════════════════════════════════════════

▸ LAYOUT RULES (CRITICAL):
  • Outer wrapper: \`position: absolute; inset: 0; width: 100%; height: 100%; background: transparent;\`
  • Use \`display: flex; justify-content: center; align-items: center;\` for centering
  • Main content: size at 60-80% of container for breathing room
  • Glow/shadow CAN extend beyond bounds (no overflow:hidden)

▸ ANIMATION IS MANDATORY ❗
  • EVERY sticker MUST have a looping idle animation
  • Use CSS @keyframes with \`animation: name 2-3s ease-in-out infinite;\`
  • Animation ideas: pulse, glow, float, wiggle, spin, breathe, flicker
  • Host handles entry (\`${enterAnim}\`) and exit (\`${exitAnim}\`) - YOU handle IDLE loop

▸ WHEN TO USE WHAT (IMPORTANT):
  📝 EMOJI CHARACTERS (best for reactions):
     • Use actual emoji: 🔥 ✨ 💯 🎉 👍 etc.
     • Style with: font-size, text-shadow, filter:drop-shadow
     • Always add animation (pulse, bounce, glow)
     • Example: \`<span style="font-size: 80px; animation: pulse 2s infinite;">🔥</span>\`
  
  🎨 CSS SHAPES (best for badges, bubbles, abstract):
     • Use div + border-radius, gradients, shadows
     • Great for: badges, callouts, circles, rectangles
     • Use pseudo-elements (::before, ::after) for layered effects
     • Example: Subscribe badge, Like button, notification bubble
  
  ✏️ SIMPLE SVG (best for icons, symbols, custom shapes):
     • Use for: arrows, checkmarks, stars, simple icons
     • Keep SVG paths simple (< 10 path commands)
     • Animate with CSS (transform, opacity, stroke-dashoffset)
     • Inline SVG only, NOT external files
  
  🖼️ LUCIDE ICONS (best for UI elements):
     • URL: \`https://unpkg.com/lucide-static@latest/icons/{name}.svg\`
     • Names: heart, star, thumbs-up, check, x, play, pause, etc.
     • Load as img, style with CSS filters for color
     • Example: \`<img src="https://unpkg.com/lucide-static@latest/icons/heart.svg" style="filter: invert(1);">\`

▸ DO NOT USE:
  ✗ Complex SVGs (break rendering)
  ✗ External fonts (slow loading)
  ✗ Three.js / heavy libraries
  ✗ Fixed pixel sizes (use % for scalability)
  ✗ Viewport units (vw, vh)
  ✗ Static content with no animation

▸ OUTPUT:
  Return ONLY raw HTML starting with \`<\`.
  NO markdown. NO explanation.`;

        const result = await model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(`Create: ${input.description}`)
        ]);

        const generatedHtml = result.content as string;
        const rawHtml = generatedHtml.replace(/```html/g, '').replace(/```/g, '').trim();
        
        // Clean up the HTML - remove DOCTYPE, html/body tags
        let cleanHtml = rawHtml
          .replace(/<!DOCTYPE[^>]*>/gi, '')
          .replace(/<\/?html[^>]*>/gi, '')
          .replace(/<\/?body[^>]*>/gi, '')
          .replace(/<\/?head[^>]*>/gi, '')
          .replace(/<meta[^>]*>/gi, '')
          .replace(/<title[^>]*>.*?<\/title>/gi, '')
          .trim();
        
        // Sanitize for security
        cleanHtml = sanitizeHtml(cleanHtml);
        
        // Wrap in sandbox container with auto-fit
        const wrappedHtml = createSandboxedWrapper({
          html: cleanHtml,
          width: stickerWidth,
          height: stickerHeight,
          backgroundColor: 'transparent',
          autoFit: true,
        });

        console.log('[HTML-STICKER] Generated HTML length:', cleanHtml.length);

        
        // Extract metadata for style consistency
        const styleMetadata = extractStyleMetadata(cleanHtml);
        const metadata: HtmlGenerationMetadata = {
          ...styleMetadata,
          generatedAt: new Date(),
          sourceType: 'sticker',
        };

        // Smart row placement - stickers go on top (use TEXT type for physics since html-sticker isn't in physics enum)
        const existingOverlays = toExistingOverlays(project.overlays || []);
        const assignedRow = input.row ?? findBestRow(
          OverlayType.TEXT,  // Use TEXT for physics - stickers stack like text
          { from: input.start, duration: input.duration }, 
          existingOverlays
        );

        const newOverlay = {
          id,
          type: 'html-sticker',
          from: input.start,
          durationInFrames: input.duration,
          content: wrappedHtml,
          prompt: input.description,
          metadata,
          row: assignedRow,
          left: coords.left,
          top: coords.top,
          width: stickerWidth,
          height: stickerHeight,
          rotation: input.rotation ?? 0,
          isDragging: false,
          styles: {
            animation: { 
              enter: enterAnim, 
              exit: exitAnim, 
              duration: 15 
            }
          }
        };

        console.log('[HTML-STICKER] Creating overlay:', JSON.stringify(newOverlay, null, 2));
        
        await projectService.addOverlay(userId, projectId, newOverlay as any);
        
        console.log('[HTML-STICKER] Overlay added successfully, ID:', id);
        
        return JSON.stringify({ 
          status: 'success', 
          id,
          row: assignedRow,
          position: { left: coords.left, top: coords.top, width: stickerWidth, height: stickerHeight },
          animations: { enter: enterAnim, exit: exitAnim },
          metadata: { fonts: metadata.fonts, colors: metadata.colors.slice(0, 3) },
          message: `Generated HTML sticker "${input.description}". Size: ${stickerWidth}×${stickerHeight}px. (Code hidden)` 
        });

      } catch (e: any) {
        console.error("HTML Sticker Generation Error:", e);
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'generate_html_sticker',
      description: `Generate a custom animated HTML/CSS sticker or decorative element with TRANSPARENT background.

USE FOR: Emojis, badges, icons, sparkles, callouts, pop-up elements, decorative effects.

FEATURES:
- Transparent background (overlays on video)
- Customizable size (default 200×200px)
- Flexible positioning (% or px)
- Entry animations: pop, bounce, spin, elastic, slideUp/Down/Left/Right
- Exit animations: fade, shrink, spin, slideUp/Down/Left/Right

EXAMPLE PROMPTS:
- "Glowing fire emoji with pulse effect"
- "Animated subscribe button with sparkles"
- "Rotating star burst effect"
- "Bouncing thumbs up emoji"`,
      schema: generateHtmlStickerSchema
    }
  );

  // ============================================================================
  // VIDEO AUTO-EDIT TOOLS (Phase 2)
  // ============================================================================

  // --- GET VIDEO TRANSCRIPTION ---
  const getVideoTranscriptionSchema = z.object({
    videoOverlayId: z.coerce.number().describe("ID of the video overlay to transcribe"),
    forceRefresh: z.coerce.boolean().optional().describe("Force re-transcription (ignores cache)"),
    mode: z.enum(['single', 'timeline']).optional().default('single').describe("'single' = one video overlay, 'timeline' = all video clips in sequence order"),
  });

  const getVideoTranscription = tool(
    async (rawInput: z.infer<typeof getVideoTranscriptionSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const fps = project.fps || 30;
        
        const { getTranscription, getWordsInRange } = await import('../services/media');
        
        if (input.mode === 'timeline') {
          // Get all video overlays sorted by timeline position
          const videoOverlays = project.overlays
            .filter((o: any) => o.type === 'video' && o.assetId)
            .sort((a: any, b: any) => a.from - b.from);
          
          if (videoOverlays.length === 0) {
            return JSON.stringify({ status: 'error', message: 'No video overlays found in project' });
          }
          
          // Build combined transcript in timeline order
          const segments: Array<{
            clipId: number;
            from: number;
            transcript: string;
            wordCount: number;
          }> = [];
          
          let fullTranscript = '';
          
          for (const video of videoOverlays) {
            const transcription = await getTranscription(video.assetId, userId, {
              forceRefresh: input.forceRefresh,
            });
            
            // Get only words that fall within this clip's range
            const videoStartMs = (video.videoStartTime || 0) * 1000;
            const clipDurationMs = (video.durationInFrames / fps) * 1000;
            const videoEndMs = videoStartMs + clipDurationMs;
            
            const wordsInClip = transcription.words.filter(
              (w: any) => w.startMs >= videoStartMs && w.endMs <= videoEndMs
            );
            
            const clipTranscript = wordsInClip.map((w: any) => w.word).join(' ');
            
            segments.push({
              clipId: video.id,
              from: video.from,
              transcript: clipTranscript,
              wordCount: wordsInClip.length,
            });
            
            fullTranscript += (fullTranscript ? ' ' : '') + clipTranscript;
          }
          
          return JSON.stringify({
            status: 'success',
            mode: 'timeline',
            clipCount: segments.length,
            transcript: fullTranscript,
            segments,
            message: `Combined transcript from ${segments.length} clips in timeline order`,
          });
          
        } else {
          // Single video mode (original behavior)
          const overlay = project.overlays.find((o: any) => o.id === input.videoOverlayId);
          
          if (!overlay) {
            return JSON.stringify({ status: 'error', message: 'Video overlay not found' });
          }
          
          if (overlay.type !== 'video') {
            return JSON.stringify({ status: 'error', message: 'Overlay is not a video' });
          }
          
          if (!overlay.assetId) {
            return JSON.stringify({ status: 'error', message: 'Video has no asset ID (not uploaded)' });
          }
          
          const transcription = await getTranscription(overlay.assetId, userId, {
            forceRefresh: input.forceRefresh,
          });
          
          // Get words in this clip's range only
          const videoStartMs = (overlay.videoStartTime || 0) * 1000;
          const clipDurationMs = (overlay.durationInFrames / fps) * 1000;
          const videoEndMs = videoStartMs + clipDurationMs;
          
          const wordsInClip = transcription.words.filter(
            (w: any) => w.startMs >= videoStartMs && w.endMs <= videoEndMs
          );
          const clipTranscript = wordsInClip.map((w: any) => w.word).join(' ');
          
          return JSON.stringify({
            status: 'success',
            mode: 'single',
            clipId: overlay.id,
            transcript: clipTranscript || transcription.transcript,
            wordCount: wordsInClip.length || transcription.words.length,
            language: transcription.language,
            confidence: Math.round(transcription.confidence * 100) + '%',
            videoStartTime: overlay.videoStartTime || 0,
            durationSeconds: clipDurationMs / 1000,
            message: `Transcription for clip ${overlay.id}: ${wordsInClip.length || transcription.words.length} words`,
          });
        }
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'get_video_transcription',
      description: `Get transcription (speech-to-text) for video content.

MODES:
- **single** (default): Transcription for ONE specific video overlay. Pass \`videoOverlayId\`.
- **timeline**: Combined transcription of ALL video clips in timeline order. Returns segments array showing which text is from which clip.

Use 'timeline' mode to understand the full content flow of edited videos (multiple clips stitched together).
Use 'single' mode to get transcript for a specific clip only.`,
      schema: getVideoTranscriptionSchema,
    }
  );

  // --- ANALYZE VIDEO CONTENT ---
  const analyzeVideoContentSchema = z.object({
    videoOverlayId: z.coerce.number().describe("ID of the video overlay to analyze"),
    silenceThresholdMs: z.coerce.number().optional().default(2000).describe("Minimum silence duration to flag (default: 2000ms)"),
  });

  const analyzeVideoContent = tool(
    async (rawInput: z.infer<typeof analyzeVideoContentSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const overlay = project.overlays.find((o: any) => o.id === input.videoOverlayId);
        
        if (!overlay || overlay.type !== 'video' || !overlay.assetId) {
          return JSON.stringify({ status: 'error', message: 'Valid video overlay with asset not found' });
        }
        
        const fps = project.fps || 30;
        const videoFrom = overlay.from;
        const videoDuration = overlay.durationInFrames;
        const videoEndFrame = videoFrom + videoDuration;
        
        // Use media services
        const { analyzeContent, analysisToTimelineFrames } = await import('../services/media');
        const analysis = await analyzeContent(overlay.assetId, userId, {
          silenceThresholdMs: input.silenceThresholdMs,
        });
        
        // Safety check: ensure analysis returned valid data
        if (!analysis) {
          return JSON.stringify({ status: 'error', message: 'Analysis failed - no data returned' });
        }
        
        // Ensure required properties exist
        const silences = analysis.silences || [];
        const fillers = analysis.fillers || [];
        const summary = analysis.summary || { totalSilenceMs: 0, totalFillerWords: 0, potentialSavingsMs: 0 };
        
        // Convert to timeline frames
        const withFrames = analysisToTimelineFrames(
          analysis,
          overlay.from,
          overlay.videoStartTime || 0,
          fps
        );
        
        // Build simple segments array with just the facts
        const problematicFrames = withFrames.problematicFrames || [];
        const segments = problematicFrames.slice(0, 10).map((s, idx) => {
          const isAtEnd = s.endFrame >= videoEndFrame - 10;
          const isAtStart = s.startFrame <= videoFrom + 10;
          const durationSec = Math.round((s.endFrame - s.startFrame) / fps * 10) / 10;
          
          return {
            index: idx + 1,
            type: s.description.includes('silence') ? 'silence' : 'filler',
            description: s.description,
            startFrame: s.startFrame,
            endFrame: s.endFrame,
            durationSeconds: durationSec,
            position: isAtEnd ? 'end' : isAtStart ? 'start' : 'middle',
          };
        });
        
        // Return simple stats for LLM
        return JSON.stringify({
          status: 'success',
          videoId: overlay.id,
          videoFrom,
          videoDuration,
          videoEndFrame,
          fps,
          // Summary stats
          silenceCount: silences.length,
          fillerCount: fillers.length,
          totalSilenceMs: summary.totalSilenceMs || 0,
          totalFillerWords: summary.totalFillerWords || 0,
          potentialSavingsSeconds: Math.round((summary.potentialSavingsMs || 0) / 100) / 10,
          // Segments found (just facts, no instructions)
          segmentsFound: segments.length,
          segments,
          message: segments.length > 0 
            ? `Found ${segments.length} problematic segments (${Math.round((summary.potentialSavingsMs || 0) / 100) / 10}s potential savings)`
            : 'No silences or filler words found',
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'analyze_video_content',
      description: `Analyze a video for silences and filler words. Returns stats and segment info.

RETURNS:
- silenceCount, fillerCount, potentialSavingsSeconds
- segments: List of problematic areas with type, startFrame, endFrame, position (start/middle/end)

Use this to understand what exists. Then decide what to do based on user intent.`,
      schema: analyzeVideoContentSchema,
    }
  );

  // --- ADD CAPTIONS ---
  const addCaptionsSchema = z.object({
    videoOverlayId: z.coerce.number().describe("ID of the video overlay to add captions for"),
    style: z.enum(['tiktok', 'minimal', 'bold', 'karaoke', 'subtitle']).optional().default('tiktok').describe("Caption style preset (default: tiktok)"),
    position: z.enum(['bottom', 'top', 'center']).optional().default('bottom').describe("Caption position (default: bottom)"),
    overwrite: z.coerce.boolean().optional().default(false).describe("Set to true to overwrite existing captions"),
    // Custom style overrides (optional - override preset defaults)
    fontSize: z.string().optional().describe("Font size, e.g. '48px', '3rem'. Overrides preset."),
    fontFamily: z.string().optional().describe("Font family, e.g. 'Inter', 'Arial'. Overrides preset."),
    fontWeight: z.coerce.number().optional().describe("Font weight, e.g. 400, 700, 900. Overrides preset."),
    color: z.string().optional().describe("Text color, e.g. '#ffffff', 'yellow'. Overrides preset."),
    backgroundColor: z.string().optional().describe("Background color, e.g. 'rgba(0,0,0,0.5)'. Overrides preset."),
    textShadow: z.string().optional().describe("Text shadow, e.g. '2px 2px 4px rgba(0,0,0,0.5)'. Overrides preset."),
    // Highlight customization
    highlightColor: z.string().optional().describe("Active word highlight color, e.g. '#ffcc00'. Overrides preset."),
    highlightEffect: z.enum(['none', 'glow', 'box', 'underline', 'pop']).optional().describe("Highlight effect for active word"),
    highlightAnimation: z.enum(['none', 'bounce', 'pulse', 'scale']).optional().describe("Animation for active word"),
    // Display mode customization  
    displayMode: z.enum(['word-by-word', 'phrase', 'karaoke', 'subtitle']).optional().describe("How words appear: word-by-word, phrase (3-4 words), karaoke (progressive), subtitle (sentence)"),
    wordsPerGroup: z.coerce.number().optional().describe("Words shown at once (1-12). Overrides displayMode default."),
  });

  const addCaptions = tool(
    async (rawInput: z.infer<typeof addCaptionsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const overlay = project.overlays.find((o: any) => o.id === input.videoOverlayId);
        
        if (!overlay || overlay.type !== 'video' || !overlay.assetId) {
          return JSON.stringify({ status: 'error', message: 'Valid video overlay with asset not found' });
        }
        
        const canvas = getCanvasDimensions(project);
        const fps = project.fps || 30;
        
        // Check for existing captions
        const existingCaptions = project.overlays.filter(
          (o: any) => o.type === 'caption' && o.sourceVideoId === input.videoOverlayId
        );
        
        // If captions exist and overwrite is not true, error
        if (existingCaptions.length > 0 && !input.overwrite) {
          return JSON.stringify({ 
            status: 'error', 
            message: `Caption already exists for video ${input.videoOverlayId}. Use overwrite: true to replace it.`,
            existingCaptionIds: existingCaptions.map((c: any) => c.id),
          });
        }
        
        // Delete existing captions if overwriting
        for (const caption of existingCaptions) {
          await projectService.deleteOverlay(userId, projectId, caption.id);
        }
        
        // Use caption service
        const { createCaptions } = await import('../services/media');
        
        // Build style overrides from custom params
        const styleOverrides: Record<string, any> = {};
        if (input.fontSize) styleOverrides.fontSize = input.fontSize;
        if (input.fontFamily) styleOverrides.fontFamily = input.fontFamily;
        if (input.fontWeight) styleOverrides.fontWeight = input.fontWeight;
        if (input.color) styleOverrides.color = input.color;
        if (input.backgroundColor) styleOverrides.backgroundColor = input.backgroundColor;
        if (input.textShadow) styleOverrides.textShadow = input.textShadow;
        
        // Build highlight overrides
        if (input.highlightColor || input.highlightEffect || input.highlightAnimation) {
          styleOverrides.highlight = {};
          if (input.highlightColor) styleOverrides.highlight.color = input.highlightColor;
          if (input.highlightEffect) styleOverrides.highlight.effect = input.highlightEffect;
          if (input.highlightAnimation) styleOverrides.highlight.animation = input.highlightAnimation;
        }
        
        // Build display config overrides
        const displayOverrides: Record<string, any> = {};
        if (input.displayMode) displayOverrides.mode = input.displayMode;
        if (input.wordsPerGroup) displayOverrides.wordsPerGroup = input.wordsPerGroup;
        
        let captionOverlay = await createCaptions({
          videoOverlay: overlay,
          userId,
          assetId: overlay.assetId,
          playerDimensions: canvas,
          fps,
          style: input.style,
          position: input.position,
          styleOverrides: Object.keys(styleOverrides).length > 0 ? styleOverrides : undefined,
          displayOverrides: Object.keys(displayOverrides).length > 0 ? displayOverrides : undefined,
        });
        
        // Caption should always be at row 0 (topmost layer)
        // Check if any overlay at row 0 would collide time-wise with the caption
        const captionFrom = captionOverlay.from;
        const captionEnd = captionFrom + captionOverlay.durationInFrames;
        
        const hasCollisionAtRow0 = project.overlays.some((o: any) => {
          if (o.row !== 0) return false;
          const oEnd = o.from + o.durationInFrames;
          // Check for time overlap
          return !(captionEnd <= o.from || captionFrom >= oEnd);
        });
        
        if (hasCollisionAtRow0) {
          // Shift ALL overlays down by 1 row to make room for caption at row 0
          const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
          const database = await getDatabase();
          await database.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId, userId },
            { $inc: { 'overlays.$[].row': 1 } }
          );
        }
        
        // Set caption to row 0
        captionOverlay = { ...captionOverlay, row: 0 };
        
        // Add caption to project
        await projectService.addOverlay(userId, projectId, captionOverlay as any);
        
        return JSON.stringify({
          status: 'success',
          captionId: captionOverlay.id,
          style: input.style,
          position: input.position,
          captionCount: captionOverlay.captions.length,
          rowsShifted: hasCollisionAtRow0,
          message: `Added ${input.style} captions (${captionOverlay.captions.length} segments) at row 0${hasCollisionAtRow0 ? ' (shifted other overlays down)' : ''}`,
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_captions',
      description: `Add AI-generated captions to a video. Start with a preset, then customize.

PRESETS: tiktok (default), minimal, bold, karaoke, subtitle

CUSTOM STYLE OPTIONS (override preset):
- fontSize, fontFamily, fontWeight, color, backgroundColor, textShadow
- highlightColor, highlightEffect (glow/box/underline/pop), highlightAnimation (bounce/pulse/scale)
- displayMode (word-by-word/phrase/karaoke/subtitle), wordsPerGroup (1-12)

Example: add_captions({ videoOverlayId: 0, style: 'tiktok', highlightColor: '#ffcc00', highlightEffect: 'pop' })

IMPORTANT: If caption exists, pass overwrite: true or it will error.`,
      schema: addCaptionsSchema,
    }
  );

  // --- REFRESH CAPTIONS ---
  const refreshCaptionsSchema = z.object({
    captionOverlayId: z.coerce.number().describe("ID of the caption overlay to refresh"),
    newStyle: z.enum(['tiktok', 'minimal', 'bold', 'karaoke', 'subtitle']).optional().describe("Optional new style to apply"),
  });

  const refreshCaptionsAI = tool(
    async (rawInput: z.infer<typeof refreshCaptionsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        
        // Find the caption overlay
        const captionOverlay = project.overlays.find(
          (o: any) => o.id === input.captionOverlayId && o.type === 'caption'
        );
        
        if (!captionOverlay) {
          return JSON.stringify({ status: 'error', message: 'Caption overlay not found' });
        }
        
        // Find the linked video
        if (!captionOverlay.sourceVideoId) {
          return JSON.stringify({ status: 'error', message: 'Caption is not linked to a video (no sourceVideoId)' });
        }
        
        const videoOverlay = project.overlays.find(
          (o: any) => o.id === captionOverlay.sourceVideoId && o.type === 'video'
        );
        
        if (!videoOverlay) {
          return JSON.stringify({ status: 'error', message: 'Linked video overlay not found (may have been deleted)' });
        }
        
        const canvas = getCanvasDimensions(project);
        const fps = project.fps || 30;
        
        // Use refresh function
        const { refreshCaptions } = await import('../services/media');
        const updatedCaption = await refreshCaptions({
          captionOverlay,
          videoOverlay,
          userId,
          playerDimensions: canvas,
          fps,
          preserveStyle: !input.newStyle,
          newStyle: input.newStyle,
        });
        
        // Update in database (replace the caption)
        await projectService.deleteOverlay(userId, projectId, captionOverlay.id);
        await projectService.addOverlay(userId, projectId, updatedCaption as any);
        
        return JSON.stringify({
          status: 'success',
          captionId: updatedCaption.id,
          captionCount: updatedCaption.captions.length,
          style: input.newStyle || 'preserved',
          message: `Refreshed captions (${updatedCaption.captions.length} segments) synced to current video timing`,
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'refresh_captions',
      description: `Refresh/realign captions to match current video timing. Use this when:
- Video has been trimmed, split, or moved after captions were added
- User asks to "resync", "realign", or "refresh" captions
- Captions appear misaligned with video

Optionally apply a new style while refreshing.`,
      schema: refreshCaptionsSchema,
    }
  );

  // --- CLOSE GAPS ---
  const closeGapsSchema = z.object({
    preserveCaptions: z.coerce.boolean().optional().default(true).describe("Keep captions aligned with their videos (default: true)"),
  });

  const closeGaps = tool(
    async (rawInput: z.infer<typeof closeGapsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        
        // Get all video clips sorted by timeline position
        const videoClips = project.overlays
          .filter((o: any) => o.type === 'video')
          .sort((a: any, b: any) => a.from - b.from);
        
        if (videoClips.length < 2) {
          return JSON.stringify({ status: 'success', message: 'No gaps to close (need at least 2 video clips)' });
        }
        
        let totalFramesClosed = 0;
        const moves: Array<{ id: number; oldFrom: number; newFrom: number }> = [];
        
        // Calculate new positions - each clip should start where previous ends
        let nextStart = videoClips[0].from; // First clip stays in place
        
        for (const clip of videoClips) {
          const clipEnd = clip.from + clip.durationInFrames;
          
          if (clip.from > nextStart) {
            // There's a gap - move this clip left
            const shift = clip.from - nextStart;
            totalFramesClosed += shift;
            
            moves.push({ id: clip.id, oldFrom: clip.from, newFrom: nextStart });
            
            // Update clip position
            await projectService.updateOverlay(userId, projectId, clip.id, { from: nextStart });
            
            // If preserving captions, also move linked captions
            if (input.preserveCaptions) {
              const linkedCaptions = project.overlays.filter(
                (o: any) => o.type === 'caption' && o.sourceVideoId === clip.id
              );
              for (const caption of linkedCaptions) {
                await projectService.updateOverlay(userId, projectId, caption.id, { 
                  from: caption.from - shift 
                });
              }
            }
            
            nextStart = nextStart + clip.durationInFrames;
          } else {
            nextStart = clipEnd;
          }
        }
        
        const fps = project.fps || 30;
        return JSON.stringify({
          status: 'success',
          clipsMoved: moves.length,
          totalFramesClosed,
          totalSecondsClosed: Math.round((totalFramesClosed / fps) * 10) / 10,
          message: moves.length > 0 
            ? `Closed ${moves.length} gap(s), saved ${Math.round((totalFramesClosed / fps) * 10) / 10}s`
            : 'No gaps found to close',
        });
        
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'close_gaps',
      description: `Close all gaps between video clips on the timeline by shifting clips left.
Use after removing sections or when there are empty spaces between clips.
Linked captions are automatically moved with their videos.`,
      schema: closeGapsSchema,
    }
  );

  // ============================================================================
  // FANCY CAPTIONS (Kinetic Typography)
  // ============================================================================

  const addFancyCaptionsSchema = z.object({
    videoOverlayId: z.coerce.number().describe("ID of the video overlay to add fancy captions for"),
    
    // Segment targeting
    segmentType: z.enum(['hook', 'custom']).optional().default('hook')
      .describe("'hook' = first 3-5 seconds (default), 'custom' = use startFrame/endFrame"),
    startFrame: z.coerce.number().optional()
      .describe("Custom start frame (only if segmentType='custom')"),
    endFrame: z.coerce.number().optional()
      .describe("Custom end frame (only if segmentType='custom')"),
    
    // Style configuration
    style: z.enum(['bento', 'scattered', 'minimal']).optional().default('bento')
      .describe("Layout style: 'bento' (tight grid, default), 'scattered' (floating), 'minimal' (centered stack)"),
    primaryColor: z.string().optional().describe("Primary text color, e.g., '#ffffff'"),
    accentColor: z.string().optional().describe("Accent color for hero words, e.g., '#FFE66D'"),
    backgroundColor: z.string().optional().default('transparent')
      .describe("Background color (default: transparent)"),
    
    // Limits
    maxWords: z.coerce.number().optional().default(15)
      .describe("Maximum words to include (default: 15, max: 25)"),
  });

  const addFancyCaptions = tool(
    async (rawInput: z.infer<typeof addFancyCaptionsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const overlay = project.overlays.find((o: any) => o.id === input.videoOverlayId);
        
        if (!overlay || overlay.type !== 'video' || !overlay.assetId) {
          return JSON.stringify({ status: 'error', message: 'Valid video overlay with asset not found' });
        }
        
        const canvas = getCanvasDimensions(project);
        const fps = project.fps || 30;
        
        // Get transcription
        const { getTranscription } = await import('../services/media');
        const transcription = await getTranscription(overlay.assetId, userId);
        
        if (!transcription.words || transcription.words.length === 0) {
          return JSON.stringify({ status: 'error', message: 'No speech detected in this video' });
        }
        
        // Determine segment range
        let segmentStartFrame: number;
        let segmentEndFrame: number;
        
        if (input.segmentType === 'custom' && input.startFrame !== undefined && input.endFrame !== undefined) {
          segmentStartFrame = input.startFrame;
          segmentEndFrame = input.endFrame;
        } else {
          // Hook = first 3-5 seconds of the clip
          segmentStartFrame = overlay.from;
          const hookDurationFrames = 4 * fps; // 4 seconds default
          segmentEndFrame = Math.min(overlay.from + hookDurationFrames, overlay.from + overlay.durationInFrames);
        }
        
        // Calculate video-time range for this segment
        const videoStartMs = (overlay.videoStartTime || 0) * 1000;
        const segmentStartMs = videoStartMs + ((segmentStartFrame - overlay.from) / fps * 1000);
        const segmentEndMs = videoStartMs + ((segmentEndFrame - overlay.from) / fps * 1000);
        
        // Filter words in this segment and re-base to 0
        // Include words that START within the segment (not require end within)
        const maxWords = Math.min(input.maxWords || 15, 25);
        const wordsInRange = transcription.words
          .filter((w: any) => w.startMs >= segmentStartMs && w.startMs < segmentEndMs)
          .slice(0, maxWords)
          .map((w: any) => ({
            word: w.word,
            startMs: Math.round(w.startMs - segmentStartMs), // 0-based relative to segment
            endMs: Math.round(Math.min(w.endMs - segmentStartMs, segmentEndMs - segmentStartMs)), // Clamp to segment end
          }));
        
        if (wordsInRange.length === 0) {
          return JSON.stringify({ 
            status: 'error', 
            message: 'No speech found in the selected segment',
            debug: {
              segmentStartMs,
              segmentEndMs,
              totalWords: transcription.words.length,
              firstWordStart: transcription.words[0]?.startMs,
            }
          });
        }
        
        // Log word timings for debugging
        console.log('[FANCY-CAPTIONS] Word timings (0-based):', 
          wordsInRange.map((w: any) => `"${w.word}" ${w.startMs}-${w.endMs}ms`)
        );
        
        // Classify word importance
        const classifiedWords = classifyWordTimings(wordsInRange);
        
        // Calculate total duration for exit animation
        const totalDurationMs = Math.round(segmentEndMs - segmentStartMs);
        
        // Build prompt
        const prompt = buildFancyCaptionPrompt({
          words: classifiedWords,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          style: input.style || 'bento',
          primaryColor: input.primaryColor,
          accentColor: input.accentColor,
          backgroundColor: input.backgroundColor || 'transparent',
        });
        
        console.log('[FANCY-CAPTIONS] Generating for', classifiedWords.length, 'words, duration:', totalDurationMs, 'ms');
        
        // Generate HTML via Gemini
        const model = new ChatGoogleGenerativeAI({
          model: 'gemini-2.5-flash',
          apiKey: process.env.GEMINI_API_KEY,
          temperature: 0.8, // Higher creativity for typography
        });
        
        const result = await model.invoke([
          new SystemMessage(prompt),
          new HumanMessage(`Generate the kinetic typography animation for these ${classifiedWords.length} words. Total duration: ${totalDurationMs}ms.`),
        ]);
        
        const generatedHtml = result.content as string;
        
        // Clean up the HTML - remove markdown fences, DOCTYPE, html/body tags
        let cleanHtml = generatedHtml
          .replace(/```html/g, '')
          .replace(/```/g, '')
          .replace(/<!DOCTYPE[^>]*>/gi, '')
          .replace(/<\/?html[^>]*>/gi, '')
          .replace(/<\/?body[^>]*>/gi, '')
          .replace(/<\/?head[^>]*>/gi, '')
          .replace(/<meta[^>]*>/gi, '')
          .replace(/<title[^>]*>.*?<\/title>/gi, '')
          .trim();
        
        // Sanitize for security
        cleanHtml = sanitizeHtml(cleanHtml);
        
        // Wrap in sandbox with auto-fit enabled
        const wrappedHtml = createSandboxedWrapper({
          html: cleanHtml,
          width: canvas.width,
          height: canvas.height,
          backgroundColor: input.backgroundColor || 'transparent',
          autoFit: true,
        });

        
        // Extract metadata for consistency
        const styleMetadata = extractStyleMetadata(cleanHtml);
        const metadata: HtmlGenerationMetadata = {
          ...styleMetadata,
          generatedAt: new Date(),
          sourceType: 'fancy-caption',
          wordCount: classifiedWords.length,
        };
        
        // Create overlay
        const id = Date.now() + Math.floor(Math.random() * 10000);
        const segmentDuration = segmentEndFrame - segmentStartFrame;
        
        // Fancy captions go on top (row 0)
        const existingOverlays = toExistingOverlays(project.overlays || []);
        const hasCollisionAtRow0 = existingOverlays.some(o => 
          o.row === 0 && 
          !(segmentEndFrame <= o.from || segmentStartFrame >= o.from + o.durationInFrames)
        );
        
        if (hasCollisionAtRow0) {
          // Shift all overlays down by 1 row
          const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
          const database = await getDatabase();
          await database.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId, userId },
            { $inc: { 'overlays.$[].row': 1 } }
          );
        }
        
        const newOverlay = {
          id,
          type: 'html-scene', // Using html-scene type for rendering compatibility
          from: segmentStartFrame,
          durationInFrames: segmentDuration,
          content: wrappedHtml,
          prompt: `Fancy captions: ${classifiedWords.map(w => w.word).join(' ')}`,
          metadata,
          row: 0,
          left: 0,
          top: 0,
          width: canvas.width,
          height: canvas.height,
          rotation: 0,
          isDragging: false,
          styles: {
            animation: { enter: 'fadeIn', exit: 'fadeOut', duration: 10 },
          },
        };
        
        await projectService.addOverlay(userId, projectId, newOverlay as any);
        
        console.log('[FANCY-CAPTIONS] Created overlay:', {
          id,
          wordCount: classifiedWords.length,
          style: input.style,
          fonts: metadata.fonts,
          colors: metadata.colors,
        });
        
        return JSON.stringify({
          status: 'success',
          id,
          wordCount: classifiedWords.length,
          words: classifiedWords.map(w => w.word),
          style: input.style || 'bento',
          segmentType: input.segmentType || 'hook',
          startFrame: segmentStartFrame,
          endFrame: segmentEndFrame,
          metadata: {
            fonts: metadata.fonts,
            colors: metadata.colors,
            backgroundColor: metadata.backgroundColor,
          },
          rowsShifted: hasCollisionAtRow0,
          message: `Added fancy ${input.style || 'bento'}-style captions with ${classifiedWords.length} words. Fonts: ${metadata.fonts.join(', ') || 'system'}. Colors: ${metadata.colors.slice(0, 3).join(', ')}.`,
        });
        
      } catch (e: any) {
        console.error('[FANCY-CAPTIONS] Error:', e);
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_fancy_captions',
      description: `Add AI-generated "fancy captions" (kinetic typography) to a video segment.

PURPOSE: Creates TikTok/Instagram-style text animations where words appear at different positions, sizes, and with unique styling. Perfect for HOOKS or key moments.

USAGE GUIDANCE:
- Use ONLY for hooks (first 3-5 seconds) or key highlighted sections, NOT entire videos
- For full video captions, use add_captions instead
- Call multiple times for multiple segments if needed

STYLES:
- 'bento' (default): Tight grid layout, mixed fonts, editorial look
- 'scattered': Floating words at different positions with rotations
- 'minimal': Clean centered stack, simple animations

LIMITS: Max 15-25 words per call. For longer content, call multiple times.

RETURNS: Overlay ID and extracted metadata (fonts, colors) for style consistency.`,
      schema: addFancyCaptionsSchema,
    }
  );

  return [
    readProjectFile,
    getTimelineView,
    addOverlay,           // NEW: Unified add with Physics Engine
    updateOverlay,        // Enhanced with % support
    batchUpdateOverlays,  // NEW: Batch updates
    splitOverlay,         // NEW: Split at frame
    trimOverlay,          // NEW: Trim tool
    deleteOverlay,
    syncStyle,            // NEW: Style sync
    closeGaps,            // NEW: Close timeline gaps
    // visualInspectFrame,  // DISABLED: Decoy tool, not implemented
    generateHtmlScene,
    generateHtmlSticker,  // NEW: Animated stickers
    // --- Video Auto-Edit Tools ---
    getVideoTranscription,
    analyzeVideoContent,
    addCaptions,
    addFancyCaptions,     // NEW: Kinetic typography captions
    refreshCaptionsAI,    // NEW: Refresh/realign captions
  ];

};
