import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { projectService } from "../services/project-service";
import { generateTimelineView } from "../utils/timeline-utils";
import {
  Overlay,
  OverlayType as EditorOverlayType,
  HtmlGenerationMetadata,
  CaptionOverlay,
  ClipOverlay,
} from "@/components/editron/editor/version-7.0.0/types";
import { ROW } from '@/lib/pipeline/scene-to-editron';
import {
  findBestRow,
  resolveCoordinates,
  getDefaultSize,
  hasCollisionOnRow,
  OverlayType,
  ExistingOverlay,
} from "../core/physics";
import {
  sanitizeHtml,
  createSandboxedWrapper,
  extractStyleMetadata,
  classifyWordTimings,
  buildFancyCaptionPrompt,
  injectFancyCaptionTiming,
  type WordTiming,
} from "../utils/html-generator-utils";

import { assetResolver } from "../services/asset-resolver";
import { sampleVideoClip, sendVideoToGemini } from "../services/media/analysis-service";
import { formatSecondsToHHMMSS, framesToSeconds, parsePromptTimeRange } from "../utils/analysis";
import {
  findBestTemplate,
  fillTemplateSlots,
  fillTemplateWithDefaults,
  searchTemplates,
  computeRelevanceScore,
} from "../services/motion-graphics-service";
import { extractEditDNA, applyEditDNA, loadProfile } from "../services/style-transfer-service";

// PERF FIX: Module-level singleton map for ChatGoogleGenerativeAI instances.
// OLD (in each tool):
// const model = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: X });
// NEW: getLLMModel(temperature) → shared singleton
const _llmModelCache: Record<string, ChatGoogleGenerativeAI> = {};
function getLLMModel(temperature: number): ChatGoogleGenerativeAI {
  const key = `gemini-3.1-flash-t${temperature}`;
  if (!_llmModelCache[key]) {
    _llmModelCache[key] = new ChatGoogleGenerativeAI({
      model: 'gemini-3.1-flash',
      apiKey: process.env.GEMINI_API_KEY,
      temperature,
    });
  }
  return _llmModelCache[key];
}

