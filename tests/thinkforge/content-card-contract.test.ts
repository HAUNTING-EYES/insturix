import { describe, expect, it } from 'vitest';

import {
  contentCardClientView,
  mergeContentCardUpdate,
  normalizeContentCardForStorage,
} from '@/lib/thinkforge/planning/content-card-contract';
import { THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS } from '@/lib/thinkforge/production/output-duration-capability';

describe('ThinkForge content card contract', () => {
  it('normalizes legacy cards into planning-ready records', () => {
    const card = normalizeContentCardForStorage(
      { id: 'card_1', title: 'Agency launch post', date: '2026-07-01T10:00:00.000Z', platform: 'linkedin' },
      { userId: 'user_1', now: '2026-06-14T00:00:00.000Z' },
    );

    expect(card).toMatchObject({
      id: 'card_1',
      userId: 'user_1',
      status: 'draft',
      customTags: [],
      plannedDates: ['2026-07-01T10:00:00.000Z'],
      clickatron: { status: 'not_needed' },
    });
  });

  it('preserves campaign, client, trend, and Clickatron readiness context', () => {
    const card = normalizeContentCardForStorage(
      {
        id: 'card_2',
        title: 'Meme repurpose carousel',
        platform: 'instagram',
        plannedDates: ['2026-07-03T09:00:00.000Z'],
        campaignId: 'camp_1',
        campaignName: 'July authority batch',
        clientId: 'client_1',
        clientName: 'NimbusOps',
        seriesId: 'series_1',
        calendarItemId: 'cal_1',
        contentFormat: 'carousel',
        carouselSlideCount: 6,
        publishWindow: { start: '2026-07-03T09:00:00.000Z', end: '2026-07-03T11:00:00.000Z', timezone: 'Asia/Kolkata' },
        trendContext: {
          source: 'meme',
          title: 'AI copilot button jokes',
          provenance: ['public trend inbox'],
          nicheMatch: 1.4,
          brandFit: 0.88,
          status: 'accepted',
        },
        clickatron: { status: 'ready', creativeSpecId: 'spec_1', sessionId: 'click_1' },
      },
      { userId: 'user_1', now: '2026-06-14T00:00:00.000Z' },
    );

    expect(card.campaignId).toBe('camp_1');
    expect(card.clientName).toBe('NimbusOps');
    expect(card.publishWindow?.timezone).toBe('Asia/Kolkata');
    expect(card.trendContext?.brandFit).toBe(0.88);
    expect(card.trendContext?.nicheMatch).toBe(1);
    expect(card.carouselSlideCount).toBe(6);
    expect(card.clickatron).toMatchObject({ status: 'ready', creativeSpecId: 'spec_1' });
  });

  it('rejects invalid carousel slide counts instead of normalizing them', () => {
    const base = {
      id: 'card_carousel',
      title: 'Exact carousel',
      platform: 'linkedin',
      contentFormat: 'carousel',
    };
    const options = { userId: 'user_1', now: '2026-06-14T00:00:00.000Z' };

    expect(() => normalizeContentCardForStorage({ ...base, carouselSlideCount: 1 }, options))
      .toThrow(/whole number from 2 to 10/i);
    expect(normalizeContentCardForStorage({ ...base, carouselSlideCount: 10 }, options).carouselSlideCount)
      .toBe(10);
    expect(() => normalizeContentCardForStorage({ ...base, carouselSlideCount: 11 }, options))
      .toThrow(/whole number from 2 to 10/i);
    expect(() => normalizeContentCardForStorage({ ...base, carouselSlideCount: 3.5 }, options))
      .toThrow(/whole number from 2 to 10/i);
  });

  it('uses the shared production-duration capability instead of a calendar-only hour cap', () => {
    const base = {
      id: 'card_long_form',
      title: 'Two-hour documentary plan',
      platform: 'youtube',
      contentFormat: 'video_script',
    };
    const options = { userId: 'user_1', now: '2026-06-14T00:00:00.000Z' };

    expect(normalizeContentCardForStorage({ ...base, targetDurationSeconds: 7_200 }, options).targetDurationSeconds)
      .toBe(7_200);
    expect(normalizeContentCardForStorage({
      ...base,
      targetDurationSeconds: THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS,
    }, options).targetDurationSeconds).toBe(THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS);
    expect(() => normalizeContentCardForStorage({
      ...base,
      targetDurationSeconds: THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS + 1,
    }, options)).toThrow(new RegExp(`1 to ${THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS}`));
  });

  it('merges updates without allowing ownership or identity changes', () => {
    const merged = mergeContentCardUpdate(
      {
        id: 'card_3',
        userId: 'user_1',
        title: 'Original title',
        date: '2026-07-01T10:00:00.000Z',
        platform: 'linkedin',
        status: 'draft',
        tags: [],
        customTags: [],
        plannedDates: ['2026-07-01T10:00:00.000Z'],
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      { id: 'evil', userId: 'evil_user', title: 'Updated title', status: 'scheduled' },
      { userId: 'user_1', now: '2026-06-14T00:00:00.000Z' },
    );

    expect(merged.id).toBe('card_3');
    expect(merged.userId).toBe('user_1');
    expect(merged.title).toBe('Updated title');
    expect(merged.status).toBe('scheduled');
    expect(merged.createdAt).toBe('2026-06-13T00:00:00.000Z');
    expect(merged.updatedAt).toBe('2026-06-14T00:00:00.000Z');
  });

  it('does not expose the storage owner in client responses', () => {
    const card = normalizeContentCardForStorage(
      { id: 'card_4', title: 'Client response', platform: 'linkedin' },
      { userId: 'user_1', now: '2026-06-14T00:00:00.000Z' },
    );

    expect(contentCardClientView(card)).not.toHaveProperty('userId');
  });
});
