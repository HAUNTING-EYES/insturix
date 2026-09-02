import { z } from 'zod';

import {
  findBestRow,
  getDefaultSize,
  resolveCoordinates,
  type ExistingOverlay,
  OverlayType,
} from '../core/physics';
import {
  constrainChatOverlayPlacement,
  EDITRON_TITLE_SAFE_MARGIN,
  protectChatTextLegibility,
  type ChatOverlayCanvas,
} from './chat-overlay-safe-placement';

const STICKER_TEMPLATE_IDS = [
  'emoji-grin', 'emoji-joy', 'emoji-heart-eyes', 'emoji-cool', 'emoji-love', 'emoji-fire',
  'emoji-hundred', 'emoji-sparkles', 'emoji-star', 'emoji-gift', 'emoji-balloon', 'emoji-party',
  'audio-visualiser', 'bar-chart', 'boom-effect', 'card-flip', 'circular-progress', 'discount-circle',
  'matrix-rain', 'pulsing-circle', 'spinning-square', 'bouncing-triangle', 'expanding-hexagon',
  'morphing-star', 'rotating-octagon', 'zigzag-diamond', 'flashing-pentagon',
] as const;
const DEFAULT_STICKER_ID = 'emoji-fire';

export const chatAddOverlaySchema = z.object({
  type: z.enum(['text', 'image', 'video', 'sound', 'shape', 'sticker'])
    .describe('Type of overlay to add'),
  start: z.coerce.number().describe('Start frame (0-based)'),
  duration: z.coerce.number().describe('Duration in frames'),
  text: z.string().optional().describe("Text content (required for type='text')"),
  assetId: z.string().optional().describe('Asset ID (required for image/video/sound)'),
  stickerId: z.string().optional().describe(
    "Sticker template id (for type='sticker'). Emojis: emoji-fire, emoji-love, emoji-star, emoji-party, emoji-hundred, emoji-sparkles, emoji-grin, emoji-joy, emoji-heart-eyes, emoji-cool, emoji-gift, emoji-balloon. Effects: boom-effect, card-flip, circular-progress, bar-chart, audio-visualiser, matrix-rain, discount-circle, morphing-star, pulsing-circle, spinning-square, bouncing-triangle, expanding-hexagon, rotating-octagon, zigzag-diamond, flashing-pentagon. Defaults to emoji-fire. For a fully custom/bespoke sticker, use generate_html_sticker instead.",
  ),
  x: z.union([z.coerce.number(), z.string()]).optional()
    .describe("X position: number for pixels, string for '50%' or 'center'. Default: center"),
  y: z.union([z.coerce.number(), z.string()]).optional()
    .describe("Y position: number for pixels, string for '50%' or 'center'. Default: center"),
  width: z.union([z.coerce.number(), z.string()]).optional()
    .describe("Width: number for pixels, string for '50%'. Default: type-specific"),
  height: z.union([z.coerce.number(), z.string()]).optional()
    .describe("Height: number for pixels, string for '50%'. Default: type-specific"),
  rotation: z.coerce.number().optional().default(0),
  row: z.coerce.number().optional().describe(
    'Force specific row. If omitted, Physics Engine auto-places: Videos at bottom, Text on top.',
  ),
  styles: z.object({
    fontSize: z.coerce.number().optional()
      .describe('Font size in pixels (for text). e.g., 32 for body, 48 for title'),
    fontFamily: z.enum([
      'font-sans',
      'font-serif',
      'font-mono',
      'font-retro',
      'font-league-spartan',
      'font-bungee-inline',
    ]).optional().describe('Font family (for text). Default: font-sans'),
    fontWeight: z.coerce.number().optional()
      .describe('Font weight 400-900 (for text). Default: 700'),
    color: z.string().optional().describe('Text color hex (for text). Default: #ffffff'),
    textAlign: z.enum(['left', 'center', 'right']).optional()
      .describe('Text alignment. Default: center'),
    backgroundColor: z.string().optional()
      .describe('Background color (for text). Default: transparent'),
    animation: z.object({
      enter: z.enum([
        'fade', 'slideUp', 'slideRight', 'scale', 'bounce', 'floatIn', 'flipX',
        'zoomBlur', 'snapRotate', 'glitch', 'swipeReveal',
      ]).optional().describe('Entry animation. Default: fade'),
      exit: z.enum([
        'fade', 'slideUp', 'slideRight', 'scale', 'bounce', 'floatIn', 'flipX',
        'zoomBlur', 'snapRotate', 'glitch', 'swipeReveal',
      ]).optional().describe('Exit animation. Default: fade'),
    }).optional().describe('Animation config. Recommended: use fade for smooth transitions'),
    objectFit: z.enum(['cover', 'contain', 'fill']).optional()
      .describe('Object fit (for image/video)'),
    volume: z.coerce.number().optional().describe('Volume 0-1 (for video/sound)'),
    fill: z.string().optional().describe('Fill color (for shape)'),
    stroke: z.string().optional().describe('Stroke color (for shape)'),
    strokeWidth: z.coerce.number().optional().describe('Stroke width (for shape)'),
    opacity: z.coerce.number().optional().describe('Opacity 0-1'),
    borderRadius: z.string().optional().describe("Border radius (e.g. '8px')"),
  }).optional(),
  videoStartTime: z.coerce.number().optional()
    .describe('Start time within source video in seconds (for video)'),
  startFromSound: z.coerce.number().optional()
    .describe('Start time within source audio in seconds (for sound)'),
});