// Factory to create tools with context
export const createTools = (userId: string, projectId: string) => {
  interface ToolEnvelope {
    status: "success" | "error";
    data: Record<string, any> | null;
    error: {
      message: string;
      code?: string;
      details?: Record<string, any>;
    } | null;
    nextAction: "continue" | "retry" | "ask_clarification" | "stop";
  }

  function successEnvelope(
    data: Record<string, any> | null,
    nextAction: ToolEnvelope["nextAction"] = "continue",
  ): string {
    const envelope: ToolEnvelope = {
      status: "success",
      data: data ?? {},
      error: null,
      nextAction,
    };
    return JSON.stringify(envelope);
  }

  function errorEnvelope(
    message: string,
    code = "TOOL_ERROR",
    details?: Record<string, any>,
    nextAction: ToolEnvelope["nextAction"] = "retry",
  ): string {
    const envelope: ToolEnvelope = {
      status: "error",
      data: null,
      error: {
        message,
        code,
        details,
      },
      nextAction,
    };
    return JSON.stringify(envelope);
  }

  function normalizeToolOutput(rawOutput: unknown): string {
    if (typeof rawOutput === "string") {
      const trimmed = rawOutput.trim();
      if (!trimmed) {
        return successEnvelope({ message: "Tool completed with empty response." }, "continue");
      }

      // Preserve legacy plain-string errors from existing tools.
      // Some handlers still return "Error: ..." instead of JSON.
      if (/^error\s*:/i.test(trimmed)) {
        const message = trimmed.replace(/^error\s*:\s*/i, "").trim() || "Tool execution failed.";
        return errorEnvelope(message, "TOOL_STRING_ERROR", { raw: trimmed }, "retry");
      }

      try {
        const parsed = JSON.parse(trimmed) as Record<string, any>;
        const hasEnvelopeShape =
          typeof parsed?.status === "string" &&
          "data" in parsed &&
          "error" in parsed &&
          "nextAction" in parsed;

        if (hasEnvelopeShape) return JSON.stringify(parsed);

        if (parsed.status === "error") {
          return errorEnvelope(
            parsed.message || parsed.error || "Tool execution failed.",
            "TOOL_HANDLER_ERROR",
            { raw: parsed },
            parsed.nextAction || "retry",
          );
        }

        if (parsed.status === "success") {
          const { status, error, nextAction, ...rest } = parsed;
          return successEnvelope(rest, nextAction || "continue");
        }

        return successEnvelope(parsed, "continue");
      } catch {
        return successEnvelope({ text: trimmed }, "continue");
      }
    }

    if (rawOutput && typeof rawOutput === "object") {
      const parsed = rawOutput as Record<string, any>;
      const hasEnvelopeShape =
        typeof parsed?.status === "string" &&
        "data" in parsed &&
        "error" in parsed &&
        "nextAction" in parsed;
      if (hasEnvelopeShape) return JSON.stringify(parsed);

      if (parsed.status === "error") {
        return errorEnvelope(
          parsed.message || parsed.error || "Tool execution failed.",
          "TOOL_HANDLER_ERROR",
          { raw: parsed },
        );
      }

      if (parsed.status === "success") {
        const { status, error, nextAction, ...rest } = parsed;
        return successEnvelope(rest, nextAction || "continue");
      }

      return successEnvelope(parsed, "continue");
    }

    return successEnvelope({ value: rawOutput as any }, "continue");
  }

  function wrapToolWithEnvelope<T extends { invoke: (...args: any[]) => Promise<any> }>(toolInstance: T): T {
    const originalInvoke = toolInstance.invoke.bind(toolInstance);
    toolInstance.invoke = (async (...args: any[]) => {
      try {
        const raw = await originalInvoke(...args);
        return normalizeToolOutput(raw);
      } catch (error: any) {
        return errorEnvelope(
          error?.message || "Unexpected tool invocation failure.",
          "TOOL_INVOKE_EXCEPTION",
          { stack: error?.stack },
        );
      }
    }) as T["invoke"];
    return toolInstance;
  }

  
  // Helper to load project
  const loadProject = async () => {
    const project = await projectService.loadProject(userId, projectId);
    if (!project) throw new Error("Project not found or unauthorized.");
    return project;
  };

  // Helper to recalculate project duration after edits
  async function recalculateProjectDuration() {
    const project = await loadProject();
    if (!project || !project.overlays?.length) return;
    const maxFrame = Math.max(...project.overlays.map((o: any) => (o.from || 0) + (o.durationInFrames || 0)));
    if (maxFrame > 0 && maxFrame !== project.durationInFrames) {
      await projectService.updateProject(userId, projectId, { durationInFrames: maxFrame });
    }
  }

  // Helper to get canvas dimensions from project
  // IMPORTANT: Always use composition dimensions for overlay positioning.
  // playerDimensions is the preview container size and will cause positioning
  // issues during Lambda render if used directly.
  const getCanvasDimensions = (project: any) => {
    // Use composition dimensions based on aspect ratio
    if (project.aspectRatio === "9:16") return { width: 1080, height: 1920 };
    if (project.aspectRatio === "4:5") return { width: 1080, height: 1350 };
    if (project.aspectRatio === "1:1") return { width: 1080, height: 1080 };
    if (project.aspectRatio === "16:9") return { width: 1280, height: 720 };
    return { width: 1920, height: 1080 }; // Default fallback
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
   * Gemini sometimes sends numbers as strings (e.g., "0" instead of 0)
   * or time strings like "3s" or CSS-like strings for styles.
   * This prevents Zod validation errors.
   */
  const coerceInput = <T extends Record<string, any>>(input: T): T => {
    const result = { ...input };
    for (const key of Object.keys(result)) {
      const value = result[key];

      if (typeof value === 'string') {
        // Handle time strings: "3s", "3sec", "3 seconds" → frame count at 30fps
        const timeMatch = value.match(/^(\d+(?:\.\d+)?)\s*(s|sec|seconds?)$/i);
        if (timeMatch) {
          (result as any)[key] = Math.round(parseFloat(timeMatch[1]) * 30);
        }
        // Handle CSS-like style strings for 'styles' field: "fontSize: 72px; color: #FFF"
        else if (key === 'styles' && value.includes(':')) {
          const styleObj: Record<string, any> = {};
          value.split(';').forEach(pair => {
            const [k, ...vParts] = pair.split(':');
            if (k && vParts.length > 0) {
              const propName = k.trim();
              let propValue: any = vParts.join(':').trim();
              // Remove 'px' suffix and convert to number for font sizes
              if (/^\d+px$/i.test(propValue)) {
                propValue = parseInt(propValue, 10);
              }
              styleObj[propName] = propValue;
            }
          });
          (result as any)[key] = styleObj;
        }
        // Coerce plain string numbers to actual numbers
        else if (/^-?\d+(\.\d+)?$/.test(value)) {
          (result as any)[key] = parseFloat(value);
        }
      }

      // Coerce string booleans
      if (value === 'true') (result as any)[key] = true;
      if (value === 'false') (result as any)[key] = false;
    }
    return result;
  };

  const animationStyleSchema = z
    .object({
      enter: z.string().optional(),
      exit: z.string().optional(),
      duration: z.coerce.number().optional(),
    })
    .optional();

  const textOverlayStylesSchema = z
    .object({
      fontSize: z.union([z.coerce.number(), z.string()]).optional(),
      fontFamily: z.string().optional(),
      fontWeight: z.union([z.coerce.number(), z.string()]).optional(),
      textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
      color: z.string().optional(),
      backgroundColor: z.string().optional(),
      fontStyle: z.enum(["normal", "italic", "oblique"]).optional(),
      textDecoration: z
        .enum(["none", "underline", "line-through", "overline"])
        .optional(),
      textShadow: z.string().optional(),
      lineHeight: z.union([z.coerce.number(), z.string()]).optional(),
      letterSpacing: z.union([z.coerce.number(), z.string()]).optional(),
      opacity: z.coerce.number().optional(),
      animation: animationStyleSchema,
    })
    ;

  const mediaOverlayStylesSchema = z
    .object({
      objectFit: z.enum(["cover", "contain", "fill"]).optional(),
      volume: z.coerce.number().optional(),
      opacity: z.coerce.number().optional(),
      borderRadius: z.string().optional(),
      animation: animationStyleSchema,
    })
    ;

  const shapeOverlayStylesSchema = z
    .object({
      fill: z.string().optional(),
      stroke: z.string().optional(),
      strokeWidth: z.coerce.number().optional(),
      opacity: z.coerce.number().optional(),
      borderRadius: z.string().optional(),
    })
    ;

  const genericOverlayStylesSchema = z
    .object({
      opacity: z.coerce.number().optional(),
      borderRadius: z.string().optional(),
      animation: animationStyleSchema,
    })
    ;

  const overlayStylesUpdateSchema = z.union([
    textOverlayStylesSchema,
    mediaOverlayStylesSchema,
    shapeOverlayStylesSchema,
    genericOverlayStylesSchema,
  ]);


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

        // Strip bloated fields that waste LLM tokens (base64 thumbnails, signed URLs)
        const sanitizeForLLM = (proj: any) => {
          const sanitized = { ...proj };
          if (sanitized.overlays) {
            sanitized.overlays = sanitized.overlays.map((o: any) => {
              const clean = { ...o };
              // Remove base64 thumbnail data
              if (clean.content?.startsWith('data:image')) {
                clean.content = '[thumbnail:base64]';
              }
              // Remove long signed GCS URLs, keep just the filename
              if (clean.src?.includes('storage.googleapis.com')) {
                const match = clean.src.match(/\/([^\/\?]+)\?/);
                clean.src = match ? `[gcs:${decodeURIComponent(match[1])}]` : '[gcs:url]';
              }
              return clean;
            });
          }
          return sanitized;
        };

        const sanitizedProject = sanitizeForLLM(project);
        const canonical = JSON.stringify(sanitizedProject, null, 2);
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
    },
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
              durationSeconds:
                Math.round(((nextStart - currentEnd) / fps) * 10) / 10,
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
    styles: overlayStylesUpdateSchema
      .optional()
      .describe("Typed partial styles to merge (text/media/shape/generic)."),
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
      styles: overlayStylesUpdateSchema.optional(),
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

        await recalculateProjectDuration();

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

        await recalculateProjectDuration();

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
        
        // If deleting a video, cascade delete linked captions, transitions, and fancy captions
        if (overlay?.type === 'video') {
          const linkedOverlays = project.overlays.filter(
            (o: any) =>
              // Captions linked to this video
              ((o.type === 'caption' || (o.type === 'html-scene' && o.metadata?.sourceType === 'fancy-caption')) &&
                o.sourceVideoId === input.id) ||
              // Transitions referencing this video as clip A or B
              (o.type === 'transition' && (o.clipAId === input.id || o.clipBId === input.id))
          );
          // PERF FIX: Delete linked overlays in parallel (Priyank's optimization)
          await Promise.all(
            linkedOverlays.map((linked: any) =>
              projectService.deleteOverlay(userId, projectId, linked.id)
            )
          );
        }

        await projectService.deleteOverlay(userId, projectId, input.id);

        await recalculateProjectDuration();

        return JSON.stringify({ status: 'success', message: `Overlay ${input.id} deleted${overlay?.type === 'video' ? ' (and linked captions/fancy captions)' : ''}` });
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
              if ((sourceStyles as any)[prop] !== undefined) {
                stylesToApply[prop] = (sourceStyles as any)[prop];
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
    start: z.coerce.number().describe("Start frame number (integer, 0-based). At 30fps: 1 second = 30 frames."),
    duration: z.coerce.number().describe("Duration in frames (integer). At 30fps: 3 seconds = 90 frames."),
    row: z.coerce.number().optional().describe("Row index"),
    description: z.string().describe("Detailed description of the scene to generate (e.g., 'Retro vaporwave grid background with animated sun')"),
    x: z.coerce.number().optional().describe("Center X position"),
    y: z.coerce.number().optional().describe("Center Y position"),
    width: z.coerce.number().optional().describe("Width in pixels"),
    height: z.coerce.number().optional().describe("Height in pixels"),
    rotation: z.coerce.number().optional().default(0),
  });

  const generateHtmlScene = tool(
    async (rawInput: z.infer<typeof generateHtmlSceneSchema>) => {
      try {
        // EARLY VALIDATION: Coerce and validate before expensive operations
        const input = coerceInput(rawInput);
        if (isNaN(input.start) || isNaN(input.duration)) {
          return JSON.stringify({ 
            status: 'error', 
            message: `Invalid timing: start=${rawInput.start}, duration=${rawInput.duration}. Must be frame numbers (integers). At 30fps: 3s = 90 frames.` 
          });
        }
        if (input.duration <= 0) {
          return JSON.stringify({ status: 'error', message: 'Duration must be positive' });
        }
        
        const project = await loadProject();
        // Use composition dimensions for proper render compatibility
        const canvas = getCanvasDimensions(project);
        const safeWidth = canvas.width;
        const safeHeight = canvas.height;


        const id = Date.now() + Math.floor(Math.random() * 10000);

        // ── TEMPLATE-FIRST: Check motion graphic templates before AI generation ──
        try {
          const match = await findBestTemplate(input.description);
          if (match && match.score >= 0.7) {
            console.log(`[HTML-SCENE] Template match: "${match.template.name}" (score: ${match.score.toFixed(2)}). Using template instead of Gemini.`);
            const filledHtml = await fillTemplateSlots(match.template, input.description);
            const { sanitizeHtml: sanitize, createSandboxedWrapper: sandbox, extractStyleMetadata: extractMeta } = await import('../utils/html-generator-utils');
            const cleanHtml = sanitize(filledHtml);
            const overlayWidth = input.width ?? safeWidth;
            const overlayHeight = input.height ?? safeHeight;
            const wrappedHtml = sandbox({ html: cleanHtml, width: overlayWidth, height: overlayHeight, backgroundColor: 'transparent', autoFit: true });
            const styleMetadata = extractMeta(cleanHtml);
            const metadata: HtmlGenerationMetadata = { ...styleMetadata, generatedAt: new Date(), sourceType: 'scene' };
            const existingOverlays = toExistingOverlays(project.overlays || []);
            const assignedRow = input.row ?? findBestRow('html-scene' as any, { from: input.start, duration: input.duration }, existingOverlays);
            const newOverlay = {
              id,
              type: 'html-scene',
              from: input.start,
              durationInFrames: match.template.defaultDuration || input.duration,
              content: wrappedHtml,
              prompt: input.description,
              metadata,
              row: assignedRow,
              left: input.x !== undefined ? (input.x - overlayWidth / 2) : 0,
              top: input.y !== undefined ? (input.y - overlayHeight / 2) : 0,
              width: overlayWidth,
              height: overlayHeight,
              rotation: input.rotation ?? 0,
              isDragging: false,
              styles: { animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 } },
            };
            await projectService.addOverlay(userId, projectId, newOverlay as any);
            return JSON.stringify({
              status: 'success',
              id,
              templateUsed: match.template.templateId,
              metadata: { fonts: metadata.fonts, colors: metadata.colors.slice(0, 3) },
              message: `Used template "${match.template.name}" for "${input.description}". Resolution: ${overlayWidth}x${overlayHeight}. (Code hidden from chat log)`,
            });
          }
        } catch (templateErr: any) {
          console.warn('[HTML-SCENE] Template search failed, falling back to Gemini:', templateErr.message);
        }
        // ── END TEMPLATE-FIRST ──

        // PERF FIX: Reuse cached model instance (Priyank's optimization)
        const model = getLLMModel(0.7);

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
    start: z.coerce.number().describe("Start frame number (integer, 0-based). At 30fps: 1 second = 30 frames."),
    duration: z.coerce.number().describe("Duration in frames (integer). At 30fps: 3 seconds = 90 frames."),
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
    async (rawInput: z.infer<typeof generateHtmlStickerSchema>) => {
      try {
        // EARLY VALIDATION: Coerce and validate before expensive operations
        const input = coerceInput(rawInput);
        if (isNaN(input.start) || isNaN(input.duration)) {
          return JSON.stringify({ 
            status: 'error', 
            message: `Invalid timing: start=${rawInput.start}, duration=${rawInput.duration}. Must be frame numbers (integers). At 30fps: 3s = 90 frames.` 
          });
        }
        if (input.duration <= 0) {
          return JSON.stringify({ status: 'error', message: 'Duration must be positive' });
        }
        
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
        // const model = new ChatGoogleGenerativeAI({
        //   model: 'gemini-2.5-flash',
        //   apiKey: process.env.GEMINI_API_KEY,
        //   temperature: 0.8, // Higher creativity for stickers
        // });
        
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

        // PERF FIX: Reuse cached model instance instead of constructing a new one each call.
        // OLD: const model = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', apiKey: ..., temperature: 0.8 });
        const model = getLLMModel(0.8);

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
    videoOverlayId: z.coerce.number().optional().describe("ID of the video overlay to transcribe (REQUIRED for mode='single', ignored for mode='timeline')"),
    forceRefresh: z.coerce.boolean().optional().describe("Force re-transcription (ignores cache)"),
    mode: z.enum(['single', 'timeline']).optional().default('single').describe("'single' = one video overlay (requires videoOverlayId), 'timeline' = all video clips in sequence order"),
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
          
          // PERF FIX: Fetch all clip transcriptions in parallel instead of sequentially.
          // OLD: for (const video of videoOverlays) { const transcription = await getTranscription(...) }
          // Each clip required a separate DB/API round-trip, and they ran one after another.
          // With Promise.all they all fire simultaneously — reduces N clips × RTT to 1 × RTT.
          const transcriptions = await Promise.all(
            videoOverlays.map((video: any) =>
              getTranscription(video.assetId as string, userId, {
                forceRefresh: input.forceRefresh,
              })
            )
          );

          for (let idx = 0; idx < videoOverlays.length; idx++) {
            const video = videoOverlays[idx];
            const transcription = transcriptions[idx];
            
            // Get only words that fall within this clip's range
            // IMPORTANT: videoStartTime is stored in FRAMES
            const videoStartTimeFrames = (video as any).videoStartTime || 0;
            const videoStartMs = (videoStartTimeFrames / fps) * 1000;
            const clipDurationMs = (video.durationInFrames / fps) * 1000;
            const videoEndMs = videoStartMs + clipDurationMs;
            
            const wordsInClip = transcription.words.filter(
              (w: any) => w.startMs >= videoStartMs && w.startMs < videoEndMs
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
          // Validate that videoOverlayId is provided for single mode
          if (input.videoOverlayId === undefined || isNaN(input.videoOverlayId)) {
            return JSON.stringify({ status: 'error', message: "videoOverlayId is required for mode='single'" });
          }
          
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
          // IMPORTANT: videoStartTime is stored in FRAMES
          const videoStartTimeFrames = (overlay.videoStartTime || 0);
          const videoStartMs = (videoStartTimeFrames / fps) * 1000;
          const clipDurationMs = (overlay.durationInFrames / fps) * 1000;
          const videoEndMs = videoStartMs + clipDurationMs;
          
          const wordsInClip = transcription.words.filter(
            (w: any) => w.startMs >= videoStartMs && w.startMs < videoEndMs
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
        const analysis: any = await analyzeContent(overlay.assetId, userId, {
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
    style: z.enum(['tiktok', 'minimal', 'bold', 'karaoke', 'subtitle', 'hormozi', 'mrbeast', 'ali-abdaal', 'corporate']).optional().default('tiktok').describe("Caption style preset. 'hormozi' = bold white, yellow keywords, high contrast. 'mrbeast' = large colorful, pop animation. 'ali-abdaal' = clean minimal modern. 'corporate' = professional bottom bar."),
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

        // For pipeline-generated videos (AI video + voiceover), the video has NO audio.
        // Find the voiceover overlay covering this video's time range and use IT for transcription.
        const videoFrom = overlay.from;
        const videoEnd = videoFrom + overlay.durationInFrames;
        const voiceoverOverlay = project.overlays.find((o: any) => {
          if (o.type !== 'sound') return false;
          // Match by: same time range (within 30 frames tolerance) AND on voiceover row (3) or has voiceover_ assetId
          const isVoiceover = o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_');
          if (!isVoiceover) return false;
          const oEnd = o.from + o.durationInFrames;
          // Check time overlap (not exact match — overlays may differ by a few frames)
          return !(oEnd <= videoFrom || o.from >= videoEnd);
        });

        // If voiceover exists, use its assetId for transcription instead of the silent video.
        // If NO voiceover overlaps AND video is pipeline-generated (AI clip = no real speech),
        // skip gracefully. User-uploaded footage (no generationUnitId) still falls through
        // to video-based transcription for talking heads / lectures / interviews.
        if (!voiceoverOverlay) {
          const isPipelineGenerated = (overlay as any).metadata?.generationUnitId != null;
          if (isPipelineGenerated) {
            console.log(`[add_captions] Skipping AI-gen video ${overlay.id}: no voiceover in time range [${videoFrom}-${videoEnd}], AI videos have no captionable speech`);
            return JSON.stringify({
              status: 'skipped',
              data: null,
              message: `No voiceover covers this video's time range. AI-generated videos have no captionable speech.`,
            });
          }
        }
        const transcriptionAssetId = voiceoverOverlay?.assetId || overlay.assetId;
        console.log(`[add_captions] Using ${voiceoverOverlay ? 'voiceover' : 'video'} asset for transcription: ${transcriptionAssetId}`);

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
          assetId: transcriptionAssetId, // Use voiceover asset if available (video is silent)
          playerDimensions: canvas,
          fps,
          style: input.style,
          position: input.position,
          styleOverrides: Object.keys(styleOverrides).length > 0 ? styleOverrides : undefined,
          displayOverrides: Object.keys(displayOverrides).length > 0 ? displayOverrides : undefined,
        });
        
        // OLD: row 0 (shared with SFX, caused timeline overlap).
        // NEW: row 4 (ROW.CAPTIONS) for clean timeline separation.
        // Rendering z-index is handled in layer.tsx — captions get z-index 95
        // regardless of row, so they always render above video (z-index 80).
        captionOverlay = { ...captionOverlay, row: ROW.CAPTIONS };
        
        // Add caption to project
        await projectService.addOverlay(userId, projectId, captionOverlay as any);
        
        return JSON.stringify({
          status: 'success',
          captionId: captionOverlay.id,
          style: input.style,
          position: input.position,
          captionCount: captionOverlay.captions.length,
          message: `Added ${input.style} captions (${captionOverlay.captions.length} segments) at row 0`,
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
    newStyle: z.enum(['tiktok', 'minimal', 'bold', 'karaoke', 'subtitle', 'hormozi', 'mrbeast', 'ali-abdaal', 'corporate']).optional().describe("Optional new style to apply"),
  });

  const refreshCaptionsAI = tool(
    async (rawInput: z.infer<typeof refreshCaptionsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        
        // Find the caption overlay
        const captionOverlay: any = project.overlays.find(
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
          videoOverlay: videoOverlay as any,
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

        if (videoClips.length === 0) {
          return JSON.stringify({ status: 'success', message: 'No video clips found to close gaps for' });
        }

        let totalFramesClosed = 0;
        const moves: Array<{ id: number; oldFrom: number; newFrom: number }> = [];

        // Build a list of gaps between video clips (including gap before first clip)
        const gaps: Array<{ gapStart: number; gapEnd: number; shift: number }> = [];
        let nextStart = 0; // BUG 3 FIX: Start from 0, not first clip position
        let cumulativeShift = 0;

        for (const clip of videoClips) {
          if (clip.from > nextStart) {
            const gapSize = clip.from - nextStart;
            cumulativeShift += gapSize;
            totalFramesClosed += gapSize;
            gaps.push({ gapStart: nextStart, gapEnd: clip.from, shift: cumulativeShift });
          }
          nextStart = clip.from + clip.durationInFrames;
        }

        if (gaps.length === 0) {
          return JSON.stringify({ status: 'success', message: 'No gaps found to close' });
        }

        // BUG 2 FIX: Shift ALL overlays (not just video + captions)
        // For each overlay, calculate how much to shift it based on gaps before it
        const alreadyMoved = new Set<number>();

        for (const overlay of project.overlays) {
          const overlayStart = overlay.from || 0;

          // Find the total shift for this overlay based on gaps before its start
          let shiftAmount = 0;
          for (const gap of gaps) {
            if (overlayStart >= gap.gapEnd) {
              // Overlay starts after this gap, apply this gap's contribution
              shiftAmount = gap.shift;
            } else {
              break;
            }
          }

          if (shiftAmount > 0 && !alreadyMoved.has(overlay.id)) {
            const newFrom = overlayStart - shiftAmount;
            moves.push({ id: overlay.id, oldFrom: overlayStart, newFrom });
            await projectService.updateOverlay(userId, projectId, overlay.id, { from: newFrom });
            alreadyMoved.add(overlay.id);
          }
        }

        await recalculateProjectDuration();

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
    style: z.enum(['bento', 'scattered', 'minimal', 'static', 'kinetic']).optional().default('bento')
      .describe("Layout style: 'bento' (tight grid, default), 'scattered' (floating, aka scatter mode), 'kinetic' (balanced storytelling mode), 'minimal' (centered stack), 'static' (fixed non-scattered fancy layout, aka static manner)"),
    intensity: z.enum(['low', 'medium', 'high']).optional().default('medium')
      .describe("Visual intensity level: low (subtle), medium (balanced default), high (more dramatic)"),
    primaryColor: z.string().optional().describe("Primary text color, e.g., '#ffffff'"),
    accentColor: z.string().optional().describe("Accent color for hero words, e.g., '#FFE66D'"),
    backgroundColor: z.string().optional().default('transparent')
      .describe("Background color (default: transparent)"),
    lockTypography: z.coerce.boolean().optional().default(false)
      .describe("Lock typography system across generations for consistency"),
    fontPair: z.string().optional().describe("Typography lock: preferred font pair label, e.g. 'Oswald + Playfair Display'"),
    strokeStyle: z.string().optional().describe("Typography lock: stroke style hint"),
    shadowStyle: z.string().optional().describe("Typography lock: shadow style hint"),
    paletteHint: z.string().optional().describe("Typography lock: palette/system hint"),
    
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

        segmentStartFrame = Math.max(overlay.from, segmentStartFrame);
        segmentEndFrame = Math.min(overlay.from + overlay.durationInFrames, segmentEndFrame);
        if (segmentEndFrame <= segmentStartFrame) {
          return JSON.stringify({ status: 'error', message: 'Invalid segment range for fancy captions' });
        }
        
        // Calculate video-time range for this segment
        // IMPORTANT: videoStartTime is stored in FRAMES (set by split_overlay)
        // Convert frames -> seconds -> milliseconds
        const videoStartTimeFrames = overlay.videoStartTime || 0;
        const videoStartMs = (videoStartTimeFrames / fps) * 1000;
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
        
        // ===== DEBUG LOGGING START =====
        // PERF FIX: Guarded behind DEBUG_FANCY_CAPTIONS env flag.
        // Previously these console.log calls (including a per-word forEach loop) fired
        // unconditionally on EVERY add_fancy_captions invocation, adding synchronous
        // I/O overhead and cluttering production logs.
        // Set DEBUG_FANCY_CAPTIONS=true in .env.local to re-enable during development.
        const DEBUG_FANCY = process.env.DEBUG_FANCY_CAPTIONS === 'true';
        if (DEBUG_FANCY) {
          console.log('\n========== [FANCY-CAPTIONS DEBUG] ==========');
          console.log('Segment range (frames):', segmentStartFrame, '->', segmentEndFrame);
          console.log('Segment range (ms):', segmentStartMs.toFixed(0), '->', segmentEndMs.toFixed(0));
          console.log('Video overlay from:', overlay.from, 'videoStartTime:', overlay.videoStartTime || 0);
          console.log('Total transcription words:', transcription.words.length);
          console.log('Words in range count:', wordsInRange.length);
          console.log('\n--- Word Timings (0-based, relative to segment start) ---');
          wordsInRange.forEach((w: any, i: number) => {
            console.log(`  [${i}] "${w.word}" | start: ${w.startMs}ms | end: ${w.endMs}ms | duration: ${w.endMs - w.startMs}ms`);
          });
        }
        // ===== DEBUG LOGGING END =====
        
        // Classify word importance
        const classifiedWords = classifyWordTimings(wordsInRange);
        
        // Calculate total duration for exit animation
        const totalDurationMs = Math.round(segmentEndMs - segmentStartMs);
        
        // Use the video overlay's actual box — not the full canvas.
        // The video may be letterboxed inside the composition.
        const videoBox = {
          left: overlay.left ?? 0,
          top: overlay.top ?? 0,
          width: overlay.width ?? canvas.width,
          height: overlay.height ?? canvas.height,
        };

        // Build typography lock profile (for consistency across clips/regenerations)
        const linkedFancyCaptions = project.overlays
          .filter((o: any) =>
            o.type === 'html-scene' &&
            o.metadata?.sourceType === 'fancy-caption' &&
            o.sourceVideoId === input.videoOverlayId
          )
          .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
        const latestFancyCaption = linkedFancyCaptions[0] as any;

        const derivedFontPairFromMetadata =
          latestFancyCaption?.metadata?.fonts?.length >= 2
            ? `${latestFancyCaption.metadata.fonts[0]} + ${latestFancyCaption.metadata.fonts[1]}`
            : latestFancyCaption?.metadata?.fonts?.[0];

        const typographyProfile =
          input.lockTypography
            ? {
                fontPair:
                  input.fontPair ||
                  latestFancyCaption?.fancyCaptionConfig?.typographyProfile?.fontPair ||
                  derivedFontPairFromMetadata ||
                  'Oswald + Playfair Display',
                strokeStyle:
                  input.strokeStyle ||
                  latestFancyCaption?.fancyCaptionConfig?.typographyProfile?.strokeStyle ||
                  'subtle 1-2px stroke on selected hero words',
                shadowStyle:
                  input.shadowStyle ||
                  latestFancyCaption?.fancyCaptionConfig?.typographyProfile?.shadowStyle ||
                  '2px 2px 0 rgba(0,0,0,0.8)',
                paletteHint:
                  input.paletteHint ||
                  latestFancyCaption?.fancyCaptionConfig?.typographyProfile?.paletteHint ||
                  `${input.primaryColor || '#FFFFFF'} / ${input.accentColor || '#FFE66D'}`,
              }
            : undefined;

        // Build prompt using the video's box dimensions
        const prompt = buildFancyCaptionPrompt({
          words: classifiedWords,
          canvasWidth: videoBox.width,
          canvasHeight: videoBox.height,
          style: input.style || 'bento',
          intensity: input.intensity || 'medium',
          primaryColor: input.primaryColor,
          accentColor: input.accentColor,
          backgroundColor: input.backgroundColor || 'transparent',
          lockTypography: input.lockTypography || false,
          typographyProfile,
        });
        
        // ===== DEBUG: Log the prompt being sent to LLM =====
        // PERF FIX: Guarded — same DEBUG_FANCY_CAPTIONS flag as above.
        if (DEBUG_FANCY) {
          console.log('\n--- Classified Words with Importance ---');
          classifiedWords.forEach((w, i) => {
            const delaySeconds = (w.startMs / 1000).toFixed(2);
            console.log(`  [${i}] "${w.word}" | delay: ${delaySeconds}s | importance: ${w.importance}`);
          });
          console.log('\n--- Prompt Word Table Section ---');
          const wordTableLog = classifiedWords.map((w, i) => {
            const delaySeconds = (w.startMs / 1000).toFixed(2);
            return `| ${i + 1} | "${w.word}" | ${w.startMs}ms | ${w.endMs}ms | ${delaySeconds}s | ${w.importance?.toUpperCase()} |`;
          }).join('\n');
          console.log(wordTableLog);
          console.log('\nTotal duration:', totalDurationMs, 'ms');
          console.log('Exit animation delay:', ((Math.max(...classifiedWords.map(w => w.endMs)) - 300) / 1000).toFixed(2), 's');
          console.log('========== [END FANCY-CAPTIONS DEBUG] ==========\n');
        }
        
        console.log('[FANCY-CAPTIONS] Generating for', classifiedWords.length, 'words, duration:', totalDurationMs, 'ms');
        
        // PERF FIX: Reuse cached model instance instead of constructing a new one each call.
        // OLD: const model = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', apiKey: ..., temperature: 0.8 });
        const model = getLLMModel(0.8);
        
        const result = await model.invoke([
          new SystemMessage(prompt),
          new HumanMessage(`Generate the kinetic typography animation for these ${classifiedWords.length} words. Total duration: ${totalDurationMs}ms.`),
        ]);
        
        const generatedHtml = result.content as string;
        
        // ===== DEBUG: Log generated HTML =====
        // PERF FIX: Guarded — runs regex scans over potentially large HTML strings.
        // These regex operations (match animation-delay, match animation properties)
        // were running on every production invocation with no benefit.
        if (DEBUG_FANCY) {
          console.log('\n========== [FANCY-CAPTIONS GENERATED HTML] ==========');
          console.log('Raw HTML length:', generatedHtml.length);
          
          // Extract animation-delay values from the generated HTML to verify timing
          const delayMatches = generatedHtml.match(/animation-delay\s*:\s*[\d.]+s/gi) || [];
          console.log('\n--- Animation delays found in generated HTML ---');
          delayMatches.forEach((d, i) => console.log(`  [${i}] ${d}`));
          
          // Also check for inline animation properties
          const animationMatches = generatedHtml.match(/animation\s*:\s*[^;"}]+/gi) || [];
          console.log('\n--- Animation properties found ---');
          animationMatches.slice(0, 20).forEach((a, i) => console.log(`  [${i}] ${a.substring(0, 100)}`));
          
          console.log('\n--- First 2000 chars of generated HTML ---');
          console.log(generatedHtml.substring(0, 2000));
          console.log('========== [END GENERATED HTML] ==========\n');
        }
        
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
        
        // ===== INJECT TIMING CSS PROGRAMMATICALLY =====
        // This handles the reliable timing work so LLM only does creative layout
        cleanHtml = injectFancyCaptionTiming(cleanHtml, totalDurationMs);
        console.log('[FANCY-CAPTIONS] Injected programmatic timing CSS for', classifiedWords.length, 'words');
        
        // Wrap in sandbox using the video's box dimensions
        const wrappedHtml = createSandboxedWrapper({
          html: cleanHtml,
          width: videoBox.width,
          height: videoBox.height,
          backgroundColor: input.backgroundColor || 'transparent',
          autoFit: true,
        });

        const styleMetadata = extractStyleMetadata(cleanHtml);
        const metadata: HtmlGenerationMetadata = {
          ...styleMetadata,
          generatedAt: new Date(),
          sourceType: 'fancy-caption',
          wordCount: classifiedWords.length,
        };
        
        const id = Date.now() + Math.floor(Math.random() * 10000);
        const segmentDuration = segmentEndFrame - segmentStartFrame;
        
        // Fancy captions on row 4 (same as regular captions).
        // z-index handled in layer.tsx — captions always render above video.

        // Position the caption overlay exactly on top of the video overlay's box
        const newOverlay = {
          id,
          type: 'html-scene',
          from: segmentStartFrame,
          durationInFrames: segmentDuration,
          content: wrappedHtml,
          prompt: `Fancy captions: ${classifiedWords.map(w => w.word).join(' ')}`,
          metadata,
          sourceVideoId: overlay.id,
          fancyCaptionConfig: {
            style: input.style || 'bento',
            intensity: input.intensity || 'medium',
            segmentStartOffsetFrames: segmentStartFrame - overlay.from,
            segmentDurationFrames: segmentDuration,
            maxWords,
            primaryColor: input.primaryColor,
            accentColor: input.accentColor,
            backgroundColor: input.backgroundColor || 'transparent',
            lockTypography: input.lockTypography || false,
            typographyProfile,
          },
          row: ROW.MOTION_GRAPHICS,
          left: videoBox.left,
          top: videoBox.top,
          width: videoBox.width,
          height: videoBox.height,
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
          intensity: input.intensity || 'medium',
          lockTypography: input.lockTypography || false,
          segmentType: input.segmentType || 'hook',
          startFrame: segmentStartFrame,
          endFrame: segmentEndFrame,
          metadata: {
            fonts: metadata.fonts,
            colors: metadata.colors,
            backgroundColor: metadata.backgroundColor,
          },
          rowsShifted: false,
          message: `Added fancy ${input.style || 'bento'}-style captions (${input.intensity || 'medium'} intensity) with ${classifiedWords.length} words. Fonts: ${metadata.fonts.join(', ') || 'system'}. Colors: ${metadata.colors.slice(0, 3).join(', ')}.`,
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
- 'scattered': Floating words at different positions with rotations (scatter mode)
- 'kinetic': Balanced storytelling mode (the middle between scattered and static)
- 'minimal': Clean centered stack, simple animations
- 'static': Fancy but stable block layout (static manner, no scattered placement/rotations)

INTENSITY:
- 'low': subtle motion and contrast
- 'medium' (default): balanced storytelling
- 'high': more dramatic hierarchy and motion

CONSISTENCY + QUALITY:
- lockTypography: preserve font/effects system across generations
- semantic CTA emphasis and beat-aware hero emphasis are applied automatically
- safe layout constraints prevent clipping and overlap

LIMITS: Max 15-25 words per call. For longer content, call multiple times.

RETURNS: Overlay ID and extracted metadata (fonts, colors) for style consistency.`,
      schema: addFancyCaptionsSchema,
    },
  );

  const refreshFancyCaptionsSchema = z.object({
    fancyCaptionOverlayId: z.coerce.number().describe("ID of the fancy caption html-scene overlay to refresh"),
    newStyle: z.enum(['bento', 'scattered', 'minimal', 'static', 'kinetic']).optional().describe("Optional new fancy caption style"),
    newIntensity: z.enum(['low', 'medium', 'high']).optional().describe("Optional new intensity"),
    lockTypography: z.coerce.boolean().optional().describe("Optional typography lock override"),
    fontPair: z.string().optional().describe("Typography lock: preferred font pair label"),
    strokeStyle: z.string().optional().describe("Typography lock: stroke style hint"),
    shadowStyle: z.string().optional().describe("Typography lock: shadow style hint"),
    paletteHint: z.string().optional().describe("Typography lock: palette/system hint"),
  });

  const refreshFancyCaptionsAI = tool(
    async (rawInput: z.infer<typeof refreshFancyCaptionsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const fancyOverlay = project.overlays.find(
          (o: any) =>
            o.id === input.fancyCaptionOverlayId &&
            o.type === 'html-scene' &&
            o.metadata?.sourceType === 'fancy-caption'
        ) as any;

        if (!fancyOverlay) {
          return JSON.stringify({ status: 'error', message: 'Fancy caption overlay not found' });
        }

        if (!fancyOverlay.sourceVideoId) {
          return JSON.stringify({ status: 'error', message: 'Fancy caption is not linked to a video (no sourceVideoId)' });
        }

        if (!fancyOverlay.fancyCaptionConfig) {
          return JSON.stringify({ status: 'error', message: 'Fancy caption config missing; unable to refresh' });
        }

        const videoOverlay = project.overlays.find(
          (o: any) => o.id === fancyOverlay.sourceVideoId && o.type === 'video'
        ) as any;

        if (!videoOverlay || !videoOverlay.assetId) {
          return JSON.stringify({ status: 'error', message: 'Linked video overlay not found (or missing assetId)' });
        }

        const config = fancyOverlay.fancyCaptionConfig;
        const canvas = getCanvasDimensions(project);
        const fps = project.fps || 30;

        const segmentStartFrame = videoOverlay.from + (config.segmentStartOffsetFrames || 0);
        const maxEndFrame = videoOverlay.from + videoOverlay.durationInFrames;
        const segmentDurationFrames = Math.max(1, config.segmentDurationFrames || (fancyOverlay.durationInFrames || 1));
        const segmentEndFrame = Math.min(maxEndFrame, segmentStartFrame + segmentDurationFrames);

        if (segmentEndFrame <= segmentStartFrame) {
          return JSON.stringify({ status: 'error', message: 'Segment no longer valid after video edits' });
        }

        const { getTranscription } = await import('../services/media');
        const transcription = await getTranscription(videoOverlay.assetId, userId);
        if (!transcription.words || transcription.words.length === 0) {
          return JSON.stringify({ status: 'error', message: 'No speech detected in linked video' });
        }

        const videoStartTimeFrames = videoOverlay.videoStartTime || 0;
        const videoStartMs = (videoStartTimeFrames / fps) * 1000;
        const segmentStartMs = videoStartMs + ((segmentStartFrame - videoOverlay.from) / fps * 1000);
        const segmentEndMs = videoStartMs + ((segmentEndFrame - videoOverlay.from) / fps * 1000);
        const maxWords = Math.min(config.maxWords || 15, 25);

        const wordsInRange = transcription.words
          .filter((w: any) => w.startMs >= segmentStartMs && w.startMs < segmentEndMs)
          .slice(0, maxWords)
          .map((w: any) => ({
            word: w.word,
            startMs: Math.round(w.startMs - segmentStartMs),
            endMs: Math.round(Math.min(w.endMs - segmentStartMs, segmentEndMs - segmentStartMs)),
          }));

        if (wordsInRange.length === 0) {
          return JSON.stringify({ status: 'error', message: 'No speech found in linked segment' });
        }

        const classifiedWords = classifyWordTimings(wordsInRange);
        const totalDurationMs = Math.round(segmentEndMs - segmentStartMs);
        const style = input.newStyle || config.style || 'bento';
        const intensity = input.newIntensity || config.intensity || 'medium';
        const lockTypography = input.lockTypography ?? config.lockTypography ?? false;
        const typographyProfile = lockTypography
          ? {
              fontPair: input.fontPair || config.typographyProfile?.fontPair,
              strokeStyle: input.strokeStyle || config.typographyProfile?.strokeStyle,
              shadowStyle: input.shadowStyle || config.typographyProfile?.shadowStyle,
              paletteHint: input.paletteHint || config.typographyProfile?.paletteHint || `${config.primaryColor || '#FFFFFF'} / ${config.accentColor || '#FFE66D'}`,
            }
          : undefined;

        // Use the video overlay's actual box dimensions
        const videoBox = {
          left: videoOverlay.left ?? 0,
          top: videoOverlay.top ?? 0,
          width: videoOverlay.width ?? canvas.width,
          height: videoOverlay.height ?? canvas.height,
        };

        const prompt = buildFancyCaptionPrompt({
          words: classifiedWords,
          canvasWidth: videoBox.width,
          canvasHeight: videoBox.height,
          style,
          intensity,
          primaryColor: config.primaryColor,
          accentColor: config.accentColor,
          backgroundColor: config.backgroundColor || 'transparent',
          lockTypography,
          typographyProfile,
        });

        // PERF FIX: Reuse cached model instance instead of constructing a new one each call.
        // OLD: const model = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', apiKey: ..., temperature: 0.8 });
        const model = getLLMModel(0.8);

        const result = await model.invoke([
          new SystemMessage(prompt),
          new HumanMessage(`Generate the kinetic typography animation for these ${classifiedWords.length} words. Total duration: ${totalDurationMs}ms.`),
        ]);

        const generatedHtml = result.content as string;
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

        cleanHtml = sanitizeHtml(cleanHtml);
        cleanHtml = injectFancyCaptionTiming(cleanHtml, totalDurationMs);

        const wrappedHtml = createSandboxedWrapper({
          html: cleanHtml,
          width: videoBox.width,
          height: videoBox.height,
          backgroundColor: config.backgroundColor || 'transparent',
          autoFit: true,
        });

        const styleMetadata = extractStyleMetadata(cleanHtml);
        const metadata: HtmlGenerationMetadata = {
          ...styleMetadata,
          generatedAt: new Date(),
          sourceType: 'fancy-caption',
          wordCount: classifiedWords.length,
        };

        // Re-sync caption position to match the video overlay's current box
        await projectService.updateOverlay(userId, projectId, fancyOverlay.id, {
          from: segmentStartFrame,
          durationInFrames: segmentEndFrame - segmentStartFrame,
          content: wrappedHtml as any,
          prompt: `Fancy captions: ${classifiedWords.map((w) => w.word).join(' ')}` as any,
          metadata: metadata as any,
          sourceVideoId: videoOverlay.id as any,
          left: videoBox.left as any,
          top: videoBox.top as any,
          width: videoBox.width as any,
          height: videoBox.height as any,
          fancyCaptionConfig: {
            ...config,
            style,
            intensity,
            lockTypography,
            typographyProfile,
            segmentDurationFrames: segmentEndFrame - segmentStartFrame,
          } as any,
        } as any);

        return JSON.stringify({
          status: 'success',
          id: fancyOverlay.id,
          sourceVideoId: videoOverlay.id,
          style,
          intensity,
          wordCount: classifiedWords.length,
          startFrame: segmentStartFrame,
          endFrame: segmentEndFrame,
          message: `Refreshed fancy captions with ${classifiedWords.length} words and re-synced to linked video timing`,
        });
      } catch (e: any) {
        console.error('[FANCY-CAPTIONS][REFRESH] Error:', e);
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'refresh_fancy_captions',
      description: `Refresh and re-sync fancy captions to their linked source video.
Use this after trim/split/move operations or when fancy captions drift out of sync.`,
      schema: refreshFancyCaptionsSchema,
    }
  );
  
  // ============================================================================
  // analyze_clip_audio 
  // ============================================================================

  const analyzeClipAudioSchema = z.object({
    // Dynamic prompt support - make all fields optional and handle validation in the tool
    target: z
      .string()
      .optional()
      .describe(
        'Natural-language description of which audio/video to analyze OR an asset ID (e.g., "the interview", "first 30 seconds", or "493402").',
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        'Start time in hh:mm:ss or mm:ss format (e.g., "00:30" for 30 seconds).',
      ),
    endTime: z
      .string()
      .optional()
      .describe(
        "End time in hh:mm:ss or mm:ss format. Maximum 2 minutes from startTime.",
      ),
    windowMinutes: z
      .number()
      .optional()
      .describe(
        "Analysis window in minutes when using target. Default is 2.",
      ),
    // Manual specification (fallback)
    source: z.enum(["timeline", "asset"]).optional(),
    assetId: z.string().optional(),
    startFrame: z.number().optional(),
    endFrame: z.number().optional(),
    fps: z.number().optional(),
    analyzeAll: z
      .boolean()
      .optional()
      .describe(
        "If true, analyze all audio/video overlays (each up to 2 min). Use when user wants 'all' or multiple clips.",
      ),
  });

  const analyzeClipAudio = tool(
    async (
      rawInput: z.infer<typeof analyzeClipAudioSchema> & { prompt?: string },
    ) => {
      try {
        console.log("[AUDIO-TOOL] ========== START ==========");
        
        const input = rawInput;
        const project = await loadProject();
        const projectFps = input.fps || project?.fps || 30;

        // Combine target and prompt for search
        const prompt = (input.prompt || input.target || "").trim();
        console.log("[AUDIO-TOOL] Search prompt:", prompt);

        // 1) Parse time range from input
        let parsedRange = null;
        
        // Check if startTime/endTime are provided
        if (input.startTime && input.endTime) {
          const parseTime = (timeStr: string): number => {
            const parts = timeStr.split(':').map(Number);
            if (parts.length === 2) {
              return parts[0] * 60 + parts[1]; // mm:ss
            } else if (parts.length === 3) {
              return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
            }
            return 0;
          };
          
          const startSec = parseTime(input.startTime);
          const endSec = parseTime(input.endTime);
          
          parsedRange = { startSec, endSec };
          console.log("[AUDIO-TOOL] Parsed time range from input:", parsedRange);
        } else {
          // Try to parse from prompt
          parsedRange = parsePromptTimeRange(prompt, projectFps, 120);
          console.log("[AUDIO-TOOL] Parsed time range from prompt:", parsedRange);
        }

        // 2) Pick audio-capable overlays
        const overlays = (project.overlays || []).filter(
          (o: any) =>
            (o.type === "audio" || o.type === "video" || o.type === "sound") &&
            (o.assetId || o.src),
        );

        console.log("[AUDIO-TOOL] Total overlays found:", overlays.length);
        console.log("[AUDIO-TOOL] Overlays:", overlays.map((o: any) => ({
          id: o.id,
          name: o.name,
          assetId: o.assetId,
          type: o.type,
          from: o.from,
          duration: o.durationInFrames
        })));
        
        if (overlays.length === 0) {
          return JSON.stringify({
            status: "error",
            message:
              "No audio or video overlays with assets found. Upload media first.",
          });
        }

        // analyzeAll: analyze each overlay (each up to 2 min)
        if (input.analyzeAll && overlays.length > 1) {
          const { analyzeClipAudioService }: any = await import("../services/media");
          const results: any[] = [];
          const maxFrames = 120 * projectFps;
          for (const o of overlays) {
            if (!o.assetId) continue;
            const overlayDur = o.durationInFrames || 0;
            const windowFrames = Math.min(maxFrames, overlayDur > 0 ? overlayDur : maxFrames);
            const startFrame = o.from || 0;
            const endFrame = startFrame + Math.min(windowFrames, overlayDur > 0 ? overlayDur : maxFrames);
            try {
              const result = await analyzeClipAudioService({
                projectId,
                userId,
                source: "asset",
                assetId: o.assetId,
                startFrame,
                endFrame,
                fps: projectFps,
              });
              results.push({
                overlay: { id: o.id, assetId: o.assetId, name: (o as any).name, type: o.type },
                summary: result.summary,
                silences: result.silenceGapsFrames.length,
                fillers: result.fillers.length,
                problematic: result.problematicFrames.length,
              });
            } catch (e: any) {
              results.push({ overlay: { id: o.id, assetId: o.assetId, name: (o as any).name }, error: e.message });
            }
          }
          return JSON.stringify({ status: "success", type: "audio", analyzeAll: true, results });
        }

        // 3) Choose overlay - check if target is an assetId first
        const chooseOverlay = () => {
          // First check if input.assetId is provided
          if (input.assetId) {
            const match = overlays.find((o: any) => o.assetId === input.assetId);
            if (match) {
              console.log("[AUDIO-TOOL] Matched by input.assetId:", input.assetId);
              return match;
            }
          }
          
          // Check if target/prompt looks like an asset ID or contains searchable text
          if (prompt) {
            const lower = prompt.toLowerCase();
            
            // Try exact assetId match first
            const assetMatch = overlays.find((o: any) => o.assetId === prompt);
            if (assetMatch) {
              console.log("[AUDIO-TOOL] Matched by exact assetId:", prompt);
              return assetMatch;
            }
            
            // Try partial assetId match
            const partialAssetMatch = overlays.find((o: any) => 
              o.assetId && o.assetId.toLowerCase().includes(lower)
            );
            if (partialAssetMatch) {
              console.log("[AUDIO-TOOL] Matched by partial assetId:", prompt);
              return partialAssetMatch;
            }
            
            // Try name/content match
            const nameMatch = overlays.find(
              (o: any) =>
                (o.name && o.name.toLowerCase().includes(lower)) ||
                (o.content &&
                  typeof o.content === "string" &&
                  o.content.toLowerCase().includes(lower)),
            );
            if (nameMatch) {
              console.log("[AUDIO-TOOL] Matched by name/content:", prompt);
              return nameMatch;
            }
          }

          // If time range exists, find overlapping overlay
          if (parsedRange) {
            const startF = Math.round(parsedRange.startSec * projectFps);
            const endF = Math.round(parsedRange.endSec * projectFps);
            const overlap = overlays.find((o: any) => {
              const oStart = o.from || 0;
              const oEnd = oStart + (o.durationInFrames || 0);
              return !(endF < oStart || startF > oEnd);
            });
            if (overlap) {
              console.log("[AUDIO-TOOL] Matched by time overlap");
              return overlap;
            }
          }

          console.log("[AUDIO-TOOL] Using first overlay as fallback");
          return overlays[0];
        };

        const chosen: any = chooseOverlay();
        console.log("[AUDIO-TOOL] Chosen overlay:", {
          id: chosen?.id,
          name: chosen?.name,
          assetId: chosen?.assetId,
          type: chosen?.type
        });
        
        if (!chosen?.assetId) {
          return JSON.stringify({
            status: "error",
            message: "Selected overlay does not have an assetId.",
          });
        }

        // 4) Determine start/end frames
        let startFrame: number;
        let endFrame: number;

        if (parsedRange) {
          startFrame = Math.round(parsedRange.startSec * projectFps);
          endFrame = Math.round(parsedRange.endSec * projectFps);
          console.log("[AUDIO-TOOL] Using parsed range for frames");
        } else {
          const windowMinutes = input.windowMinutes ?? 2;
          const windowFrames = Math.round(windowMinutes * 60 * projectFps);
          const overlayDur = chosen.durationInFrames || 0;

          if (overlayDur > 0) {
            startFrame = Math.max(
              0,
              chosen.from + Math.floor((overlayDur - windowFrames) / 2),
            );
            endFrame = Math.min(
              chosen.from + overlayDur,
              startFrame + windowFrames,
            );
          } else {
            startFrame = chosen.from || 0;
            endFrame = startFrame + windowFrames;
          }
          console.log("[AUDIO-TOOL] Using centered window for frames");
        }

        // Enforce max 2 minutes
        const maxFrames = 120 * projectFps;
        if (endFrame - startFrame > maxFrames) {
          endFrame = startFrame + maxFrames;
          console.log("[AUDIO-TOOL] Clamped to max 2 minutes");
        }
        
        console.log("[AUDIO-TOOL] Final analysis range:", { 
          startFrame, 
          endFrame,
          durationSec: (endFrame - startFrame) / projectFps
        });

        // 5) Call audio analysis service
        const { analyzeClipAudioService } = await import("../services/media");

        console.log("[AUDIO-TOOL] Calling analyzeClipAudioService...");
        const result = await analyzeClipAudioService({
          projectId,
          userId,
          source: "asset",
          assetId: chosen.assetId,
          startFrame,
          endFrame,
          fps: projectFps,
        });

        console.log("[AUDIO-TOOL] Analysis complete:", {
          silences: result.silenceGapsFrames.length,
          fillers: result.fillers.length,
          problematic: result.problematicFrames.length,
        });

        // 6) Build response
        const response = {
          status: "success",
          type: "audio",
          analyzedOverlay: {
            id: chosen.id,
            assetId: chosen.assetId,
            name: chosen.name || null,
            type: chosen.type,
          },
          timestamps: {
            start: formatSecondsToHHMMSS(
              framesToSeconds(startFrame, projectFps),
            ),
            end: formatSecondsToHHMMSS(
              framesToSeconds(endFrame, projectFps),
            ),
          },
          startFrame,
          endFrame,
          summary: result.summary,
          silenceGapsFrames: result.silenceGapsFrames,
          fillers: result.fillers,
          problematicFrames: result.problematicFrames,
          message: `Detected ${result.problematicFrames.length} removable audio segments`,
        };
        
        console.log("[AUDIO-TOOL] ========== SUCCESS ==========");
        return JSON.stringify(response);
      } catch (err: any) {
        console.error("[AUDIO-TOOL] ========== ERROR ==========");
        console.error("[AUDIO-TOOL] Error:", err);
        console.error("[AUDIO-TOOL] Stack:", err.stack);
        return JSON.stringify({
          status: "error",
          message: err.message || String(err),
        });
      }
    },
    {
      name: "analyze_clip_audio",
      description: `Analyze audio (max 2 min per clip) for silences, fillers, and problematic segments.
        NEVER ask the user for asset ID or time range. Call with {} or minimal params - tool auto-selects first overlay and uses full duration up to 2 min.
        When user asks to analyze audio/music, call this tool immediately. For multiple overlays, pass analyzeAll: true to analyze each (each up to 2 min).`,
      schema: analyzeClipAudioSchema,
    },
  );

  // ============================================================================
  // analyze_clip_video
  // ============================================================================

  const analyzeClipVideoSchema = z.object({
    // Dynamic prompt support
    target: z
      .string()
      .optional()
      .describe(
        'Natural-language description of which video to analyze (e.g., "the dancing girl", "intro clip", "first minute"). If provided, assetId/startFrame/endFrame are ignored and auto-selected.',
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        'Start time in hh:mm:ss or mm:ss format (e.g., "00:30" for 30 seconds). If provided with endTime, these override startFrame/endFrame.',
      ),
    endTime: z
      .string()
      .optional()
      .describe(
        "End time in hh:mm:ss or mm:ss format. Maximum 2 minutes from startTime.",
      ),
    windowMinutes: z
      .number()
      .optional()
      .default(2)
      .describe(
        "Analysis window in minutes when using target. Default is 2. Will be centered on the overlay or start from its beginning if shorter.",
      ),
    // Manual specification (fallback)
    source: z.enum(["timeline", "asset"]).optional(),
    assetId: z.string().optional(),
    startFrame: z.number().optional(),
    endFrame: z.number().optional(),
    fps: z.number().optional(),
    analyzeAll: z
      .boolean()
      .optional()
      .describe(
        "If true, analyze all video overlays (each up to 2 min). Use when user wants 'all' or multiple clips.",
      ),
  });

  const analyzeClipVideo = tool(
    async (
      rawInput: z.infer<typeof analyzeClipVideoSchema> & { prompt?: string },
    ) => {
      try {
        const input = rawInput;
        const project = await loadProject();
        const projectFps = input.fps || project?.fps || 30;
        const prompt = (input.prompt || input.target || "").trim();

        // 1) parse prompt for time range (seconds). If not found, we will derive from chosen overlay.
        const parsedRange = parsePromptTimeRange(prompt, projectFps, 120); // {startSec,endSec} or null

        // 2) pick video overlay candidates (accept assetId OR src OR timeline overlay)
        const overlays = (project.overlays || []).filter(
          (o: any) => o.type === "video",
        );

        if (overlays.length === 0) {
          return JSON.stringify({
            status: "error",
            message: "No video overlays found in project timeline.",
          });
        }

        // analyzeAll: analyze each video overlay (each up to 2 min)
        if (input.analyzeAll && overlays.length > 1) {
          const results: any[] = [];
          const maxFrames = 120 * projectFps;
          const windowFrames = Math.round(120 * projectFps);
          for (const chosen of overlays) {
            const chosenAny = chosen as any;
            const hasAsset = chosenAny.assetId || (chosenAny.src && /^https?:\/\//i.test(String(chosenAny.src)));
            if (!hasAsset) continue;
            let startFrame: number, endFrame: number;
            const overlayDur = chosen.durationInFrames || 0;
            if (overlayDur > 0) {
              startFrame = Math.max(0, chosen.from + Math.floor(Math.max(0, overlayDur - windowFrames) / 2));
              endFrame = Math.min(chosen.from + overlayDur, startFrame + windowFrames);
            } else {
              startFrame = chosen.from || 0;
              endFrame = startFrame + windowFrames;
            }
            if (endFrame - startFrame > maxFrames) endFrame = startFrame + maxFrames;
            try {
              let assetUrl: string | undefined;
              if (chosenAny.assetId) {
                assetUrl = await (assetResolver as any).resolveAssetUrl(chosenAny.assetId, userId);
              } else if (chosenAny.src && /^https?:\/\//i.test(String(chosenAny.src))) {
                assetUrl = chosenAny.src;
              }
              const sampleParams: any = {
                projectId,
                source: "asset",
                assetId: chosenAny.assetId,
                assetUrl,
                startFrame,
                endFrame,
                fps: projectFps,
                userId,
                targetSampleFps: 1,
                maxDurationSec: 120,
              };
              const sampledPath = await sampleVideoClip(sampleParams);
              const geminiResult = await sendVideoToGemini({ filePath: sampledPath, prompt: "" });
              const vision = {
                sceneChanges: (geminiResult.sceneChanges || []).map((idx: number) => startFrame + idx * projectFps),
                summary: geminiResult.summary || "No summary available",
                theme: geminiResult.theme || "other",
                gestures: geminiResult.gestures || [],
                onScreenText: geminiResult.onScreenText || [],
              };
              results.push({
                overlay: { id: chosen.id, name: chosenAny.name, from: chosen.from, durationInFrames: chosen.durationInFrames },
                timestamps: {
                  start: formatSecondsToHHMMSS(framesToSeconds(startFrame, projectFps)),
                  end: formatSecondsToHHMMSS(framesToSeconds(endFrame, projectFps)),
                },
                vision,
              });
            } catch (e: any) {
              results.push({ overlay: { id: chosen.id, name: chosenAny.name }, error: e.message });
            }
          }
          return JSON.stringify({ status: "success", analyzeAll: true, results });
        }

        // Choose overlay: if prompt mentions a name, try to match; else choose first overlay that overlaps requested range or first overall
        const chooseOverlay = () => {
          if (prompt) {
            const lower = prompt.toLowerCase();
            const match = overlays.find(
              (o: any) =>
                (o.name && o.name.toLowerCase().includes(lower)) ||
                (o.assetId && o.assetId.toLowerCase().includes(lower)) ||
                (o.content &&
                  typeof o.content === "string" &&
                  o.content.toLowerCase().includes(lower)) ||
                (o.src && o.src.toLowerCase().includes(lower)),
            );
            if (match) return match;
          }
          // overlap-based fallback: if parsedRange provided, find overlay that overlaps
          if (parsedRange) {
            const startF = Math.round(parsedRange.startSec * projectFps);
            const endF = Math.round(parsedRange.endSec * projectFps);
            const overlap = overlays.find((o: any) => {
              const oStart = o.from || 0;
              const oEnd = oStart + (o.durationInFrames || 0);
              return !(endF < oStart || startF > oEnd);
            });
            if (overlap) return overlap;
          }
          return overlays[0];
        };

        const chosen: any = chooseOverlay();
        if (!chosen)
          return JSON.stringify({
            status: "error",
            message: "Could not determine overlay to analyze.",
          });

        // 3) determine start/end frames (priority: parsedRange -> overlay centered window -> overlay start)
        let startFrame: number, endFrame: number;
        if (parsedRange) {
          startFrame = Math.round(parsedRange.startSec * projectFps);
          endFrame = Math.round(parsedRange.endSec * projectFps);
        } else {
          // center a 2-minute window (or overlay duration if shorter)
          const windowFrames = Math.round(120 * projectFps);
          const overlayDur = chosen.durationInFrames || 0;
          if (overlayDur > 0) {
            startFrame = Math.max(
              0,
              chosen.from + Math.floor((overlayDur - windowFrames) / 2),
            );
            endFrame = Math.min(
              chosen.from + overlayDur,
              startFrame + windowFrames,
            );
          } else {
            // fallback to beginning of overlay
            startFrame = chosen.from || 0;
            endFrame =
              startFrame +
              Math.min(
                windowFrames,
                Math.max(1, chosen.durationInFrames || windowFrames),
              );
          }
        }

        // enforce max 2 minutes
        const maxFrames = 120 * projectFps;
        if (endFrame - startFrame > maxFrames)
          endFrame = startFrame + maxFrames;

        // 4) decide sampling source: prefer assetId -> assetUrl; else use overlay.src (external) -> ffmpeg; else timeline -> Remotion
        let sampleSource: "asset" | "ffmpegUrl" | "timeline" = "timeline";
        let assetUrl: string | undefined;
        if (chosen.assetId) {
          sampleSource = "asset";
          assetUrl = await assetResolver.resolveAssetUrl(
            chosen.assetId,
            userId,
          );
        } else if (
          chosen.src &&
          typeof chosen.src === "string" &&
          /^https?:\/\//i.test(chosen.src)
        ) {
          sampleSource = "ffmpegUrl";
          assetUrl = chosen.src;
        } else {
          sampleSource = "timeline";
        }

        // 5) sample the clip
        const sampleParams: any = {
          projectId,
          source: sampleSource === "timeline" ? "timeline" : "asset",
          assetId: chosen.assetId,
          assetUrl,
          startFrame,
          endFrame,
          fps: projectFps,
          userId,
          targetSampleFps: 1,
          maxDurationSec: 120,
        };

        const sampledPath = await sampleVideoClip(sampleParams);

        // 6) send to Gemini with PROPER detailed analysis prompt
        const geminiResult = await sendVideoToGemini({
          filePath: sampledPath,
          prompt: '',
        });

        // 7) map 1fps frame indices back to timeline frames
        const vision = {
          sceneChanges: (geminiResult.sceneChanges || []).map(
            (idx: number) => startFrame + idx * projectFps,
          ),
          deadVisualRanges: (geminiResult.deadVisualRanges || []).map(
            ([s, e]: any) => [
              startFrame + s * projectFps,
              startFrame + e * projectFps,
            ],
          ),
          gestures: geminiResult.gestures || [],
          onScreenText: geminiResult.onScreenText || [],
          summary: geminiResult.summary || "No summary available",
          theme: geminiResult.theme || "other",
        };

        return JSON.stringify({
          status: "success",
          analyzedOverlay: {
            id: chosen.id,
            name: chosen.name || null,
            from: chosen.from,
            durationInFrames: chosen.durationInFrames,
          },
          timestamps: {
            start: formatSecondsToHHMMSS(
              framesToSeconds(startFrame, projectFps),
            ),
            end: formatSecondsToHHMMSS(framesToSeconds(endFrame, projectFps)),
          },
          startFrame,
          endFrame,
          vision,
        });
      } catch (err: any) {
        console.error("[analyze_clip_video] error", err);
        return JSON.stringify({
          status: "error",
          message: err.message || String(err),
        });
      }
    },
    {
      name: "analyze_clip_video",
      description: `Analyze video (max 2 min per clip) for scene changes, dead zones, gestures, on-screen text.
        NEVER ask the user for video ID or time range. Call with {} or minimal params - tool auto-selects first overlay and uses full duration up to 2 min.
        When user asks "read video" / "what's happening", call immediately. For multiple overlays, pass analyzeAll: true to analyze each (each up to 2 min).`,
      schema: analyzeClipVideoSchema,
    },
  );

  // ─── Smart Auto Motion Graphics ───────────────────────────────────

  const autoMotionGraphicsSchema = z.object({
    density: z.enum(['minimal', 'moderate', 'heavy']).default('moderate').describe("How many graphics to add: minimal (key moments only), moderate (balanced), heavy (every scene)"),
  });

  const autoMotionGraphics = tool(
    async (rawInput: z.infer<typeof autoMotionGraphicsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();
        const fps = project.fps || 30;
        const canvas = getCanvasDimensions(project);

        // Find video overlays and their corresponding text/narration
        const videoOverlays = project.overlays
          .filter((o: any) => o.type === 'video')
          .sort((a: any, b: any) => a.from - b.from);

        if (videoOverlays.length === 0) {
          return JSON.stringify({ status: 'error', message: 'No video clips found to add motion graphics to' });
        }

        // Find voiceover/caption overlays for narration context
        const voOverlays = project.overlays.filter((o: any) =>
          o.type === 'sound' && (o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_')),
        );
        const captionOverlays = project.overlays.filter((o: any) => o.type === 'caption');

        // Look up storyboard for scene narration text
        const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
        const projectDoc = await db.collection('projects').findOne({ projectId }) as any;
        const storyboardId = projectDoc?.sourceStoryboardId;
        let scenes: any[] = [];
        if (storyboardId) {
          const sb = await db.collection('storyboards').findOne({ storyboardId }) as any;
          if (sb?.scenes) scenes = sb.scenes;
        }

        // Use Gemini to analyze narration and suggest motion graphic placements
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
          return JSON.stringify({ status: 'error', message: 'Gemini API key needed for auto motion graphics' });
        }

        // Build context: scene narrations + durations
        const sceneContext = videoOverlays.map((v: any, i: number) => {
          const scene = scenes[i];
          const narration = scene?.descriptor?.narration || '';
          const startSec = Math.round(v.from / fps * 10) / 10;
          const durSec = Math.round(v.durationInFrames / fps * 10) / 10;
          return `Scene ${i + 1} (${startSec}s-${startSec + durSec}s): "${narration}"`;
        }).join('\n');

        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash' });

        const densityGuide = input.density === 'minimal' ? '1-2 total' : input.density === 'heavy' ? 'one per scene' : '2-3 total';

        const result = await model.generateContent(`You are a video editor adding motion graphics to a ${videoOverlays.length}-scene video.

Scene narrations:
${sceneContext}

Add ${densityGuide} motion graphics. For each, return:
- scene: scene number (1-based)
- offsetSec: seconds into that scene to show (e.g., 1.0)
- durationSec: how long to show (2-4 seconds typical)
- description: what to show (product feature callout, stat, title, etc.)

Rules:
- Match graphics to what's being said in the narration at that moment
- Use clear, simple descriptions (not jargon like "lower third")
- For product ads: highlight features, stats, product name
- For educational: highlight key terms, steps, definitions
- Place graphics 1-2 seconds after the relevant narration starts
- Never place in first 0.5s or last 0.5s of a scene

Return ONLY a JSON array:
[{"scene":1,"offsetSec":2.0,"durationSec":3.0,"description":"Product name: Nova Speaker"}]`);

        const text = result.response.text()?.trim() || '[]';
        let jsonStr = text;
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }

        let placements: any[];
        try {
          placements = JSON.parse(jsonStr);
        } catch {
          return JSON.stringify({ status: 'error', message: 'Failed to parse Gemini motion graphic suggestions' });
        }

        if (!Array.isArray(placements) || placements.length === 0) {
          return JSON.stringify({ status: 'success', data: { added: 0 }, message: 'No motion graphics needed for this video' });
        }

        // Execute each placement
        let added = 0;
        for (const p of placements) {
          const sceneIdx = (p.scene || 1) - 1;
          const videoOv = videoOverlays[sceneIdx] as any;
          if (!videoOv) continue;

          const startFrame = videoOv.from + Math.round((p.offsetSec || 1) * fps);
          const durationFrames = Math.round((p.durationSec || 3) * fps);

          try {
            // Use the existing add_motion_graphic tool
            const mgResult = await addMotionGraphic.invoke({
              start: startFrame,
              duration: durationFrames,
              description: p.description,
            });
            const parsed = JSON.parse(mgResult);
            if (parsed.status === 'success') added++;
          } catch (err: any) {
            console.warn(`[auto_motion_graphics] Failed for scene ${p.scene}: ${err.message}`);
          }
        }

        return JSON.stringify({
          status: 'success',
          data: { added, suggested: placements.length },
          message: `Added ${added} motion graphics (${placements.length} suggested by AI)`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'auto_motion_graphics',
      description: `Automatically analyze the video and add relevant motion graphics.

The AI reads each scene's narration and places graphics that match:
- Product names, features, stats → callout labels
- Key terms, definitions → highlight text
- Step-by-step instructions → numbered list
- Speaker introductions → name labels

User just says: "add graphics to my video" or "enhance with motion graphics"
NO need to specify type, position, or timing — AI handles everything.

Density: minimal (1-2 key moments), moderate (2-3 balanced), heavy (every scene)

Example: auto_motion_graphics({ density: 'moderate' })`,
      schema: autoMotionGraphicsSchema,
    },
  );

  // ─── Transition Tool ──────────────────────────────────────────────

  const addTransitionSchema = z.object({
    afterOverlayId: z.coerce.number().optional().describe("ID of the video overlay AFTER which to insert the transition. Targets ONE specific pair (that clip and its next adjacent clip). Required unless applyToAll=true."),
    type: z.enum([
      'dissolve', 'dip-to-black', 'dip-to-white', 'flash', 'blur-transition',
      'wipe-left', 'wipe-right', 'slide-up', 'slide-down',
      'zoom-punch', 'zoom-out',
      'hard-cut', 'smash-cut', 'match-cut', 'jump-cut', 'cut-on-action',
      'soft-cut', 'crossfade',
    ]).default('dissolve').describe("Transition type. 'crossfade/fade/soft-cut' = dissolve, 'fade to black' = dip-to-black, 'quick/punchy' = zoom-punch, 'smooth' = dissolve"),
    durationMs: z.coerce.number().optional().describe("Transition duration in milliseconds (default varies by type, typically 500ms)"),
    applyToAll: z.boolean().optional().describe("If true, add this transition between ALL adjacent video clips. Required unless afterOverlayId is set."),
  }).refine(
    (val) => val.applyToAll === true || typeof val.afterOverlayId === 'number',
    {
      // ⚠️ Without this refine, callers that pass NEITHER afterOverlayId nor
      // applyToAll fall through to the applyToAll branch at line ~3852 and
      // silently iterate every clip pair — where `applyBetween` deletes any
      // existing transition (including EDL-placed film-burn / dip-to-white /
      // etc) before placing the caller's default dissolve. Witnessed in
      // proj_L7c43ghg7Rt3 when Director passed undeclared clipAId/clipBId
      // params that Zod stripped, leaving the tool with no target. See
      // pipeline_investigations.md 2026-04-19 "add_transition tool's
      // applyToAll fallback silently overwrites EDL-placed transitions".
      // Director-side fix shipped in commit a74ddcba (pass afterOverlayId).
      // This refine is the belt-and-suspenders so future callers can't
      // reintroduce the silent overwrite. Fail loud → Rule 18N.
      message: 'add_transition requires either afterOverlayId (single pair) or applyToAll=true (all pairs). Passing neither is ambiguous and was a silent-overwrite footgun — explicitly choose one.',
    }
  );

  const addTransitionTool = tool(
    async (input: z.infer<typeof addTransitionSchema>) => {
      try {
        const project = await loadProject();
        const fps = project.fps || 30;
        const { calculateTransition, TRANSITIONS } = await import('../data/transition-system');

        const videoOverlays = project.overlays
          .filter((o: any) => o.type === 'video')
          .sort((a: any, b: any) => a.from - b.from);

        if (videoOverlays.length < 2) {
          return JSON.stringify({ status: 'error', message: 'Need at least 2 video clips for transitions' });
        }

        // Map aliases to canonical transition names
        const TRANSITION_ALIASES: Record<string, string> = {
          'soft-cut': 'dissolve',
          'crossfade': 'dissolve',
          'fade': 'dissolve',
          'fade-to-black': 'dip-to-black',
          'fade-to-white': 'dip-to-white',
        };
        const rawType = input.type || 'dissolve';
        const transId = TRANSITION_ALIASES[rawType] || rawType;
        const transDef = TRANSITIONS[transId];
        if (!transDef) {
          return JSON.stringify({ status: 'error', message: `Unknown transition type: ${transId}. Available: ${Object.keys(TRANSITIONS).join(', ')}` });
        }

        const overlapFrames = input.durationMs
          ? Math.round((input.durationMs / 1000) * fps)
          : transDef.defaultDurationFrames;

        let applied = 0;

        const applyBetween = async (outgoing: any, incoming: any) => {
          if (!transDef.hasVisualOverlap) {
            applied++; // Editorial cut — no changes needed, just count it
            return;
          }

          const result = calculateTransition(
            transId,
            { from: outgoing.from, durationInFrames: outgoing.durationInFrames, width: outgoing.width || 1920, height: outgoing.height || 1080 },
            { from: incoming.from, durationInFrames: incoming.durationInFrames },
            overlapFrames,
          );

          if (result) {
            // Validate overlap doesn't exceed clip duration
            if (overlapFrames >= outgoing.durationInFrames || overlapFrames >= incoming.durationInFrames) {
              console.warn(`[add_transition] Overlap ${overlapFrames} exceeds clip duration, reducing`);
              const maxOverlap = Math.min(outgoing.durationInFrames - 1, incoming.durationInFrames - 1, overlapFrames);
              if (maxOverlap < 2) return; // Skip — clips too short for transition
            }

            // Check for existing transition on this boundary — remove if found (idempotent)
            const existingTrans = (project as any).overlays?.find((o: any) =>
              o.type === 'transition' && o.clipAId === outgoing.id && o.clipBId === incoming.id
            );
            if (existingTrans) {
              await projectService.deleteOverlay(userId, projectId, existingTrans.id);
            }

            // Merge keyframe tracks: new tracks replace existing tracks for same property
            const existingOutTracks = (outgoing.keyframeTracks || []).filter(
              (t: any) => !result.outgoingOverlayUpdate.keyframeTracks.some((nt: any) => nt.property === t.property)
            );
            await projectService.updateOverlay(userId, projectId, outgoing.id, {
              durationInFrames: result.outgoingOverlayUpdate.durationInFrames,
              keyframeTracks: [...existingOutTracks, ...result.outgoingOverlayUpdate.keyframeTracks],
            });

            const existingInTracks = (incoming.keyframeTracks || []).filter(
              (t: any) => !result.incomingOverlayUpdate.keyframeTracks.some((nt: any) => nt.property === t.property)
            );
            await projectService.updateOverlay(userId, projectId, incoming.id, {
              from: result.incomingOverlayUpdate.from,
              durationInFrames: result.incomingOverlayUpdate.durationInFrames,
              keyframeTracks: [...existingInTracks, ...result.incomingOverlayUpdate.keyframeTracks],
            });

            // Create visible TRANSITION tile on timeline (DaVinci-style)
            const transFrom = outgoing.from + outgoing.durationInFrames - overlapFrames;
            const transOverlay = {
              id: Date.now() + Math.floor(Math.random() * 100000) + applied,
              type: 'transition',
              transitionStyle: transId,
              clipAId: outgoing.id,
              clipBId: incoming.id,
              easing: 'ease-in-out',
              from: transFrom,
              durationInFrames: overlapFrames,
              row: outgoing.row || ROW.VIDEO, // Inline with video clips (DaVinci-style)
              left: 0, top: 0, width: outgoing.width || 1920, height: outgoing.height || 1080,
              isDragging: false, rotation: 0,
              content: transDef.name || transId,
              styles: { opacity: 1 },
              metadata: { isTransition: true, source: 'tool', transitionType: transId },
            };
            await projectService.addOverlay(userId, projectId, transOverlay as any);

            applied++;
          }
        };

        if (input.applyToAll || !input.afterOverlayId) {
          for (let i = 0; i < videoOverlays.length - 1; i++) {
            await applyBetween(videoOverlays[i], videoOverlays[i + 1]);
          }
        } else {
          const targetIdx = videoOverlays.findIndex((o: any) => o.id === input.afterOverlayId);
          if (targetIdx === -1) {
            return JSON.stringify({ status: 'error', message: `Video overlay ${input.afterOverlayId} not found` });
          }
          if (targetIdx >= videoOverlays.length - 1) {
            return JSON.stringify({ status: 'error', message: 'No next clip to transition into' });
          }
          await applyBetween(videoOverlays[targetIdx], videoOverlays[targetIdx + 1]);
        }

        return JSON.stringify({
          status: 'success',
          data: { transitionsApplied: applied, type: transId, overlapFrames, method: 'clip-overlap' },
          message: `Applied ${applied} ${transDef.name} transition(s) using clip-overlap compositing`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_transition',
      description: `Add real transitions between video clips using clip-overlap compositing.
Transitions modify adjacent clips directly — outgoing clip extends, incoming starts early,
both play simultaneously in the overlap zone with keyframe-driven blending.

Types (use plain language — the tool maps automatically):
BLEND: dissolve (crossfade), dip-to-black (fade to black), dip-to-white (flash white), flash (burst), blur-transition (smooth blur)
WIPE: wipe-left, wipe-right
PUSH: slide-up, slide-down
ZOOM: zoom-punch (impact), zoom-out (pull back)
EDITORIAL: hard-cut (standard), smash-cut (shock), match-cut (visual match), jump-cut (time skip), cut-on-action (motion-timed)

Default to dissolve. For energetic content use zoom-punch. For scene breaks use dip-to-black.

To add between ALL clips: add_transition({ type: 'dissolve', applyToAll: true })
To add after a specific clip: add_transition({ afterOverlayId: 123, type: 'dip-to-black' })

NEVER ask the user which clips — default to applyToAll: true.`,
      schema: addTransitionSchema,
    },
  );

  // ─── AI Pipeline Scene Tools ─────────────────────────────────────
  // These allow the chat AI to regenerate scenes, voiceovers, and videos
  // from the storyboard pipeline directly through conversation.

  const regenerateSceneSchema = z.object({
    sceneIndex: z.coerce.number().describe("The scene index (0-based) to regenerate. If user says 'scene 3', use index 2."),
    feedback: z.string().optional().describe("User's feedback/direction for regeneration, e.g. 'make it darker', 'change the lighting to golden hour'"),
    target: z.enum(['image', 'storyboard', 'video', 'voiceover', 'all']).default('image').describe("What to regenerate: image/storyboard (scene image), video (AI clip), voiceover (narration audio), or all"),
  });

  const regenerateScene = tool(
    async (input: z.infer<typeof regenerateSceneSchema>) => {
      try {
        const project = await loadProject();

        // Storyboard stores projectId on itself (not the other way around).
        // Look up the storyboard that was linked to this Editron project.
        const { getStoryboardByProjectId } = await import('@/lib/pipeline/storyboard-db');
        const storyboard = await getStoryboardByProjectId(projectId, userId);
        let storyboardId = storyboard?.storyboardId
          || (project as any).storyboardId
          || (project as any).sourceStoryboardId;

        // Fallback: if no link found, try to find a storyboard whose scene
        // asset IDs appear in this project's overlays (handles pre-fix projects).
        if (!storyboardId) {
          try {
            const { getDatabase } = await import('@/lib/editron/db/mongodb');
            const db = await getDatabase();
            const overlayAssetIds = ((project as any).overlays || [])
              .map((o: any) => o.assetId)
              .filter(Boolean);
            if (overlayAssetIds.length > 0) {
              const match = await db.collection('storyboards').findOne({
                userId,
                'scenes.imageAssetId': { $in: overlayAssetIds },
              });
              if (match) {
                storyboardId = (match as any).storyboardId;
                // Persist the link so future lookups are fast
                await db.collection('storyboards').updateOne(
                  { storyboardId },
                  { $set: { projectId, updatedAt: new Date() } },
                );
                await db.collection('projects').updateOne(
                  { projectId },
                  { $set: { sourceStoryboardId: storyboardId, updatedAt: new Date() } },
                );
              }
            }
          } catch (linkErr) {
            console.warn('[regenerate_scene] Fallback storyboard lookup failed:', linkErr);
          }
        }

        if (!storyboardId) {
          return JSON.stringify({
            status: "error",
            message: "This project doesn't have a linked storyboard. Scene regeneration requires a storyboard-based project (created via ThinkForge → Export to Editron).",
          });
        }

        // Validate storyboard exists and has the requested scene
        try {
          const { getStoryboard: getSb } = await import('@/lib/pipeline/storyboard-db');
          const sb = await getSb(storyboardId, userId);
          if (!sb) {
            return JSON.stringify({ status: 'error', message: `Storyboard ${storyboardId} not found or unauthorized.` });
          }
          const sceneExists = sb.scenes?.some((s: any) => s.sceneIndex === input.sceneIndex);
          if (!sceneExists) {
            return JSON.stringify({
              status: 'error',
              message: `Scene ${input.sceneIndex} not found in storyboard (has ${sb.scenes?.length || 0} scenes, indices 0-${(sb.scenes?.length || 1) - 1}).`,
            });
          }
        } catch (valErr: any) {
          return JSON.stringify({ status: 'error', message: `Storyboard validation failed: ${valErr.message}` });
        }

        const results: string[] = [];

        // Use deployment-specific URL (VERCEL_URL) to hit the correct preview deployment
        const baseApiUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

        // Regenerate storyboard image ('storyboard' is an alias for 'image')
        if (input.target === 'image' || input.target === 'storyboard' || input.target === 'all') {
          const imgRes = await fetch(`${baseApiUrl}/api/services/pipeline/storyboard/${storyboardId}/scene/${input.sceneIndex}/regenerate-with-context`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              feedback: input.feedback,
              userId, // Passed for internal auth fallback
            }),
          });
          if (imgRes.ok) {
            const data = await imgRes.json();
            results.push(`Storyboard image regenerated (assetId: ${data.imageAssetId || 'updated'})`);
          } else {
            results.push(`Image regeneration failed: ${(await imgRes.text()).substring(0, 100)}`);
          }
        }

        // Regenerate video clip
        if (input.target === 'video' || input.target === 'all') {
          console.log(`[regenerate_scene] Video regen: storyboardId=${storyboardId}, sceneIndex=${input.sceneIndex}, userId=${userId?.substring(0, 15)}..., url=${baseApiUrl.substring(0, 50)}`);
          const vidRes = await fetch(`${baseApiUrl}/api/services/pipeline/storyboard/${storyboardId}/generate-videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sceneIndices: [input.sceneIndex],
              userId, // Passed for internal auth fallback
            }),
          });
          if (vidRes.ok) {
            const data = await vidRes.json().catch(() => ({}));
            // generate-videos is now async (QStash) — returns batchId, not immediate results
            if (data.async && data.batchId) {
              results.push(`Video regeneration started (batch: ${data.batchId}). The new video will appear after processing (~1-3 minutes).`);
            } else if (data.success) {
              results.push(`Video clip regenerated successfully`);
            } else {
              results.push(`Video regeneration failed: ${data.error || 'unknown'}`);
            }
          } else {
            results.push(`Video regeneration failed: ${(await vidRes.text().catch(() => '')).substring(0, 100)}`);
          }
        }

        // Regenerate voiceover
        if (input.target === 'voiceover' || input.target === 'all') {
          const voRes = await fetch(`${baseApiUrl}/api/services/pipeline/storyboard/${storyboardId}/voiceover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sceneIndices: [input.sceneIndex],
            }),
          });
          if (voRes.ok) {
            results.push(`Voiceover regenerated`);
          } else {
            results.push(`Voiceover regeneration failed`);
          }
        }

        return JSON.stringify({
          status: "success",
          sceneIndex: input.sceneIndex,
          target: input.target,
          storyboardId, // Needed by frontend for polling video regen status
          results,
          message: `Scene ${input.sceneIndex} ${input.target} regeneration complete. ${results.join('. ')}`,
          nextAction: "continue",
        });
      } catch (err: any) {
        return JSON.stringify({
          status: "error",
          message: `Scene regeneration failed: ${err.message}`,
        });
      }
    },
    {
      name: "regenerate_scene",
      description: `Regenerate a specific scene's storyboard image, AI video clip, or voiceover narration.
        Use when user says: "regenerate scene 3", "redo the video for scene 1", "change scene 2 to be darker",
        "re-record the voiceover for scene 4", "I don't like scene 5, make it more dramatic".
        The sceneIndex is 0-based (scene 1 = index 0, scene 2 = index 1, etc.).
        Always pass user's feedback as context for better regeneration.`,
      schema: regenerateSceneSchema,
    },
  );

  // --- CUT SECTION (compound tool) ---

  const cutSectionSchema = z.object({
    startFrame: z.coerce.number().describe('Start frame of the section to cut'),
    endFrame: z.coerce.number().describe('End frame of the section to cut'),
  });

  const cutSection = tool(
    async (rawInput: z.infer<typeof cutSectionSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const { startFrame, endFrame } = input;

        if (endFrame <= startFrame) {
          return JSON.stringify({ status: 'error', message: 'endFrame must be greater than startFrame' });
        }

        const cutDuration = endFrame - startFrame;
        const project = await loadProject();
        const overlays = project.overlays || [];
        const summary: string[] = [];
        let deleted = 0;
        let trimmed = 0;
        let shifted = 0;

        for (const overlay of overlays) {
          const oStart = overlay.from || 0;
          const oEnd = oStart + (overlay.durationInFrames || 0);

          if (oStart >= startFrame && oEnd <= endFrame) {
            // Entirely within range: delete it
            // Also delete linked captions/fancy captions if it's a video
            if (overlay.type === 'video') {
              const linkedCaptions = overlays.filter(
                (o: any) =>
                  (o.type === 'caption' || (o.type === 'html-scene' && o.metadata?.sourceType === 'fancy-caption')) &&
                  o.sourceVideoId === overlay.id
              );
              for (const caption of linkedCaptions) {
                await projectService.deleteOverlay(userId, projectId, caption.id);
              }
            }
            await projectService.deleteOverlay(userId, projectId, overlay.id);
            deleted++;
          } else if (oStart < startFrame && oEnd > endFrame) {
            // Spans entire range: trim out the middle (reduce duration by cutDuration)
            const newDuration = (overlay.durationInFrames || 0) - cutDuration;
            await projectService.updateOverlay(userId, projectId, overlay.id, {
              durationInFrames: newDuration,
            });
            trimmed++;
          } else if (oStart < startFrame && oEnd > startFrame && oEnd <= endFrame) {
            // Starts before range, ends within: trim end
            const newDuration = startFrame - oStart;
            await projectService.updateOverlay(userId, projectId, overlay.id, {
              durationInFrames: newDuration,
            });
            trimmed++;
          } else if (oStart >= startFrame && oStart < endFrame && oEnd > endFrame) {
            // Starts within range, ends after: trim start and shift left
            const framesToTrimFromStart = endFrame - oStart;
            const newDuration = (overlay.durationInFrames || 0) - framesToTrimFromStart;
            const newFrom = startFrame; // Will be shifted further below

            const updates: any = {
              from: newFrom,
              durationInFrames: newDuration,
            };

            // For video/sound overlays, update internal start time
            if (overlay.type === 'video') {
              updates.videoStartTime = (overlay.videoStartTime || 0) + framesToTrimFromStart;
            }
            if (overlay.type === 'sound') {
              updates.startFromSound = (overlay.startFromSound || 0) + framesToTrimFromStart;
            }

            await projectService.updateOverlay(userId, projectId, overlay.id, updates);
            trimmed++;
          } else if (oStart >= endFrame) {
            // Entirely after range: shift left by cutDuration
            await projectService.updateOverlay(userId, projectId, overlay.id, {
              from: oStart - cutDuration,
            });
            shifted++;
          }
          // else: entirely before range — no change needed
        }

        await recalculateProjectDuration();

        const fps = project.fps || 30;
        const secondsCut = Math.round((cutDuration / fps) * 10) / 10;
        summary.push(`Cut ${secondsCut}s (frames ${startFrame}-${endFrame})`);
        if (deleted > 0) summary.push(`${deleted} overlay(s) deleted`);
        if (trimmed > 0) summary.push(`${trimmed} overlay(s) trimmed`);
        if (shifted > 0) summary.push(`${shifted} overlay(s) shifted`);

        return JSON.stringify({
          status: 'success',
          deleted,
          trimmed,
          shifted,
          framesCut: cutDuration,
          secondsCut,
          message: summary.join(', '),
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'cut_section',
      description: 'Cut and remove a section of the timeline between two frames. Splits at start, splits at end, removes the middle portion, and closes gaps. Works across all layers and overlay types.',
      schema: cutSectionSchema,
    }
  );

  // --- Auto-Edit from Script ---
  const autoEditFromScriptSchema = z.object({
    script: z.string().describe('The target script text to match footage against'),
    videoOverlayId: z.string().optional().describe('ID of the video overlay to edit. If not provided, uses the first/longest video.'),
  });

  const autoEditFromScriptTool = tool(
    async (rawInput: z.infer<typeof autoEditFromScriptSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const { autoEditFromScript, executeAutoEdit } = await import('../services/auto-edit-service');

        // Step 1: Generate plan
        const plan = await autoEditFromScript(
          projectId,
          userId,
          input.script,
          input.videoOverlayId,
        );

        // Step 2: Determine video overlay ID for execution
        let effectiveVideoOverlayId = input.videoOverlayId;
        if (!effectiveVideoOverlayId) {
          const project = await loadProject();
          const videoOverlays = project.overlays
            .filter((o: any) => o.type === 'video' && o.assetId)
            .sort((a: any, b: any) => b.durationInFrames - a.durationInFrames);
          if (videoOverlays.length === 0) {
            return JSON.stringify({ status: 'error', message: 'No video overlays found in project' });
          }
          effectiveVideoOverlayId = String(videoOverlays[0].id);
        }

        // Step 3: Execute the plan
        const result = await executeAutoEdit(
          projectId,
          userId,
          effectiveVideoOverlayId,
          plan,
        );

        const fps = (await loadProject()).fps || 30;

        return JSON.stringify({
          status: 'success',
          message: result.message,
          clipsCreated: result.clipsCreated,
          totalDurationSeconds: Math.round((result.totalDurationFrames / fps) * 10) / 10,
          coveragePercent: plan.coveragePercent,
          warnings: plan.warnings,
          cuts: plan.cuts.map(c => ({
            scriptSection: c.scriptSection.substring(0, 80),
            score: c.score,
            fillerCount: c.fillerCount,
            durationFrames: c.sourceEndFrame - c.sourceStartFrame,
          })),
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'auto_edit_from_script',
      description: 'Automatically edit raw footage to match a script. Transcribes the video, aligns transcript segments to script sections, selects best takes, and assembles a rough cut.',
      schema: autoEditFromScriptSchema,
    }
  );

  // --- STYLE TRANSFER TOOLS ---

  const extractStyleSchema = z.object({
    videoOverlayId: z.string().optional().describe('ID of a video overlay in the current project to analyze. If not provided, analyzes the first video overlay.'),
    videoUrl: z.string().optional().describe('Direct URL to a video file for style extraction. Use this for uploaded reference videos.'),
    sourceName: z.string().optional().describe('Name for this style profile (e.g., "Apple ad style", "MrBeast format")'),
  });

  const extractStyleTool = tool(
    async (rawInput: z.infer<typeof extractStyleSchema>) => {
      try {
        const input = coerceInput(rawInput);

        // If no videoOverlayId or videoUrl, use first video in project
        let { videoOverlayId, videoUrl, sourceName } = input;
        if (!videoOverlayId && !videoUrl) {
          const project = await loadProject();
          const firstVideo = project.overlays.find((o: any) => o.type === 'video');
          if (firstVideo) {
            videoOverlayId = String(firstVideo.id);
          } else {
            return JSON.stringify({ status: 'error', message: 'No video found to extract style from. Upload a reference video or add one to the project.' });
          }
        }

        const dna = await extractEditDNA({
          videoOverlayId: videoOverlayId ? String(videoOverlayId) : undefined,
          videoUrl: videoUrl || undefined,
          sourceName: sourceName || undefined,
          userId,
          projectId,
        });

        return JSON.stringify({
          status: 'success',
          profileId: dna.profileId,
          sourceName: dna.sourceName,
          cutRhythm: dna.cutRhythm,
          transitions: dna.transitions,
          colorGrade: dna.colorGrade,
          textStyle: dna.textStyle,
          musicStyle: dna.musicStyle,
          pacing: dna.pacing,
          graphicsDensity: dna.graphicsDensity,
          message: `Extracted Edit DNA style profile "${dna.profileId}" from the reference video. ` +
            `Style: ${dna.pacing.overall} pacing, ${dna.cutRhythm.avgCutsPerMinute} cuts/min, ` +
            `${dna.transitions.dominant} transitions, ${dna.colorGrade.temperature} color temperature, ` +
            `${dna.graphicsDensity} graphics density.`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'extract_style',
      description: 'Extract the editing style ("Edit DNA") from a reference video. Analyzes cut rhythm, transitions, color grade, text style, music, and pacing. Returns a style profile ID that can be applied to the current project with apply_style.',
      schema: extractStyleSchema,
    },
  );

  const applyStyleSchema = z.object({
    profileId: z.string().describe('ID of the style profile to apply (returned from extract_style)'),
  });

  const applyStyleTool = tool(
    async (rawInput: z.infer<typeof applyStyleSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const { profileId: styleProfileId } = input;

        const dna = await loadProfile(userId, String(styleProfileId));
        if (!dna) {
          return JSON.stringify({
            status: 'error',
            message: `Style profile '${styleProfileId}' not found. Use extract_style first to create a profile.`,
          });
        }

        const plan = await applyEditDNA(projectId, userId, dna);

        return JSON.stringify({
          status: 'success',
          summary: plan.summary,
          actions: plan.actions.map((a) => ({
            type: a.type,
            description: a.description,
            aiChatPrompt: a.aiChatPrompt,
          })),
          message: `Generated style application plan with ${plan.actions.length} action(s). ` +
            `${plan.summary} ` +
            `I'll now execute these actions to match the "${dna.sourceName}" editing style.`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'apply_style',
      description: 'Apply a previously extracted Edit DNA style profile to the current project. Returns a plan of actions that map the reference style to Editron operations (cut rhythm, color grade, text style, music, graphics).',
      schema: applyStyleSchema,
    },
  );

  // ── ADD MOTION GRAPHIC (template-based) ──
  const addMotionGraphicSchema = z.object({
    start: z.coerce.number().describe("Start frame number (integer, 0-based). At 30fps: 1 second = 30 frames."),
    duration: z.coerce.number().optional().describe("Duration in frames. If omitted, uses the template's default duration."),
    description: z.string().describe("Natural language description of the motion graphic (e.g., 'lower third for John Smith, CEO', 'show revenue $50K with counter animation', 'step-by-step list: sign up, choose plan, start building')"),
    row: z.coerce.number().optional().describe("Force specific row. If omitted, auto-placed."),
    x: z.coerce.number().optional().describe("Center X position in pixels"),
    y: z.coerce.number().optional().describe("Center Y position in pixels"),
    width: z.coerce.number().optional().describe("Width in pixels (default: canvas width)"),
    height: z.coerce.number().optional().describe("Height in pixels (default: canvas height)"),
  });

  const addMotionGraphic = tool(
    async (rawInput: z.infer<typeof addMotionGraphicSchema>) => {
      try {
        const input = coerceInput(rawInput);
        if (isNaN(input.start)) {
          return JSON.stringify({ status: 'error', message: `Invalid start frame: ${rawInput.start}` });
        }

        const project = await loadProject();
        const canvas = getCanvasDimensions(project);

        // Search templates (Tier 1: MongoDB curated library)
        const match = await findBestTemplate(input.description);

        let filledHtml: string;

        if (match && match.score >= 0.15) {
          // Template found — fill slots with AI
          console.log(`[MOTION-GRAPHIC] Matched template: "${match.template.name}" (score: ${match.score.toFixed(2)})`);
          filledHtml = await fillTemplateSlots(match.template, input.description);
        } else {
          // No template match — search LottieFiles for an animated graphic
          console.log(`[MOTION-GRAPHIC] No template match for "${input.description.substring(0, 60)}", searching LottieFiles...`);

          // Extract search keywords from description
          // Map the description to CATEGORY-based search terms for LottieFiles.
          // Raw description text ("Product name: Nova Speaker") won't find animations.
          // We need to search for the TYPE of graphic (logo reveal, text animation, etc.)
          const desc = (input.description || '').toLowerCase();
          const categoryKeywords: Record<string, string> = {
            'logo': 'logo reveal animation',
            'brand': 'brand reveal animation',
            'stat': 'number counter animation',
            'counter': 'number counter',
            'price': 'price tag animation',
            'feature': 'feature highlight animation',
            'title': 'title text animation',
            'name': 'text reveal animation',
            'callout': 'callout bubble animation',
            'check': 'checkmark animation',
            'star': 'star rating animation',
            'subscribe': 'subscribe button animation',
            'like': 'like heart animation',
            'arrow': 'arrow pointer animation',
            'graph': 'graph chart animation',
            'growth': 'growth chart animation',
            'step': 'step number animation',
            'timer': 'timer countdown animation',
            'location': 'location pin animation',
            'phone': 'phone notification animation',
            'social': 'social media animation',
          };

          let searchQuery = (input as any).category || 'text animation';
          for (const [keyword, query] of Object.entries(categoryKeywords)) {
            if (desc.includes(keyword)) {
              searchQuery = query;
              break;
            }
          }

          let lottieUrl: string | null = null;
          let lottieTitle: string = '';
          try {
            const baseUrl = process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
            const searchRes = await fetch(`${baseUrl}/api/services/editron/lottie/search?q=${encodeURIComponent(searchQuery)}&limit=5`);
            const searchData = await searchRes.json().catch(() => ({}));
            if (searchData.results?.length > 0) {
              lottieUrl = searchData.results[0].lottieUrl;
              lottieTitle = searchData.results[0].title;
              console.log(`[MOTION-GRAPHIC] Found Lottie: "${lottieTitle}" for query "${searchQuery}"`);
            } else {
              console.log(`[MOTION-GRAPHIC] No Lottie results for "${searchQuery}", trying generic`);
              // Try generic search
              const genericRes = await fetch(`${baseUrl}/api/services/editron/lottie/search?q=text+animation&limit=3`);
              const genericData = await genericRes.json().catch(() => ({}));
              if (genericData.results?.length > 0) {
                lottieUrl = genericData.results[0].lottieUrl;
                lottieTitle = genericData.results[0].title;
              }
            }
          } catch (e: any) {
            console.warn(`[MOTION-GRAPHIC] LottieFiles search failed: ${e.message}`);
          }

          if (lottieUrl) {
            // Embed Lottie animation as HTML overlay
            filledHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:transparent;">
  <dotlottie-player src="${lottieUrl}" background="transparent" speed="1" style="width:80%;height:80%;" loop autoplay></dotlottie-player>
  <script src="https://unpkg.com/@dotlottie/player-component@2/dist/dotlottie-player.mjs" type="module"></script>
</div>`;
          } else {
            // Professional CSS motion graphic — glass morphism lower-third style.
            // NOT a black box. Transparent background with subtle blur and accent line.
            console.log(`[MOTION-GRAPHIC] No Lottie found, creating professional CSS overlay`);
            const text = input.description.substring(0, 60);
            filledHtml = `<div style="position:absolute;bottom:12%;left:5%;right:5%;display:flex;align-items:center;gap:12px;padding:16px 24px;background:rgba(255,255,255,0.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);border-radius:12px;animation:slideUp 0.5s ease-out;">
  <div style="width:4px;height:36px;background:linear-gradient(180deg,#60a5fa,#3b82f6);border-radius:2px;flex-shrink:0;"></div>
  <p style="color:white;font-size:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-weight:600;margin:0;line-height:1.3;text-shadow:0 1px 4px rgba(0,0,0,0.3);">${text}</p>
</div>
<style>@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}</style>`;
          }
        }

        const id = Date.now() + Math.floor(Math.random() * 10000);
        const overlayWidth = input.width ?? canvas.width;
        const overlayHeight = input.height ?? canvas.height;
        const duration = input.duration || match?.template?.defaultDuration || 90; // 3s at 30fps

        const cleanHtml = sanitizeHtml(filledHtml);
        const wrappedHtml = createSandboxedWrapper({
          html: cleanHtml,
          width: overlayWidth,
          height: overlayHeight,
          backgroundColor: 'transparent',
          autoFit: true,
        });

        const styleMetadata = extractStyleMetadata(cleanHtml);
        const metadata: HtmlGenerationMetadata = {
          ...styleMetadata,
          generatedAt: new Date(),
          sourceType: 'scene',
        };

        const existingOverlays = toExistingOverlays(project.overlays || []);
        const assignedRow = input.row ?? findBestRow('html-scene' as any, { from: input.start, duration }, existingOverlays);

        const newOverlay = {
          id,
          type: 'html-scene',
          from: input.start,
          durationInFrames: duration,
          content: wrappedHtml,
          prompt: input.description,
          metadata,
          row: assignedRow,
          left: input.x !== undefined ? (input.x - overlayWidth / 2) : 0,
          top: input.y !== undefined ? (input.y - overlayHeight / 2) : 0,
          width: overlayWidth,
          height: overlayHeight,
          rotation: 0,
          isDragging: false,
          styles: { animation: { enter: "fadeIn", exit: "fadeOut", duration: 15 } },
        };

        await projectService.addOverlay(userId, projectId, newOverlay as any);

        return successEnvelope({
          id,
          templateUsed: match!.template.templateId,
          templateName: match!.template.name,
          score: Math.round(match!.score * 100) / 100,
          metadata: { fonts: metadata.fonts, colors: metadata.colors.slice(0, 3) },
          message: `Added motion graphic "${match!.template.name}" for "${input.description}". Duration: ${duration} frames. (Code hidden from chat log)`,
        });
      } catch (e: any) {
        console.error('[MOTION-GRAPHIC] Error:', e);
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_motion_graphic',
      description: 'Add a motion graphic from the curated template library. FAST (~200ms). Use for: lower thirds, callouts, stat counters, title cards, progress bars, subscribe buttons, checklists, comparisons, quotes, notifications, step lists, timelines, social proof. Falls back to error if no template matches — use generate_html_scene for custom/unique animations.',
      schema: addMotionGraphicSchema,
    },
  );

  // ─── Beat Sync Tool ───────────────────────────────────────────────
  const syncCutsToBeatsSchema = z.object({
    audioOverlayId: z.coerce.number().optional().describe(
      'ID of the sound overlay to use for beat detection. If omitted, uses the first sound overlay.'
    ),
    videoOverlayId: z.coerce.number().optional().describe(
      'ID of the video overlay to cut. If omitted, cuts the longest video overlay.'
    ),
    beatFilter: z.enum(['all', 'downbeats', 'strong']).optional().default('downbeats').describe(
      'Which beats to use as cut points: all beats, only downbeats (default), or only strong beats'
    ),
    strengthThreshold: z.coerce.number().optional().default(0.6).describe(
      'Minimum beat strength (0-1) when beatFilter is strong'
    ),
    includeEnergyPeaks: z.coerce.boolean().optional().default(false).describe(
      'Also add cuts at energy peak moments (drops, impacts)'
    ),
    maxCuts: z.coerce.number().optional().default(50).describe(
      'Maximum number of cuts to create'
    ),
    downbeatTransition: z.enum(['zoom_punch', 'hard_cut', 'fade', 'none']).optional().default('hard_cut').describe(
      'Transition style to apply at downbeat cuts'
    ),
    regularBeatTransition: z.enum(['hard_cut', 'fade', 'none']).optional().default('hard_cut').describe(
      'Transition style to apply at regular beat cuts'
    ),
  });

  const syncCutsToBeats = tool(
    async (rawInput: z.infer<typeof syncCutsToBeatsSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();

        // Find audio overlay
        let audioOverlay: any;
        if (input.audioOverlayId) {
          audioOverlay = project.overlays.find((o: any) => o.id === input.audioOverlayId);
        } else {
          audioOverlay = project.overlays.find((o: any) => o.type === 'sound' && o.assetId);
        }
        if (!audioOverlay?.assetId) {
          return JSON.stringify({ status: 'error', message: 'No audio overlay with an asset found. Add a music track first.' });
        }

        // Find video overlay
        let videoOverlay: any;
        if (input.videoOverlayId) {
          videoOverlay = project.overlays.find((o: any) => o.id === input.videoOverlayId);
        } else {
          // Find longest video overlay
          const videos = project.overlays
            .filter((o: any) => o.type === 'video' && o.assetId)
            .sort((a: any, b: any) => (b.durationInFrames || 0) - (a.durationInFrames || 0));
          videoOverlay = videos[0];
        }
        if (!videoOverlay) {
          return JSON.stringify({ status: 'error', message: 'No video overlay found to cut.' });
        }

        // Call beat analysis API route — use VERCEL_URL for internal calls
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

        const analysisRes = await fetch(`${baseUrl}/api/services/editron/audio/analyze-beats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: audioOverlay.assetId, userId }),
        });

        if (!analysisRes.ok) {
          const err = await analysisRes.json().catch(() => ({}));
          return JSON.stringify({ status: 'error', message: `Beat analysis failed: ${err.error || analysisRes.status}` });
        }

        const { analysis } = await analysisRes.json();
        if (!analysis?.beats?.length) {
          return JSON.stringify({ status: 'error', message: 'No beats detected in the audio track.' });
        }

        // Calculate audio start offset on timeline (in ms)
        const fps = project.fps || 30;
        const audioStartOffsetMs = (audioOverlay.from / fps) * 1000;

        // Filter beats based on user preferences
        let cutBeats = analysis.beats.filter((b: any) => {
          if (input.beatFilter === 'downbeats') return b.isDownbeat;
          if (input.beatFilter === 'strong') return b.strength >= (input.strengthThreshold || 0.6);
          return true; // 'all'
        });

        // Add energy peaks if requested
        if (input.includeEnergyPeaks && analysis.energyPeaks?.length) {
          for (const peak of analysis.energyPeaks) {
            // Only add if not already near a cut beat
            const nearExisting = cutBeats.some((b: any) => Math.abs(b.timeMs - peak.timeMs) < 50);
            if (!nearExisting) {
              cutBeats.push({ timeMs: peak.timeMs, strength: peak.magnitude, isDownbeat: false });
            }
          }
        }

        // Apply maxCuts distribution: downbeats first, then strong, then evenly spaced
        if (cutBeats.length > (input.maxCuts || 50)) {
          const maxCuts = input.maxCuts || 50;
          const downbeats = cutBeats.filter((b: any) => b.isDownbeat);
          const strong = cutBeats
            .filter((b: any) => !b.isDownbeat && b.strength >= 0.6)
            .sort((a: any, b: any) => b.strength - a.strength);
          const regular = cutBeats.filter(
            (b: any) => !b.isDownbeat && b.strength < 0.6,
          );

          const selected: any[] = [];
          // 1. Always include downbeats
          selected.push(...downbeats.slice(0, maxCuts));
          // 2. Then strong beats
          if (selected.length < maxCuts) {
            selected.push(...strong.slice(0, maxCuts - selected.length));
          }
          // 3. Fill with regular beats evenly spaced
          if (selected.length < maxCuts && regular.length > 0) {
            const remaining = maxCuts - selected.length;
            const step = Math.max(1, Math.floor(regular.length / remaining));
            for (let i = 0; i < regular.length && selected.length < maxCuts; i += step) {
              selected.push(regular[i]);
            }
          }
          cutBeats = selected;
        }

        // Convert beat timestamps to timeline frames
        const cutFrames = cutBeats
          .map((b: any) => ({
            frame: Math.round(((b.timeMs + audioStartOffsetMs) / 1000) * fps),
            isDownbeat: b.isDownbeat,
          }))
          .filter((c: any) => {
            // Only cut within the video overlay's range
            return c.frame > videoOverlay.from && c.frame < videoOverlay.from + videoOverlay.durationInFrames;
          })
          .sort((a: any, b: any) => b.frame - a.frame); // Sort descending (split from end to preserve frame positions)

        if (cutFrames.length === 0) {
          return JSON.stringify({
            status: 'success',
            message: `Detected ${analysis.bpm} BPM but no beat positions fall within the video overlay range.`,
            bpm: analysis.bpm,
            cutsCreated: 0,
          });
        }

        // Execute splits from end to start
        let currentOverlayId = videoOverlay.id;
        let cutsCreated = 0;

        for (const cut of cutFrames) {
          // Reload project to get current overlay state after each split
          const currentProject = await loadProject();
          const currentOverlay = currentProject.overlays.find((o: any) => {
            // Find the overlay that contains this frame
            return o.type === 'video' && o.from <= cut.frame && (o.from + o.durationInFrames) > cut.frame;
          });

          if (!currentOverlay) continue;

          const overlayEnd = currentOverlay.from + currentOverlay.durationInFrames;
          if (cut.frame <= currentOverlay.from || cut.frame >= overlayEnd) continue;

          const firstDuration = cut.frame - currentOverlay.from;
          const secondDuration = overlayEnd - cut.frame;

          // Update original (first part)
          await projectService.updateOverlay(userId, projectId, currentOverlay.id, {
            durationInFrames: firstDuration,
          });

          // Create second part
          const newId = Date.now() + Math.floor(Math.random() * 10000) + cutsCreated;
          const secondOverlay = {
            ...currentOverlay,
            id: newId,
            from: cut.frame,
            durationInFrames: secondDuration,
            videoStartTime: ((currentOverlay as any).videoStartTime || 0) + firstDuration,
          };

          await projectService.addOverlay(userId, projectId, secondOverlay as any);
          cutsCreated++;
        }

        await recalculateProjectDuration();

        return JSON.stringify({
          status: 'success',
          message: `Synced ${cutsCreated} cuts to ${input.beatFilter} at ${analysis.bpm} BPM (confidence: ${(analysis.bpmConfidence * 100).toFixed(0)}%)`,
          bpm: analysis.bpm,
          bpmConfidence: analysis.bpmConfidence,
          cutsCreated,
          totalBeats: analysis.beats.length,
          beatFilter: input.beatFilter,
        });
      } catch (err: any) {
        return JSON.stringify({ status: 'error', message: err.message || 'Beat sync failed' });
      }
    },
    {
      name: 'sync_cuts_to_beats',
      description: 'Detect beats in an audio/music track and automatically split video clips at beat positions for music-synced editing. Supports filtering by downbeats only (default), strong beats, or all beats. Can apply transition styles at cut points. Use this when the user wants to sync cuts to music, create beat-matched edits, or make rhythm-driven video cuts.',
      schema: syncCutsToBeatsSchema,
    },
  );

  // ─── Set Keyframes Tool ────────────────────────────────────────
  const setKeyframesSchema = z.object({
    overlayId: z.coerce.number().describe("The overlay ID to add keyframes to"),
    property: z.enum(['x', 'y', 'scale', 'opacity', 'rotation', 'speed']).describe("Which property to animate. x/y = pixel position, scale = size multiplier, opacity = 0-1, rotation = degrees, speed = playback rate"),
    keyframes: z.array(z.object({
      frame: z.number().describe("Local frame within the overlay (0 = overlay start)"),
      value: z.number().describe("Value at this frame"),
      easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']).default('ease-in-out'),
    })).min(2).describe("At least 2 keyframes required (start and end values)"),
  });

  const setKeyframes = tool(
    async (input: z.infer<typeof setKeyframesSchema>) => {
      try {
        const project = await loadProject();
        const overlays = (project as any).overlays || [];
        const overlay = overlays.find((o: any) => o.id === input.overlayId);

        if (!overlay) {
          return errorEnvelope(`Overlay ${input.overlayId} not found`);
        }

        // Initialize keyframeTracks if not present
        if (!overlay.keyframeTracks) overlay.keyframeTracks = [];

        // If speed property, also set speedCurve for video overlays
        if (input.property === 'speed' && overlay.type === 'video') {
          (overlay as any).speedCurve = input.keyframes;
        }

        // Remove existing track for this property (replace, don't append)
        overlay.keyframeTracks = overlay.keyframeTracks.filter(
          (t: any) => t.property !== input.property,
        );

        // Add new track
        overlay.keyframeTracks.push({
          property: input.property,
          keyframes: input.keyframes,
        });

        await projectService.updateOverlay(userId, projectId, overlay.id, {
          keyframeTracks: overlay.keyframeTracks,
        } as any);

        return successEnvelope({
          overlayId: input.overlayId,
          property: input.property,
          keyframeCount: input.keyframes.length,
          message: `Set ${input.keyframes.length} keyframes for ${input.property} on overlay ${input.overlayId}`,
        });
      } catch (err: any) {
        return errorEnvelope(err.message);
      }
    },
    {
      name: 'set_keyframes',
      description: 'Add animation keyframes to an overlay. Use for: zoom effects (scale), position animation (x/y), fade in/out (opacity), rotation, or speed ramping (speed). Requires at least 2 keyframes. Examples: "zoom in" = scale 1.0→1.3, "fade out" = opacity 1.0→0.0, "slow motion" = speed 1.0→0.3→1.0.',
      schema: setKeyframesSchema,
    },
  );

  // ─── Regenerate BGM Tool ──────────────────────────────────────
  const regenerateBGMSchema = z.object({
    mood: z.string().describe("The mood/style for the new music (e.g., 'heroic', 'calm ambient', 'energetic electronic', 'cinematic orchestral')"),
    prompt: z.string().optional().describe("Optional detailed music prompt. If not provided, generated from mood."),
  });

  const regenerateBGM = tool(
    async (input: z.infer<typeof regenerateBGMSchema>) => {
      try {
        const project = await loadProject();
        const overlays = (project as any).overlays || [];
        const fps = (project as any).fps || 30;
        const totalFrames = (project as any).durationInFrames || overlays.reduce((max: number, o: any) => Math.max(max, (o.from || 0) + (o.durationInFrames || 0)), 0);
        const totalDurationSec = Math.round(totalFrames / fps);

        // Remove existing BGM (row 1 sound overlays)
        const bgmOverlays = overlays.filter((o: any) => o.type === 'sound' && o.row === ROW.BGM);
        for (const bgm of bgmOverlays) {
          await projectService.deleteOverlay(userId, projectId, bgm.id);
        }

        // Generate new BGM
        const { generateBackgroundMusic } = await import('@/lib/pipeline/bgm-service');
        const musicPrompt = input.prompt || `${input.mood}, instrumental only, no vocals, background music for video`;
        const bgm = await generateBackgroundMusic(musicPrompt, userId, totalDurationSec);

        // Add new BGM overlay
        const newBgmOverlay = {
          id: Date.now() + Math.floor(Math.random() * 100000),
          type: 'sound',
          from: 0,
          durationInFrames: totalFrames,
          row: ROW.BGM, // Was 5 (TRANSITIONS row) — BGM must be on row 1
          left: 0, top: 0, width: 0, height: 0,
          isDragging: false, rotation: 0,
          content: bgm.audioUrl,
          src: bgm.audioUrl,
          assetId: bgm.audioAssetId,
          styles: {
            volume: 0.75, opacity: 1,
            duckingConfig: { enabled: true, duckLevel: 0.20, rampDownMs: 300, rampUpMs: 600, lookAheadMs: 200 },
          },
        };
        await projectService.addOverlay(userId, projectId, newBgmOverlay as any);

        // Register asset
        const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: bgm.audioAssetId },
          { $setOnInsert: { assetId: bgm.audioAssetId, userId, type: 'audio', filename: `${bgm.audioAssetId}.mp3`, source: 'user-upload', gcsPath: bgm.gcsPath, cachedUrl: bgm.audioUrl, urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), size: 0, uploadedAt: new Date() } },
          { upsert: true },
        );

        return JSON.stringify({
          status: 'success',
          data: { assetId: bgm.audioAssetId, mood: input.mood, durationSec: totalDurationSec, removed: bgmOverlays.length },
          message: `Generated new ${input.mood} background music (${totalDurationSec}s). ${bgmOverlays.length > 0 ? 'Replaced existing BGM.' : 'Added BGM.'}`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'regenerate_bgm',
      description: `Regenerate background music with a new mood/style. Removes existing BGM and generates fresh music using CassetteAI.
Examples:
- regenerate_bgm({ mood: "heroic cinematic" })
- regenerate_bgm({ mood: "calm ambient piano" })
- regenerate_bgm({ mood: "energetic electronic", prompt: "Driving synth beat, 140 BPM, future bass style" })`,
      schema: regenerateBGMSchema,
    },
  );

  // ─── Replace SFX Tool ──────────────────────────────────────────
  const replaceSFXSchema = z.object({
    overlayId: z.coerce.number().optional().describe("ID of the SFX overlay to replace. If not provided, replaces the selected overlay."),
    query: z.string().describe("Search query for the new SFX (e.g., 'whoosh', 'impact hit', 'crowd cheer', 'car engine')"),
  });

  const replaceSFX = tool(
    async (input: z.infer<typeof replaceSFXSchema>) => {
      try {
        const project = await loadProject();
        const overlays = (project as any).overlays || [];

        // Find the target SFX overlay
        const targetId = input.overlayId || (project as any).selectedOverlayId;
        const sfxOverlay = overlays.find((o: any) => o.id === targetId && o.type === 'sound');
        if (!sfxOverlay) {
          return JSON.stringify({ status: 'error', message: `SFX overlay ${targetId || 'selected'} not found. Please select or specify the SFX overlay ID.` });
        }

        // Search Freesound for replacement
        const searchRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/api/services/editron/sfx-library/search?q=${encodeURIComponent(input.query)}&limit=1`);
        const searchData = await searchRes.json().catch(() => ({ results: [] }));

        if (!searchData.results || searchData.results.length === 0) {
          return JSON.stringify({ status: 'error', message: `No SFX found for "${input.query}". Try different keywords.` });
        }

        const newSfx = searchData.results[0];

        // Update the overlay with new audio URL
        await projectService.updateOverlay(userId, projectId, sfxOverlay.id, {
          content: newSfx.url,
          src: newSfx.url,
        } as any);

        return JSON.stringify({
          status: 'success',
          data: { overlayId: sfxOverlay.id, title: newSfx.title, duration: newSfx.duration, source: newSfx.source },
          message: `Replaced SFX with "${newSfx.title}" (${newSfx.duration}s from ${newSfx.source})`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'replace_sfx',
      description: `Replace a sound effect with a new one from the Freesound library. Search by keyword, automatically replaces the specified or selected SFX overlay.
Examples:
- replace_sfx({ query: "crowd cheer" })
- replace_sfx({ overlayId: 123456, query: "car engine startup" })
- replace_sfx({ query: "cinematic whoosh impact" })`,
      schema: replaceSFXSchema,
    },
  );

  // ─── Add SFX Tool (AI generation + library search + add to timeline) ─
  const addSFXSchema = z.object({
    query: z.string().describe("Description of the sound effect (e.g., 'coffee slurping', 'door slam', 'crowd cheer', 'typing keyboard')"),
    sceneIndex: z.coerce.number().optional().describe("0-based scene index to add SFX to. If provided, the tool will use the scene's video for context-aware audio generation via mirelo."),
    startFrame: z.coerce.number().optional().describe("Frame to place the SFX at. Defaults to start of the target scene or frame 0."),
    durationSeconds: z.coerce.number().optional().describe("Max duration in seconds. Defaults to scene duration or 5s."),
  });

  const addSFX = tool(
    async (input: z.infer<typeof addSFXSchema>) => {
      try {
        if (!userId) {
          return JSON.stringify({ status: 'error', message: 'Authentication required for SFX upload' });
        }

        const { uploadMedia } = await import('@/lib/editron/services/upload-service');
        const { nanoid } = await import('nanoid');
        const assetId = `sfx_${nanoid(12)}`;
        let audioUrl: string | null = null;
        let gcsPath: string | null = null;
        let sfxTitle = input.query;
        let sfxSource = 'unknown';

        // Resolve scene video URL and duration if sceneIndex provided
        const project = await loadProject();
        const fps = (project as any).fps || 30;
        const videoOverlays = ((project as any).overlays || [])
          .filter((o: any) => o.type === 'video')
          .sort((a: any, b: any) => a.from - b.from);

        let targetSceneVideo: any = null;
        let sceneDuration = input.durationSeconds || 5;
        let sceneStartFrame = input.startFrame ?? 0;

        if (input.sceneIndex !== undefined && input.sceneIndex < videoOverlays.length) {
          targetSceneVideo = videoOverlays[input.sceneIndex];
          sceneDuration = input.durationSeconds || (targetSceneVideo.durationInFrames / fps);
          sceneStartFrame = input.startFrame ?? targetSceneVideo.from;
        } else if (input.sceneIndex === undefined) {
          // No scene specified — try to find last scene (common: "add sfx to last scene")
          // The LLM should specify sceneIndex, but if not, default to frame 0
        }
        const durationSec = sceneDuration;
        let sfxDuration = durationSec;

        const { fal } = await import('@fal-ai/client');
        const falKey = process.env.FAL_AI_API_KEY;
        if (falKey) fal.config({ credentials: falKey });

        // ─── Priority 1: Freesound library search (real recorded SFX, free, CC-licensed) ─
        // Best quality: professional recorded sounds. Always try first.
        if (!audioUrl) {
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

          const queries = [input.query];
          if (input.query.includes(' ')) {
            queries.push(...input.query.split(' ').filter(w => w.length > 2));
          }

          for (const q of queries) {
            if (audioUrl) break;
            try {
              const searchRes = await fetch(`${baseUrl}/api/services/editron/sfx-library/search?q=${encodeURIComponent(q)}&limit=3`);
              const searchData = await searchRes.json().catch(() => ({ results: [] }));
              if (searchData.results?.length > 0) {
                const sfx = searchData.results[0];
                let buffer: Buffer | null = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                  try {
                    const audioRes = await fetch(sfx.url);
                    if (audioRes.ok) {
                      buffer = Buffer.from(await audioRes.arrayBuffer());
                      break;
                    }
                  } catch (err) { console.warn('[add_sfx] Freesound fetch attempt:', err); }
                }
                if (buffer && buffer.length >= 100) {
                  const ext = sfx.url.includes('.wav') ? 'wav' : 'mp3';
                  const uploadResult = await uploadMedia(buffer, userId, `${assetId}.${ext}`, `audio/${ext === 'wav' ? 'wav' : 'mpeg'}`, { customAssetId: assetId });
                  if (uploadResult?.signedUrl) {
                    audioUrl = uploadResult.signedUrl;
                    gcsPath = uploadResult.gcsPath;
                    sfxTitle = sfx.title || input.query;
                    sfxDuration = sfx.duration || durationSec;
                    sfxSource = 'freesound';
                    console.log(`[add_sfx] Freesound success: ${assetId} — "${sfxTitle}"`);
                  }
                }
              }
            } catch (fsErr: any) {
              console.warn(`[add_sfx] Freesound search failed for "${q}": ${fsErr.message}`);
            }
          }
        }

        // ─── Priority 2: mirelo video-to-audio (if scene has video) ─
        // Uses the actual video clip + text prompt for context-aware SFX.
        // Good for scene-specific atmosphere but lower quality than recorded SFX.
        if (!audioUrl && falKey && targetSceneVideo) {
          const videoSrc = targetSceneVideo.src || targetSceneVideo.content;
          if (videoSrc) {
            try {
              const mireloDuration = Math.min(Math.max(Math.round(durationSec), 1), 10);
              console.log(`[add_sfx] P1: mirelo video-to-audio for scene ${input.sceneIndex}, prompt="${input.query}" (${mireloDuration}s)`);
              const mireloResult: any = await fal.subscribe('mirelo-ai/sfx-v1.5/video-to-audio', {
                input: {
                  video_url: videoSrc,
                  text_prompt: input.query || undefined,
                  duration: mireloDuration,
                  num_samples: 2,
                },
                logs: true,
                pollInterval: 2000,
              });
              const data = mireloResult?.data || mireloResult;
              const audioArr = data?.audio || data?.audio_files || data?.audios || [];
              if (audioArr.length > 0 && audioArr[0]?.url) {
                const audioRes = await fetch(audioArr[0].url);
                if (audioRes.ok) {
                  const buffer = Buffer.from(await audioRes.arrayBuffer());
                  // Validate audio headers to prevent render crashes
                  const validAudio = buffer.length > 12 && (
                    (buffer[0] === 0x52 && buffer[1] === 0x49) || // WAV
                    (buffer[0] === 0x49 && buffer[1] === 0x44) || // MP3 ID3
                    (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || // MPEG
                    (buffer[0] === 0x4F && buffer[1] === 0x67)    // OGG
                  );
                  if (!validAudio) throw new Error('mirelo returned invalid audio');
                  const uploadResult = await uploadMedia(buffer, userId, `${assetId}.wav`, 'audio/wav', { customAssetId: assetId });
                  if (uploadResult?.signedUrl) {
                    audioUrl = uploadResult.signedUrl;
                    gcsPath = uploadResult.gcsPath;
                    sfxSource = 'mirelo-video-to-audio';
                    sfxDuration = mireloDuration;
                    console.log(`[add_sfx] mirelo success: ${assetId}`);
                  }
                }
              }
            } catch (mireloErr: any) {
              console.warn(`[add_sfx] mirelo failed: ${mireloErr.message}, trying CassetteAI`);
            }
          }
        }

        // ─── Priority 3: CassetteAI text-to-SFX (always available) ─
        // Text-only generation. Works for any query, $0.02/min.
        if (!audioUrl && falKey) {
          try {
            const cassDuration = Math.min(Math.max(Math.round(durationSec), 10), 180);
            console.log(`[add_sfx] P2: CassetteAI gen for: "${input.query}" (${cassDuration}s)`);
            const cassResult: any = await fal.subscribe('cassetteai/music-generator', {
              input: {
                prompt: `${input.query}, sound effect, ambient audio, no vocals, no music`,
                duration: cassDuration,
              },
              logs: true,
              pollInterval: 3000,
            });
            const data = cassResult?.data || cassResult;
            const firstAudio = data?.audio_file?.url || data?.audio?.url || data?.audio?.[0]?.url || data?.output?.url || data?.url;
            if (firstAudio) {
              const audioRes = await fetch(firstAudio);
              if (audioRes.ok) {
                const buffer = Buffer.from(await audioRes.arrayBuffer());
                // Validate audio headers
                const validAudio = buffer.length > 12 && (
                  (buffer[0] === 0x52 && buffer[1] === 0x49) || // WAV
                  (buffer[0] === 0x49 && buffer[1] === 0x44) || // MP3 ID3
                  (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || // MPEG
                  (buffer[0] === 0x4F && buffer[1] === 0x67)    // OGG
                );
                if (!validAudio) throw new Error('CassetteAI returned invalid audio');
                const uploadResult = await uploadMedia(buffer, userId, `${assetId}.mp3`, 'audio/mpeg', { customAssetId: assetId });
                if (uploadResult?.signedUrl) {
                  audioUrl = uploadResult.signedUrl;
                  gcsPath = uploadResult.gcsPath;
                  sfxSource = 'cassetteai';
                  console.log(`[add_sfx] CassetteAI success: ${assetId}`);
                }
              }
            }
          } catch (cassErr: any) {
            console.warn(`[add_sfx] CassetteAI failed: ${cassErr.message}, trying Freesound`);
          }
        }

        // Old Freesound block removed — now runs as Priority 1 above mirelo.

        if (!audioUrl) {
          return JSON.stringify({ status: 'error', message: `Could not find or generate SFX for "${input.query}". Freesound search, mirelo AI, and CassetteAI all failed. Try a different description.` });
        }

        // Register as media asset for URL resolution
        const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId },
          {
            $setOnInsert: {
              assetId, userId, type: 'audio',
              filename: `${assetId}.mp3`, source: sfxSource,
              gcsPath, cachedUrl: audioUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );

        // Place on timeline
        const startFrame = sceneStartFrame;
        const durationFrames = Math.round(sfxDuration * fps);

        const { nanoid: nid } = await import('nanoid');
        const overlayId = Date.now() + parseInt(nid(4), 36);
        await projectService.addOverlay(userId, projectId, {
          id: overlayId,
          type: 'sound',
          from: startFrame,
          durationInFrames: durationFrames,
          row: ROW.MOTION_GRAPHICS,
          left: 0, top: 0, width: 0, height: 0,
          isDragging: false, rotation: 0,
          content: audioUrl,
          src: audioUrl,
          assetId,
          styles: { volume: 0.5, opacity: 1 },
        } as any);

        return JSON.stringify({
          status: 'success',
          data: { overlayId, assetId, title: sfxTitle, duration: sfxDuration, source: sfxSource },
          message: `Added "${sfxTitle}" SFX (${sfxDuration}s) from ${sfxSource} at frame ${startFrame}`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'add_sfx',
      description: `Add a sound effect to the timeline using AI generation.

PRIORITY ORDER:
1. Freesound library search (real recorded SFX, professional quality, CC-licensed)
2. mirelo video-to-audio (if sceneIndex provided — analyzes actual video for context-aware SFX)
3. CassetteAI text-to-audio (AI-generated fallback)
If user mentions a scene, ALWAYS pass sceneIndex — this enables mirelo as a secondary option.

ALWAYS use this tool when the user asks to "add sound effect", "add SFX", "add audio clip", etc.
NEVER use addOverlay for sound effects — it creates fake assets that can't play.
Scene indices are 0-based (scene 1 = 0, scene 2 = 1, last scene = total-1).

Examples:
- add_sfx({ query: "coffee slurping", sceneIndex: 3 }) — uses video from scene 4 for context
- add_sfx({ query: "crowd cheer", sceneIndex: 0, startFrame: 30 })
- add_sfx({ query: "whoosh transition", durationSeconds: 2 })`,
      schema: addSFXSchema,
    },
  );

  // ─── Batch Caption Edit Tool ─────────────────────────────────────
  const batchEditCaptionsSchema = z.object({
    style: z.string().optional().describe("Caption style to apply to ALL captions (e.g., 'tiktok', 'subtitle', 'karaoke', 'kinetic')"),
    fontSize: z.string().optional().describe("Font size for all captions (e.g., '24px', '32px')"),
    color: z.string().optional().describe("Text color for all captions (e.g., '#ffffff', 'yellow')"),
    backgroundColor: z.string().optional().describe("Background color (e.g., 'rgba(0,0,0,0.7)', 'transparent')"),
    position: z.string().optional().describe("Position: 'top', 'center', 'bottom'"),
    fontFamily: z.string().optional().describe("Font family (e.g., 'font-bold', 'font-mono')"),
    fontWeight: z.string().optional().describe("Font weight (e.g., '400', '600', '700', '900')"),
  });

  const batchEditCaptions = tool(
    async (input: z.infer<typeof batchEditCaptionsSchema>) => {
      try {
        const project = await loadProject();
        const captions = (project as any).overlays?.filter((o: any) => o.type === 'caption') || [];

        if (captions.length === 0) {
          return JSON.stringify({ status: 'error', message: 'No captions found in this project. Add captions first.' });
        }

        const updates: Record<string, any> = {};
        if (input.fontSize) updates['styles.fontSize'] = input.fontSize;
        if (input.color) updates['styles.color'] = input.color;
        if (input.backgroundColor) updates['styles.backgroundColor'] = input.backgroundColor;
        if (input.fontFamily) updates['styles.fontFamily'] = input.fontFamily;
        if (input.fontWeight) updates['styles.fontWeight'] = input.fontWeight;

        // Style preset overrides
        if (input.style) updates['template'] = input.style;

        let modified = 0;
        for (const caption of captions) {
          try {
            const styleUpdate: any = { ...caption.styles };
            if (input.fontSize) styleUpdate.fontSize = input.fontSize;
            if (input.color) styleUpdate.color = input.color;
            if (input.backgroundColor) styleUpdate.backgroundColor = input.backgroundColor;
            if (input.fontFamily) styleUpdate.fontFamily = input.fontFamily;
            if (input.fontWeight) styleUpdate.fontWeight = input.fontWeight;

            await projectService.updateOverlay(userId, projectId, caption.id, {
              styles: styleUpdate,
              ...(input.style ? { template: input.style } : {}),
              ...(input.position ? { position: input.position } : {}),
            } as any);
            modified++;
          } catch (err: any) {
            console.warn(`[batch_edit_captions] Failed for caption ${caption.id}: ${err.message}`);
          }
        }

        return JSON.stringify({
          status: 'success',
          data: { modified, total: captions.length },
          message: `Updated ${modified}/${captions.length} captions`,
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'batch_edit_captions',
      description: `Edit ALL captions in the project at once for consistency. Change style, font, color, position, etc. across every caption.

Use this when user says:
- "make all captions match" / "make captions consistent"
- "change all caption styles to kinetic"
- "make captions bigger" / "change caption color"
- "update all captions to match scene 1"

Examples:
- batch_edit_captions({ style: "tiktok", fontSize: "28px" })
- batch_edit_captions({ color: "#ffcc00", fontWeight: "700" })
- batch_edit_captions({ style: "karaoke", backgroundColor: "transparent" })`,
      schema: batchEditCaptionsSchema,
    },
  );

  // ─── Stock Footage Search Tool ────────────────────────────────
  const searchStockFootageSchema = z.object({
    query: z.string().describe("Search query for stock footage (e.g., 'happy family eating', 'city timelapse', 'ocean waves')"),
    type: z.enum(['video', 'image']).optional().default('video').describe("Search for videos or images"),
    minDuration: z.coerce.number().optional().describe("Minimum video duration in seconds"),
    maxDuration: z.coerce.number().optional().describe("Maximum video duration in seconds"),
    limit: z.coerce.number().optional().default(5).describe("Max results to return (1-10)"),
  });

  const searchStockFootage = tool(
    async (input: z.infer<typeof searchStockFootageSchema>) => {
      try {
        if (input.type === 'video') {
          const { searchStockVideos } = await import('@/lib/pipeline/pixabay-service');
          const results = await searchStockVideos(input.query, {
            minDuration: input.minDuration,
            maxDuration: input.maxDuration,
            limit: input.limit,
          });
          if (results.length === 0) {
            return JSON.stringify({ status: 'success', data: { results: [], message: `No stock videos found for "${input.query}". Try different keywords.` } });
          }
          return JSON.stringify({
            status: 'success',
            data: {
              results: results.map(r => ({
                id: r.id,
                videoUrl: r.videoUrl,
                videoUrlHD: r.videoUrlHD,
                duration: r.duration,
                thumbnailUrl: r.thumbnailUrl,
                tags: r.tags.slice(0, 5),
              })),
              message: `Found ${results.length} stock videos. Use add_overlay to place one on the timeline.`,
            },
          });
        } else {
          const { searchStockImages } = await import('@/lib/pipeline/pixabay-service');
          const results = await searchStockImages(input.query, { limit: input.limit });
          if (results.length === 0) {
            return JSON.stringify({ status: 'success', data: { results: [], message: `No stock images found for "${input.query}".` } });
          }
          return JSON.stringify({
            status: 'success',
            data: {
              results: results.map(r => ({
                id: r.id,
                imageUrl: r.imageUrl,
                previewUrl: r.previewUrl,
                width: r.width,
                height: r.height,
                tags: r.tags.slice(0, 5),
              })),
              message: `Found ${results.length} stock images. Use add_overlay to place one on the timeline.`,
            },
          });
        }
      } catch (e: any) {
        console.error('[search_stock_footage] Error:', e);
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'search_stock_footage',
      description: `Search Pixabay for free stock videos or images. Use this when:
- User asks for B-roll footage ("add some city shots", "find ocean footage")
- Rapid-cut montage needs real footage instead of AI generation
- User wants to supplement AI content with stock footage
- Looking for specific footage that AI can't generate well (real people, specific locations)

Results include URLs that can be added to the timeline via add_overlay.
All Pixabay content is free for commercial use.`,
      schema: searchStockFootageSchema,
    },
  );

  // ─── Mode 3: Use Matching Footage ───────────────────────────────
  const useMatchingFootageSchema = z.object({
    sceneIndex: z.coerce.number().describe("Scene index to replace with user footage"),
    assetId: z.string().describe("Asset ID of user footage to use (from media library)"),
  });

  const useMatchingFootage = tool(
    async (rawInput: z.infer<typeof useMatchingFootageSchema>) => {
      try {
        const input = coerceInput(rawInput);
        const project = await loadProject();

        // Find video overlay for this scene.
        // metadata.sceneIndex is set by scene-to-editron.ts on pipeline-generated overlays.
        // Cast needed: base Overlay type doesn't include metadata (it's on the MongoDB doc, not the TS interface).
        const sceneOverlays = project.overlays.filter(
          (o: any) => o.type === 'video' && (o.metadata?.sceneIndex === input.sceneIndex)
        );
        if (sceneOverlays.length === 0) {
          return JSON.stringify({ status: 'error', message: `No video overlay found for scene ${input.sceneIndex}` });
        }

        // Resolve new asset URL
        const newUrl = await assetResolver.resolveAssetUrl(input.assetId, userId);
        if (!newUrl) {
          return JSON.stringify({ status: 'error', message: `Asset ${input.assetId} not found or URL unresolvable` });
        }

        // Swap: update overlay's src + assetId, keep timing/position
        const overlay = sceneOverlays[0];
        await projectService.updateOverlay(userId, projectId, overlay.id, {
          src: newUrl,
          assetId: input.assetId,
          metadata: { ...(overlay as any).metadata, swappedFrom: overlay.assetId, swapSource: 'user_footage' },
        });

        return JSON.stringify({
          status: 'success',
          data: {
            sceneIndex: input.sceneIndex,
            oldAssetId: overlay.assetId,
            newAssetId: input.assetId,
            message: `Scene ${input.sceneIndex} now uses your footage (${input.assetId})`,
          },
        });
      } catch (e: any) {
        return JSON.stringify({ status: 'error', message: e.message });
      }
    },
    {
      name: 'use_matching_footage',
      description: `Replace an AI-generated video in a scene with user's own footage from the media library.
Use when user says "use my video for scene X" or "replace scene X with my footage".
The footage must already be uploaded to the asset library.

Example: use_matching_footage({ sceneIndex: 2, assetId: "a_Xk7pqR2m" })`,
      schema: useMatchingFootageSchema,
    },
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
    cutSection,           // NEW: Compound cut-and-delete
    // visualInspectFrame,  // DISABLED: Decoy tool, not implemented
    addMotionGraphic,     // NEW: Template-based motion graphics (FAST)
    generateHtmlScene,
    generateHtmlSticker,  // NEW: Animated stickers
    // --- Video Auto-Edit Tools ---
    getVideoTranscription,
    analyzeVideoContent,
    addCaptions,
    addFancyCaptions,     // NEW: Kinetic typography captions
    refreshFancyCaptionsAI, // NEW: Refresh/realign fancy captions
    refreshCaptionsAI,    // NEW: Refresh/realign captions
    analyzeClipAudio,     // NEW: Analyze clip audio
    analyzeClipVideo,     // NEW: Analyze clip video
    // --- Script-to-Edit Pipeline ---
    autoEditFromScriptTool, // NEW: Auto-edit raw footage from script
    // --- AI Pipeline Scene Tools ---
    regenerateScene,      // NEW: Regenerate scene image/video/voiceover via chat
    // --- Transition Tools ---
    addTransitionTool,    // NEW: Add transitions between clips
    // --- Smart Motion Graphics ---
    autoMotionGraphics,   // NEW: Auto-analyze and place motion graphics
    // --- Style Transfer Tools ---
    extractStyleTool,     // NEW: Extract Edit DNA from reference video
    applyStyleTool,       // NEW: Apply Edit DNA to project
    // --- Beat Sync Tools ---
    syncCutsToBeats,      // NEW: Music-synced cuts via beat detection
    // --- Keyframe Animation Tools ---
    setKeyframes,         // NEW: Per-property keyframe animation (zoom, fade, speed ramp)
    // --- Audio Regeneration Tools ---
    regenerateBGM,        // NEW: Regenerate background music with new mood/prompt
    replaceSFX,           // NEW: Replace a sound effect with Freesound search
    addSFX,               // NEW: Add SFX from Freesound (search + download + place)
    batchEditCaptions,    // NEW: Edit all captions at once for consistency
    searchStockFootage,   // NEW: Search Pixabay for stock videos/images
    useMatchingFootage,   // Mode 3: Swap AI video with user footage per scene
  ].map((toolInstance) => wrapToolWithEnvelope(toolInstance));

};
