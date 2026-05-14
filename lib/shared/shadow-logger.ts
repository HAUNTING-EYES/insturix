/**
 * Cross-Service Shadow Logger
 *
 * Logs user behavior events (overrides, style changes, filter adjustments)
 * as brand events for the learning pipeline to consume.
 *
 * Server-side: call logShadowEvent() directly.
 * Client-side: POST to /api/services/shared/shadow-log which calls this.
 *
 * Rate-limited per user: 30 events per 60-second window.
 */

import { emitBrandEvent, type BrandEventService } from '@/lib/shared/brand-events';

// ==================== Types ====================

export type ShadowEventType =
  | 'filter_changed'
  | 'transition_overridden'
  | 'caption_style_changed'
  | 'zoom_adjusted'
  | 'pacing_overridden'
  | 'audio_level_changed'
  | 'overlay_reordered'
  | 'overlay_deleted'
  | 'overlay_added_manually'
  | 'profile_overridden'
  | 'bgm_replaced'
  | 'sfx_replaced'
  | 'color_grade_changed'
  | 'aspect_ratio_changed';

export interface ShadowEvent {
  userId: string;
  projectId?: string;
  brandId?: string;
  service: BrandEventService;
  eventType: ShadowEventType;
  payload: Record<string, unknown>;
}

// ==================== Rate Limiting ====================

// 30 events per 60s window per user — prevents spam from rapid UI interactions
const MAX_EVENTS_PER_WINDOW = 30;
const WINDOW_MS = 60_000;
const MAX_PAYLOAD_CHARS = 2000;

interface RateWindow {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateWindow>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = rateLimits.get(userId);

  if (!window || now - window.windowStart > WINDOW_MS) {
    rateLimits.set(userId, { count: 1, windowStart: now });
    return false;
  }

  if (window.count >= MAX_EVENTS_PER_WINDOW) {
    return true;
  }

  window.count++;
  return false;
}

// ==================== Core ====================

export async function logShadowEvent(event: ShadowEvent): Promise<boolean> {
  try {
    if (isRateLimited(event.userId)) {
      return false;
    }

    const safePayload = typeof event.payload === 'object' && event.payload !== null
      ? truncatePayload(event.payload)
      : {};

    await emitBrandEvent({
      userId: event.userId,
      projectId: event.projectId,
      brandId: event.brandId,
      service: event.service,
      type: 'user_override',
      payload: {
        shadowEventType: event.eventType,
        ...safePayload,
      },
    });

    return true;
  } catch (error) {
    console.warn('[ShadowLogger] Event failed:', error);
    return false;
  }
}

export async function logShadowEventBatch(events: ShadowEvent[]): Promise<number> {
  let accepted = 0;
  for (const event of events) {
    const ok = await logShadowEvent(event);
    if (ok) accepted++;
  }
  return accepted;
}

// ==================== Helpers ====================

function truncatePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const json = JSON.stringify(payload);
  if (json.length <= MAX_PAYLOAD_CHARS) return payload;

  const truncated: Record<string, unknown> = {};
  let remaining = MAX_PAYLOAD_CHARS;

  for (const [key, value] of Object.entries(payload)) {
    const valueStr = JSON.stringify(value);
    if (remaining - key.length - valueStr.length > 0) {
      truncated[key] = value;
      remaining -= key.length + valueStr.length;
    }
  }

  truncated._truncated = true;
  return truncated;
}