export type ChatAddOverlayInput = z.infer<typeof chatAddOverlaySchema>;

interface ChatOverlayProject {
  aspectRatio?: unknown;
  overlays?: ReadonlyArray<ChatExistingOverlay>;
}

interface ChatExistingOverlay {
  id: number;
  row: number;
  from: number;
  durationInFrames: number;
  type: string;
}

export interface ChatAddOverlayForm {
  id: number;
  type: ChatAddOverlayInput['type'];
  from: number;
  durationInFrames: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  isDragging: false;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatAddOverlayFormResolution {
  overlay: ChatAddOverlayForm;
  row: number;
  position: { left: number; top: number; width: number; height: number };
}

export function getCanvasDimensions(project: { aspectRatio?: unknown }): ChatOverlayCanvas {
  if (project.aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (project.aspectRatio === '4:5') return { width: 1080, height: 1350 };
  if (project.aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (project.aspectRatio === '16:9') return { width: 1280, height: 720 };
  return { width: 1920, height: 1080 };
}

export function toExistingOverlays(
  overlays: ReadonlyArray<ChatExistingOverlay>,
): ExistingOverlay[] {
  return overlays.map((overlay) => ({
    id: overlay.id,
    row: overlay.row,
    from: overlay.from,
    durationInFrames: overlay.durationInFrames,
    type: overlay.type as OverlayType,
  }));
}

export function buildChatAddOverlayForm(input: {
  request: ChatAddOverlayInput;
  project: ChatOverlayProject;
  overlayId: number;
}): ChatAddOverlayFormResolution {
  const { request, project, overlayId } = input;
  assertRequiredContent(request);

  const canvas = getCanvasDimensions(project);
  const existingOverlays = toExistingOverlays(project.overlays ?? []);
  const physicsType = toPhysicsType(request.type);
  const row = findBestRow(
    physicsType,
    { from: request.start, duration: request.duration },
    existingOverlays,
    request.row,
  );
  const requestedCoords = resolveCoordinates(
    { x: request.x, y: request.y, width: request.width, height: request.height },
    canvas,
    getDefaultSize(physicsType),
  );
  const coords = constrainChatOverlayPlacement({
    overlayType: request.type,
    bounds: requestedCoords,
    canvas,
  });
  const baseOverlay: ChatAddOverlayForm = {
    id: overlayId,
    type: request.type,
    from: request.start,
    durationInFrames: request.duration,
    row,
    left: coords.left,
    top: coords.top,
    width: coords.width,
    height: coords.height,
    rotation: request.rotation ?? 0,
    isDragging: false,
    metadata: placementMetadata(coords),
  };
  const overlay = applyTypeSpecificForm({ request, canvas, requestedCoords, baseOverlay });

  return {
    overlay,
    row,
    position: {
      left: overlay.left,
      top: overlay.top,
      width: overlay.width,
      height: overlay.height,
    },
  };
}

function applyTypeSpecificForm(input: {
  request: ChatAddOverlayInput;
  canvas: ChatOverlayCanvas;
  requestedCoords: { left: number; top: number; width: number; height: number };
  baseOverlay: ChatAddOverlayForm;
}): ChatAddOverlayForm {
  const { request, canvas, requestedCoords, baseOverlay } = input;
  switch (request.type) {
    case 'text': {
      const fontSize = request.styles?.fontSize ?? 32;
      const textContent = request.text || '';
      const explicitLines = textContent.split('\n');
      const maxLineChars = Math.max(...explicitLines.map((line) => line.length), 1);
      const maxAllowedWidth = canvas.width * (1 - (2 * EDITRON_TITLE_SAFE_MARGIN));
      const rawAutoWidth = Math.max(200, maxLineChars * fontSize * 0.6);
      const autoWidth = Math.min(rawAutoWidth, maxAllowedWidth);
      const charsPerLine = Math.max(1, Math.floor(autoWidth / (fontSize * 0.6)));
      const totalVisualLines = explicitLines.reduce(
        (total, line) => total + (line.length === 0 ? 1 : Math.ceil(line.length / charsPerLine)),
        0,
      );
      const autoHeight = totalVisualLines * fontSize * 1.4;
      const textWidth = request.width === undefined
        ? autoWidth
        : Math.min(baseOverlay.width, maxAllowedWidth);
      const textHeight = request.height === undefined ? autoHeight : baseOverlay.height;
      const textLeft = request.x === undefined
        ? (canvas.width - textWidth) / 2
        : requestedCoords.left;
      const textTop = request.y === undefined
        ? (canvas.height - textHeight) / 2
        : requestedCoords.top;
      const placement = constrainChatOverlayPlacement({
        overlayType: request.type,
        bounds: { left: textLeft, top: textTop, width: textWidth, height: textHeight },
        canvas,
      });
      return {
        ...baseOverlay,
        left: placement.left,
        top: placement.top,
        width: placement.width,
        height: placement.height,
        metadata: placementMetadata(placement),
        content: textContent,
        styles: protectChatTextLegibility({
          overlayType: 'text',
          currentStyles: {
            fontSize: `${fontSize}`,
            fontFamily: request.styles?.fontFamily ?? 'font-sans',
            fontWeight: `${request.styles?.fontWeight ?? 700}`,
            textAlign: request.styles?.textAlign ?? 'center',
            color: request.styles?.color ?? '#ffffff',
            backgroundColor: request.styles?.backgroundColor ?? 'transparent',
            fontStyle: 'normal',
            textDecoration: 'none',
            opacity: request.styles?.opacity ?? 1,
            animation: {
              enter: request.styles?.animation?.enter ?? 'fade',
              exit: request.styles?.animation?.exit ?? 'fade',
              duration: 15,
            },
          },
        }),
      };
    }
    case 'image':
      return {
        ...baseOverlay,
        assetId: request.assetId,
        styles: {
          objectFit: request.styles?.objectFit ?? 'cover',
          opacity: request.styles?.opacity ?? 1,
          borderRadius: request.styles?.borderRadius,
          animation: { enter: 'fadeIn', exit: 'fadeOut', duration: 15 },
        },
      };
    case 'video':
      return {
        ...baseOverlay,
        assetId: request.assetId,
        videoStartTime: request.videoStartTime ?? 0,
        styles: {
          volume: request.styles?.volume ?? 1,
          objectFit: request.styles?.objectFit ?? 'cover',
          opacity: request.styles?.opacity ?? 1,
          animation: { enter: 'fadeIn', exit: 'fadeOut', duration: 15 },
        },
      };
    case 'sound':
      return {
        ...baseOverlay,
        assetId: request.assetId,
        startFromSound: request.startFromSound ?? 0,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        styles: { volume: request.styles?.volume ?? 1 },
      };
    case 'shape':
      return {
        ...baseOverlay,
        content: 'rectangle',
        styles: {
          fill: request.styles?.fill ?? '#3b82f6',
          stroke: request.styles?.stroke,
          strokeWidth: request.styles?.strokeWidth,
          opacity: request.styles?.opacity ?? 1,
          borderRadius: request.styles?.borderRadius,
        },
      };
    case 'sticker': {
      const requestedStickerId = (request.stickerId ?? '').trim();
      const stickerId = STICKER_TEMPLATE_IDS.includes(
        requestedStickerId as (typeof STICKER_TEMPLATE_IDS)[number],
      ) ? requestedStickerId : DEFAULT_STICKER_ID;
      return {
        ...baseOverlay,
        content: stickerId,
        category: 'Default',
        styles: {
          opacity: request.styles?.opacity ?? 1,
          animation: { enter: 'fadeIn', exit: 'fadeOut', duration: 15 },
        },
      };
    }
  }
}

function assertRequiredContent(input: ChatAddOverlayInput): void {
  if (input.type === 'text' && !input.text) {
    throw new Error("'text' field is required for type='text'");
  }
  if (['image', 'video', 'sound'].includes(input.type) && !input.assetId) {
    throw new Error(`'assetId' field is required for type='${input.type}'`);
  }
}

function toPhysicsType(type: ChatAddOverlayInput['type']): OverlayType {
  if (type === 'sound') return OverlayType.SOUND;
  if (type === 'video') return OverlayType.VIDEO;
  if (type === 'image') return OverlayType.IMAGE;
  if (type === 'text') return OverlayType.TEXT;
  if (type === 'shape') return OverlayType.SHAPE;
  return OverlayType.STICKER;
}

function placementMetadata(input: {
  left: number;
  top: number;
  width: number;
  height: number;
  adjusted: boolean;
  margin: number;
  requested: { left: number; top: number; width: number; height: number };
}): Record<string, unknown> {
  return {
    chatPlacement: {
      requested: input.requested,
      resolved: {
        left: input.left,
        top: input.top,
        width: input.width,
        height: input.height,
      },
      safeMargin: input.margin,
      adjusted: input.adjusted,
    },
  };
}
