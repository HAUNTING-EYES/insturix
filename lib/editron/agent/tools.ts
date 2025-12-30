import { tool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { projectService } from '../services/project-service';
import { generateTimelineView } from '../utils/timeline-utils';
import { Overlay, OverlayType as EditorOverlayType } from '@/components/editron/editor/version-7.0.0/types';
import { 
  findBestRow, 
  resolveCoordinates, 
  getDefaultSize, 
  hasCollisionOnRow,
  OverlayType,
  ExistingOverlay 
} from '../core/physics';

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

  // --- READ TOOLS ---

  const readProjectFileSchema = z.object({
    mode: z.enum(['full', 'slice', 'byTrackIds']).optional().default('full'),
    start: z.number().optional(),
    end: z.number().optional(),
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
    granularity: z.enum(['coarse', 'detailed']),
    timeWindow: z.object({
      fromFrame: z.number(),
      toFrame: z.number()
    }).optional(),
    trackTypes: z.array(z.enum(['text', 'image', 'audio', 'video'])).optional(),
  });

  const getTimelineView = tool(
    async (input: z.infer<typeof getTimelineViewSchema>) => {
      try {
        const { granularity, timeWindow, trackTypes } = input;
        const project = await loadProject();
        const view = generateTimelineView(project, { granularity, timeWindow, trackTypes: trackTypes as any });
        return JSON.stringify(view);
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    },
    {
      name: 'get_timeline_view',
      description: 'Get a visual ASCII timeline of the project to understand timing and overlaps.',
      schema: getTimelineViewSchema,
    }
  );

  // --- UNIFIED ADD OVERLAY TOOL ---
  // This replaces the 4 separate add_*_overlay tools with one powerful tool

  const addOverlaySchema = z.object({
    type: z.enum(['text', 'image', 'video', 'sound', 'shape', 'sticker']).describe("Type of overlay to add"),
    
    // Timing (required)
    start: z.number().describe("Start frame (0-based)"),
    duration: z.number().describe("Duration in frames"),
    
    // Content (type-specific)
    text: z.string().optional().describe("Text content (required for type='text')"),
    assetId: z.string().optional().describe("Asset ID (required for image/video/sound)"),
    
    // Position - accepts numbers (pixels) or strings (percentages like '50%' or 'center')
    x: z.union([z.number(), z.string()]).optional().describe("X position: number for pixels, string for '50%' or 'center'. Default: center"),
    y: z.union([z.number(), z.string()]).optional().describe("Y position: number for pixels, string for '50%' or 'center'. Default: center"),
    width: z.union([z.number(), z.string()]).optional().describe("Width: number for pixels, string for '50%'. Default: type-specific"),
    height: z.union([z.number(), z.string()]).optional().describe("Height: number for pixels, string for '50%'. Default: type-specific"),
    rotation: z.number().optional().default(0),
    
    // Row override (Smart Placement by default)
    row: z.number().optional().describe("Force specific row. If omitted, Physics Engine auto-places: Videos at bottom, Text on top."),
    
    // Styles (all optional, type-specific fields ignored if not applicable)
    styles: z.object({
      // Text styles
      fontSize: z.number().optional().describe("Font size in pixels (for text)"),
      fontFamily: z.string().optional().describe("Font family (for text)"),
      fontWeight: z.number().optional().describe("Font weight (for text)"),
      color: z.string().optional().describe("Text color hex (for text)"),
      textAlign: z.enum(['left', 'center', 'right']).optional().describe("Text alignment (for text)"),
      backgroundColor: z.string().optional().describe("Background color (for text)"),
      
      // Media styles
      objectFit: z.enum(['cover', 'contain', 'fill']).optional().describe("Object fit (for image/video)"),
      volume: z.number().optional().describe("Volume 0-1 (for video/sound)"),
      
      // Shape styles
      fill: z.string().optional().describe("Fill color (for shape)"),
      stroke: z.string().optional().describe("Stroke color (for shape)"),
      strokeWidth: z.number().optional().describe("Stroke width (for shape)"),
      
      // Common styles
      opacity: z.number().optional().describe("Opacity 0-1"),
      borderRadius: z.string().optional().describe("Border radius (e.g. '8px')"),
    }).optional(),
    
    // Video-specific
    videoStartTime: z.number().optional().describe("Start time within source video in seconds (for video)"),
    startFromSound: z.number().optional().describe("Start time within source audio in seconds (for sound)"),
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
          case 'text':
            newOverlay = {
              ...baseOverlay,
              content: input.text,
              styles: {
                fontSize: input.styles?.fontSize ?? 60,
                fontFamily: input.styles?.fontFamily ?? "Inter",
                fontWeight: input.styles?.fontWeight ?? 700,
                textAlign: input.styles?.textAlign ?? "center",
                color: input.styles?.color ?? "#ffffff",
                backgroundColor: input.styles?.backgroundColor ?? "transparent",
                opacity: input.styles?.opacity ?? 1,
                animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
              }
            };
            break;
            
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
    id: z.number().describe("The ID of the overlay to update"),
    start: z.number().optional().describe("New start frame"),
    duration: z.number().optional().describe("New duration in frames"),
    text: z.string().optional().describe("New text content (for text overlays)"),
    x: z.union([z.number(), z.string()]).optional().describe("New X position (pixels or %)"),
    y: z.union([z.number(), z.string()]).optional().describe("New Y position (pixels or %)"),
    width: z.union([z.number(), z.string()]).optional().describe("New width"),
    height: z.union([z.number(), z.string()]).optional().describe("New height"),
    rotation: z.number().optional(),
    row: z.number().optional().describe("Move to specific row"),
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
      id: z.number().describe("Overlay ID to update"),
      start: z.number().optional(),
      duration: z.number().optional(),
      text: z.string().optional(),
      x: z.union([z.number(), z.string()]).optional(),
      y: z.union([z.number(), z.string()]).optional(),
      width: z.union([z.number(), z.string()]).optional(),
      height: z.union([z.number(), z.string()]).optional(),
      rotation: z.number().optional(),
      row: z.number().optional(),
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
    id: z.number().describe("ID of the overlay to split"),
    atFrame: z.number().describe("Frame at which to split the overlay"),
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
        const secondOverlay = {
          ...overlay,
          id: newId,
          from: input.atFrame,
          durationInFrames: secondDuration,
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
    id: z.number().describe("ID of the overlay to trim"),
    trimStart: z.number().optional().describe("Frames to remove from the start (positive = shorter)"),
    trimEnd: z.number().optional().describe("Frames to remove from the end (positive = shorter)"),
  });

  const trimOverlay = tool(
    async (input: z.infer<typeof trimOverlaySchema>) => {
      try {
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
        }
        
        if (input.trimEnd !== undefined && input.trimEnd > 0) {
          newDuration -= input.trimEnd;
        }
        
        if (newDuration <= 0) {
          return JSON.stringify({ status: 'error', message: 'Trim would result in zero or negative duration' });
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
    id: z.number().describe("The ID of the overlay to delete"),
  });

  const deleteOverlay = tool(
    async (input: z.infer<typeof deleteOverlaySchema>) => {
      try {
        await projectService.deleteOverlay(userId, projectId, input.id);
        return JSON.stringify({ status: 'success', message: `Overlay ${input.id} deleted` });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'delete_overlay',
      description: 'Delete an overlay by its ID.',
      schema: deleteOverlaySchema
    }
  );

  // --- SYNC STYLE ---
  
  const syncStyleSchema = z.object({
    sourceId: z.number().describe("ID of the overlay to copy styles FROM"),
    targetIds: z.array(z.number()).describe("IDs of overlays to apply styles TO"),
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
    frame: z.number(),
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
    start: z.number().describe("Start frame (0-based)"),
    duration: z.number().describe("Duration in frames"),
    row: z.number().optional().describe("Row index"),
    description: z.string().describe("Detailed description of the scene to generate (e.g., 'Retro vaporwave grid background with animated sun')"),
    x: z.number().optional().describe("Center X position"),
    y: z.number().optional().describe("Center Y position"),
    width: z.number().optional().describe("Width in pixels"),
    height: z.number().optional().describe("Height in pixels"),
    rotation: z.number().optional().default(0),
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
        
        const systemPrompt = `You are a world-class motion graphics designer and creative coder.
Generate a self-contained HTML/CSS/JS fragment for video production.

═══════════════════════════════════════════════════════════════════
CANVAS: ${safeWidth}×${safeHeight}px | Aspect Ratio: ${project.aspectRatio || '16:9'} | Duration: ~${durationSeconds}s
═══════════════════════════════════════════════════════════════════

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

▸ CAPABILITIES:
  • Inline SVG graphics (icons, shapes, illustrations)
  • Canvas API for generative art / particles / data viz
  • CSS gradients, masks, clip-paths, filters, backdrop-blur
  • Keyframe animations, transitions, transforms
  • Text effects (gradients, shadows, animations)
  • Pseudo-elements (::before, ::after)
  • Google Fonts for typography

▸ QUALITY:
  • Premium, polished, "wow factor" design
  • Smooth 60fps animations
  • Professional color palettes
  • Modern typography

▸ OUTPUT FORMAT:
  Return ONLY the raw HTML string starting with \`<\`. 
  NO markdown fences. NO explanations. NO comments outside code.`;

        const result = await model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(`Create: ${input.description}`)
        ]);

        const generatedHtml = result.content as string;
        const cleanHtml = generatedHtml.replace(/```html/g, '').replace(/```/g, '').trim();

        // Create overlay that fills the entire canvas by default
        const overlayWidth = input.width ?? safeWidth;
        const overlayHeight = input.height ?? safeHeight;
        
        const newOverlay = {
          id,
          type: 'html-scene',
          from: input.start,
          durationInFrames: input.duration,
          content: cleanHtml,
          prompt: input.description,
          row: input.row ?? 2,
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
          message: `Generated HTML scene for "${input.description}". Resolution: ${safeWidth}x${safeHeight}. Code length: ${cleanHtml.length} chars. (Code hidden from chat log)` 
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

>>>>>>> Stashed changes
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
    visualInspectFrame,
    generateHtmlScene
  ];
};
