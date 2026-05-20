/**
 * POST /api/services/shared/shadow-log
 *
 * Client-side endpoint for logging user behavior events.
 * Called by editor UI when user overrides AI decisions,
 * changes styles, adjusts filters, etc.
 *
 * Rate-limited per user (30 events/min) in shadow-logger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  logShadowEvent,
  logShadowEventBatch,
  type ShadowEventType,
  type ShadowEvent,
} from '@/lib/shared/shadow-logger';
import type { BrandEventService } from '@/lib/shared/brand-events';

export const runtime = 'nodejs';

const VALID_EVENT_TYPES: ShadowEventType[] = [
  'filter_changed',
  'transition_overridden',
  'caption_style_changed',
  'zoom_adjusted',
  'pacing_overridden',
  'audio_level_changed',
  'overlay_reordered',
  'overlay_deleted',
  'overlay_added_manually',
  'profile_overridden',
  'bgm_replaced',
  'sfx_replaced',
  'color_grade_changed',
  'aspect_ratio_changed',
];

const VALID_SERVICES: BrandEventService[] = [
  'thinkforge', 'editron', 'pipeline',
  'alyzitron', 'clickatron', 'musitron', 'uploaderx',
];

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    if (Array.isArray(body.events)) {
      if (body.events.length > 100) {
        return NextResponse.json(
          { error: 'Batch size exceeds 100 events' },
          { status: 400 },
        );
      }
      const rawCount = body.events.length;
      const events: ShadowEvent[] = body.events
        .filter((e: unknown) => isValidEvent(e))
        .map((e: Record<string, unknown>) => ({
          userId,
          projectId: typeof e.projectId === 'string' ? e.projectId : undefined,
          brandId: typeof e.brandId === 'string' ? e.brandId : undefined,
          service: e.service as BrandEventService,
          eventType: e.eventType as ShadowEventType,
          payload: (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>,
        }));

      const accepted = await logShadowEventBatch(events);
      return NextResponse.json({
        ok: true,
        accepted,
        valid: events.length,
        total: rawCount,
      });
    }

    const { eventType, service, projectId, brandId, payload } = body;

    if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
      return NextResponse.json(
        { error: 'Invalid eventType' },
        { status: 400 },
      );
    }

    if (!service || !VALID_SERVICES.includes(service)) {
      return NextResponse.json(
        { error: 'Invalid service' },
        { status: 400 },
      );
    }

    const accepted = await logShadowEvent({
      userId,
      projectId: projectId || undefined,
      brandId: brandId || undefined,
      service,
      eventType,
      payload: (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>,
    });

    return NextResponse.json({ ok: true, accepted });
  } catch (error: unknown) {
    console.error('[shadow-log]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

function isValidEvent(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.eventType === 'string' &&
    VALID_EVENT_TYPES.includes(obj.eventType as ShadowEventType) &&
    typeof obj.service === 'string' &&
    VALID_SERVICES.includes(obj.service as BrandEventService)
  );
}
