import { describe, expect, it } from 'vitest';
import {
  renderChapterRetentionDays,
  renderChapterExpiresAt,
  BASE_RENDER_CHAPTER_RETENTION_DAYS,
} from '../../lib/editron/services/render-chapter-retention';

describe('render-chapter plan-based retention', () => {
  it('maps plan tiers to base 7 / mid 30 / top 90 days', () => {
    expect(renderChapterRetentionDays('free')).toBe(7);
    expect(renderChapterRetentionDays('plus')).toBe(30);
    expect(renderChapterRetentionDays('pro')).toBe(90);
    expect(renderChapterRetentionDays('premium')).toBe(90);
  });

  it('is case-insensitive and accepts base/mid/top aliases', () => {
    expect(renderChapterRetentionDays('PRO')).toBe(90);
    expect(renderChapterRetentionDays('base')).toBe(7);
    expect(renderChapterRetentionDays('mid')).toBe(30);
    expect(renderChapterRetentionDays('top')).toBe(90);
  });

  it('falls back to the base tier (7d) for unknown/missing plans', () => {
    expect(renderChapterRetentionDays(undefined)).toBe(BASE_RENDER_CHAPTER_RETENTION_DAYS);
    expect(renderChapterRetentionDays(null)).toBe(7);
    expect(renderChapterRetentionDays('enterprise-xyz')).toBe(7);
    expect(renderChapterRetentionDays('')).toBe(7);
  });

  it('computes expiresAt = createdAt + the plan retention window', () => {
    const created = new Date('2026-07-03T00:00:00.000Z');
    expect(renderChapterExpiresAt(created, 'free').getTime() - created.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(renderChapterExpiresAt(created, 'plus').getTime() - created.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(renderChapterExpiresAt(created, 'pro').getTime() - created.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
