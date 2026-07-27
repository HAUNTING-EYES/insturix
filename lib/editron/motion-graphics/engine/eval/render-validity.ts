import type { RenderStatus } from './composite';

export interface RenderLogEntry {
  type?: string;
  text: string;
}

export interface RenderImageStats {
  /** Standard deviation of perceived brightness. Near-zero means the frame is visually flat. */
  lumaStdDev?: number;
  /** Ratio of non-background/visible pixels when an image diff pipeline provides it. */
  visiblePixelRatio?: number;
  /** Before/after delta. Mutation evidence must never be interpreted as absolute frame visibility. */
  mutationPixelRatio?: number;
  mutationPixelCount?: number;
  sampledPixelCount?: number;
  /** Ratio of opaque pixels when alpha-aware stats are available. */
  opaquePixelRatio?: number;
  /** Average alpha in [0,1]. */
  alphaMean?: number;
}

export interface RenderValidityInput {
  logs?: RenderLogEntry[];
  image?: RenderImageStats;
  renderError?: unknown;
  blankImageJustification?: string;
}

export interface RenderValidityReport {
  status: RenderStatus;
  matchedLogs: RenderLogEntry[];
}

const RENDER_ERROR_PATTERN = /\[MG-Render\]|render failed|safecompositionrenderer|runtime error|uncaught/i;
const OVERFLOW_PATTERN = /\[MG-Fit\]|cannot fit|overflow|clipped|clips title-safe|clips action-safe/i;

export function stringifyRenderError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message || error.name;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isBlankImage(image: RenderImageStats, stdDevThreshold = 1): boolean {
  if (image.visiblePixelRatio !== undefined && image.visiblePixelRatio <= 0.005) {
    return true;
  }

  if (image.opaquePixelRatio !== undefined && image.opaquePixelRatio <= 0.005) {
    return true;
  }

  if (image.alphaMean !== undefined && image.alphaMean <= 0.005) {
    return true;
  }

  return image.lumaStdDev !== undefined && image.lumaStdDev <= stdDevThreshold;
}

export function classifyRenderValidity(input: RenderValidityInput): RenderValidityReport {
  if (input.renderError !== undefined) {
    return {
      status: {
        ok: false,
        reason: 'throw',
        detail: stringifyRenderError(input.renderError),
      },
      matchedLogs: [],
    };
  }

  const logs = input.logs ?? [];
  const renderErrors = logs.filter((log) => {
    const type = log.type?.toLowerCase();
    return type === 'error' || RENDER_ERROR_PATTERN.test(log.text);
  });

  if (renderErrors.length > 0) {
    return {
      status: {
        ok: false,
        reason: 'throw',
        detail: renderErrors.map((log) => log.text).join('\n'),
      },
      matchedLogs: renderErrors,
    };
  }

  const overflowWarnings = logs.filter((log) => OVERFLOW_PATTERN.test(log.text));
  if (overflowWarnings.length > 0) {
    return {
      status: {
        ok: false,
        reason: 'overflow',
        detail: overflowWarnings.map((log) => log.text).join('\n'),
      },
      matchedLogs: overflowWarnings,
    };
  }

  if (input.image && isBlankImage(input.image)) {
    if (input.blankImageJustification) {
      return {
        status: { ok: true },
        matchedLogs: [{ type: 'info', text: input.blankImageJustification }],
      };
    }
    return {
      status: {
        ok: false,
        reason: 'blank',
        detail: `blank-ish image stats: ${JSON.stringify(input.image)}`,
      },
      matchedLogs: [],
    };
  }

  return {
    status: { ok: true },
    matchedLogs: [],
  };
}
