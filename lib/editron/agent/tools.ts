import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { projectService } from '../services/project-service';
import { generateTimelineView } from '../utils/timeline-utils';
import { Overlay } from '@/components/editron/editor/version-7.0.0/types';

// Factory to create tools with context
export const createTools = (userId: string, projectId: string) => {
  
  // Helper to load project
  const loadProject = async () => {
    const project = await projectService.loadProject(userId, projectId);
    if (!project) throw new Error("Project not found or unauthorized.");
    return project;
  };

  // Helper to save project
  const saveProject = async (project: any) => {
    await projectService.saveProject(userId, projectId, project);
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
        const canonical = JSON.stringify(project, Object.keys(project).sort(), 2);

        // Calculate canonical dimensions
        let width = project.playerDimensions?.width || 1920;
        let height = project.playerDimensions?.height || 1080;
        
        if (!project.playerDimensions) {
          if (project.aspectRatio === "9:16") { width = 1080; height = 1920; }
          else if (project.aspectRatio === "4:5") { width = 1080; height = 1350; }
          else if (project.aspectRatio === "1:1") { width = 1080; height = 1080; }
          else if (project.aspectRatio === "16:9") { width = 1920; height = 1080; }
        }

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
          width,
          height,
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

  // --- WRITE TOOLS ---

  const generateId = (overlays: any[]) => {
    if (!overlays.length) return 1;
    return Math.max(...overlays.map((o: any) => o.id)) + 1;
  };

  // Common schema parts
  const baseOverlaySchema = {
    start: z.number().describe("Start frame (0-based)"),
    duration: z.number().describe("Duration in frames"),
    row: z.number().optional().describe("Row index (0 is bottom/topmost depending on implementation, usually 0 is bottom). If omitted, auto-placed."),
  };

  const positionSchema = {
    x: z.number().optional().describe("Center X position in pixels"),
    y: z.number().optional().describe("Center Y position in pixels"),
    width: z.number().optional().describe("Width in pixels"),
    height: z.number().optional().describe("Height in pixels"),
    rotation: z.number().optional().default(0),
  };

  // 1. Add Text
  const addTextOverlaySchema = z.object({
    ...baseOverlaySchema,
    text: z.string().describe("The text content to display"),
    ...positionSchema,
    styles: z.object({
      fontSize: z.number().optional().describe("Font size in pixels (e.g. 60)"),
      fontFamily: z.string().optional().default("Inter"),
      fontWeight: z.number().optional().default(700),
      color: z.string().optional().describe("Hex color (e.g. #ffffff)"),
      textAlign: z.enum(['left', 'center', 'right']).optional().default('center'),
      backgroundColor: z.string().optional().describe("Background color (e.g. transparent or #000000)"),
    }).optional(),
  });

  const addTextOverlay = tool(
    async (input: z.infer<typeof addTextOverlaySchema>) => {
      try {
        // Use random ID to prevent collisions in parallel execution
        const id = Date.now() + Math.floor(Math.random() * 10000);
        
        const newOverlay = {
          id,
          type: 'text',
          from: input.start,
          durationInFrames: input.duration,
          content: input.text, // Fixed: 'text' -> 'content'
          row: input.row ?? 0,
          left: (input.x ?? 960) - ((input.width ?? 600) / 2),
          top: (input.y ?? 540) - ((input.height ?? 200) / 2),
          width: input.width ?? 600,
          height: input.height ?? 200,
          rotation: input.rotation ?? 0,
          isDragging: false, // Fixed: Added missing prop
          styles: {
            fontSize: input.styles?.fontSize ?? 60,
            fontFamily: input.styles?.fontFamily ?? "Inter",
            fontWeight: input.styles?.fontWeight ?? 700,
            textAlign: input.styles?.textAlign ?? "center",
            color: input.styles?.color ?? "#ffffff",
            backgroundColor: input.styles?.backgroundColor ?? "transparent",
            animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
          }
        };

        await projectService.addOverlay(userId, projectId, newOverlay as any);
        return JSON.stringify({ status: 'success', id, message: `Text overlay added with ID ${id}` });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_text_overlay',
      description: 'Add a text overlay to the video. Specify text, timing, position, and basic styles.',
      schema: addTextOverlaySchema
    }
  );

  // 2. Add Image
  const addImageOverlaySchema = z.object({
    ...baseOverlaySchema,
    assetId: z.string().describe("The asset ID of the uploaded image"),
    ...positionSchema,
  });

  const addImageOverlay = tool(
    async (input: z.infer<typeof addImageOverlaySchema>) => {
      try {
        const id = Date.now() + Math.floor(Math.random() * 10000);

        const newOverlay = {
          id,
          type: 'image',
          from: input.start,
          durationInFrames: input.duration,
          assetId: input.assetId,
          row: input.row ?? 1,
          left: (input.x ?? 960) - ((input.width ?? 400) / 2),
          top: (input.y ?? 540) - ((input.height ?? 400) / 2),
          width: input.width ?? 400,
          height: input.height ?? 400,
          rotation: input.rotation ?? 0,
          isDragging: false, // Fixed: Added missing prop
          styles: {
            objectFit: "cover",
            animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
          }
        };

        await projectService.addOverlay(userId, projectId, newOverlay as any);
        return JSON.stringify({ status: 'success', id, message: `Image overlay added with ID ${id}` });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_image_overlay',
      description: 'Add an image overlay using an asset ID.',
      schema: addImageOverlaySchema
    }
  );

  // 3. Add Video
  const addVideoOverlaySchema = z.object({
    ...baseOverlaySchema,
    assetId: z.string().describe("The asset ID of the uploaded video"),
    videoStartTime: z.number().optional().default(0).describe("Start time within the source video (in seconds)"),
    volume: z.number().optional().default(1).describe("Volume (0-1)"),
    ...positionSchema,
  });

  const addVideoOverlay = tool(
    async (input: z.infer<typeof addVideoOverlaySchema>) => {
      try {
        const id = Date.now() + Math.floor(Math.random() * 10000);

        const newOverlay = {
          id,
          type: 'video',
          from: input.start,
          durationInFrames: input.duration,
          assetId: input.assetId,
          videoStartTime: input.videoStartTime,
          row: input.row ?? 0,
          left: (input.x ?? 960) - ((input.width ?? 1920) / 2),
          top: (input.y ?? 540) - ((input.height ?? 1080) / 2),
          width: input.width ?? 1920,
          height: input.height ?? 1080,
          rotation: input.rotation ?? 0,
          isDragging: false, // Fixed: Added missing prop
          styles: {
            volume: input.volume,
            objectFit: "cover",
             animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 }
          }
        };

        await projectService.addOverlay(userId, projectId, newOverlay as any);
        return JSON.stringify({ status: 'success', id, message: `Video overlay added with ID ${id}` });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_video_overlay',
      description: 'Add a video clip overlay using an asset ID.',
      schema: addVideoOverlaySchema
    }
  );

  // 4. Add Audio
  const addAudioOverlaySchema = z.object({
    start: z.number(),
    duration: z.number(),
    assetId: z.string(),
    startFromSound: z.number().optional().default(0),
    volume: z.number().optional().default(1),
  });

  const addAudioOverlay = tool(
    async (input: z.infer<typeof addAudioOverlaySchema>) => {
      try {
        const id = Date.now() + Math.floor(Math.random() * 10000);

        const newOverlay = {
          id,
          type: 'sound', // Fixed: 'audio' -> 'sound'
          from: input.start,
          durationInFrames: input.duration,
          assetId: input.assetId,
          startFromSound: input.startFromSound,
          row: 0,
          // Audio overlays don't have visual props but BaseOverlay requires them?
          // Let's add dummy values if needed or cast
          left: 0, top: 0, width: 0, height: 0, rotation: 0, isDragging: false,
          styles: {
            volume: input.volume,
          }
        };

        await projectService.addOverlay(userId, projectId, newOverlay as any);
        return JSON.stringify({ status: 'success', id, message: `Audio overlay added with ID ${id}` });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_audio_overlay',
      description: 'Add a background audio or sound effect.',
      schema: addAudioOverlaySchema
    }
  );

  // 5. Update Overlay
  const updateOverlaySchema = z.object({
    id: z.number().describe("The ID of the overlay to update"),
    start: z.number().optional(),
    duration: z.number().optional(),
    text: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    rotation: z.number().optional(),
    styles: z.any().optional().describe("Partial styles object to merge"),
  });

  const updateOverlay = tool(
    async (input: z.infer<typeof updateOverlaySchema>) => {
      try {
        const project = await loadProject();
        const index = project.overlays.findIndex((o: any) => o.id === input.id);
        if (index === -1) return JSON.stringify({ status: 'error', message: "Overlay not found" });

        const overlay = project.overlays[index];
        
        const updates: any = {};
        
        // Update fields if present
        if (input.start !== undefined) updates.from = input.start;
        if (input.duration !== undefined) updates.durationInFrames = input.duration;
        if (input.text !== undefined && overlay.type === 'text') updates.content = input.text;
        
        if (input.x !== undefined) updates.left = input.x - (overlay.width / 2);
        if (input.y !== undefined) updates.top = input.y - (overlay.height / 2);
        if (input.width !== undefined) updates.width = input.width;
        if (input.height !== undefined) updates.height = input.height;
        if (input.rotation !== undefined) updates.rotation = input.rotation;

        if (input.styles) {
          updates.styles = { ...overlay.styles, ...input.styles };
        }

        await projectService.updateOverlay(userId, projectId, input.id, updates);
        return JSON.stringify({ status: 'success', message: `Overlay ${input.id} updated` });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'update_overlay',
      description: 'Update an existing overlay. Provide only the fields you want to change.',
      schema: updateOverlaySchema
    }
  );

  // 6. Delete Overlay
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

  // Visual Inspect (Keep existing)
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

  return [
    readProjectFile,
    getTimelineView,
    addTextOverlay,
    addImageOverlay,
    addVideoOverlay,
    addAudioOverlay,
    updateOverlay,
    deleteOverlay,
    visualInspectFrame
  ];
};
