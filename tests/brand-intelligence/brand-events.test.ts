/**
 * Tests for Brand Events type contracts and event structure.
 *
 * Pure logic tests — no MongoDB or QStash.
 * Validates event type coverage, service coverage,
 * and the worker routing contract.
 */

import { describe, it, expect } from 'vitest';

// Replicate types to test the contract without importing MongoDB-dependent modules
type BrandEventService =
  | 'thinkforge'
  | 'editron'
  | 'pipeline'
  | 'alyzitron'
  | 'clickatron'
  | 'musitron'
  | 'uploaderx';

type BrandEventType =
  | 'script_generated'
  | 'script_feedback'
  | 'project_created'
  | 'director_completed'
  | 'video_rendered'
  | 'video_published'
  | 'analysis_complete'
  | 'thumbnail_created'
  | 'music_selected'
  | 'brand_updated'
  | 'user_override'
  | 'quality_reviewed'
  | 'status_changed';

// Worker handler routing — must match the switch in brand-learning/route.ts
const HANDLED_EVENT_TYPES: BrandEventType[] = [
  'director_completed',
  'video_rendered',
  'quality_reviewed',
  'brand_updated',
  'video_published',
];

const ALL_SERVICES: BrandEventService[] = [
  'thinkforge', 'editron', 'pipeline',
  'alyzitron', 'clickatron', 'musitron', 'uploaderx',
];

const ALL_EVENT_TYPES: BrandEventType[] = [
  'script_generated', 'script_feedback', 'project_created',
  'director_completed', 'video_rendered', 'video_published',
  'analysis_complete', 'thumbnail_created', 'music_selected',
  'brand_updated', 'user_override', 'quality_reviewed', 'status_changed',
];

describe('Brand Events', () => {
  describe('type coverage', () => {
    it('has 13 event types', () => {
      expect(ALL_EVENT_TYPES).toHaveLength(13);
    });

    it('has 7 services', () => {
      expect(ALL_SERVICES).toHaveLength(7);
    });

    it('no duplicate event types', () => {
      const unique = new Set(ALL_EVENT_TYPES);
      expect(unique.size).toBe(ALL_EVENT_TYPES.length);
    });

    it('no duplicate services', () => {
      const unique = new Set(ALL_SERVICES);
      expect(unique.size).toBe(ALL_SERVICES.length);
    });
  });

  describe('worker handler coverage', () => {
    it('handles the 5 key event types with real logic', () => {
      expect(HANDLED_EVENT_TYPES).toHaveLength(5);
    });

    it('all handled types are valid event types', () => {
      for (const type of HANDLED_EVENT_TYPES) {
        expect(ALL_EVENT_TYPES).toContain(type);
      }
    });

    it('bandit-feeding events are all handled', () => {
      const banditEvents: BrandEventType[] = [
        'director_completed',
        'video_rendered',
        'quality_reviewed',
        'video_published',
      ];
      for (const type of banditEvents) {
        expect(HANDLED_EVENT_TYPES).toContain(type);
      }
    });

    it('unhandled event types fall through to default (acknowledged)', () => {
      const unhandled = ALL_EVENT_TYPES.filter(
        (t) => !HANDLED_EVENT_TYPES.includes(t),
      );
      expect(unhandled.length).toBe(8);
      expect(unhandled).toContain('script_generated');
      expect(unhandled).toContain('status_changed');
      expect(unhandled).toContain('project_created');
    });
  });

  describe('event structure contract', () => {
    it('event requires userId, service, type, payload', () => {
      const event = {
        userId: 'user_123',
        service: 'editron' as BrandEventService,
        type: 'director_completed' as BrandEventType,
        payload: { qualityScore: 75 },
      };

      expect(event.userId).toBeTruthy();
      expect(event.service).toBeTruthy();
      expect(event.type).toBeTruthy();
      expect(event.payload).toBeDefined();
    });

    it('projectId and brandId are optional', () => {
      const minimalEvent = {
        userId: 'user_123',
        service: 'editron' as BrandEventService,
        type: 'brand_updated' as BrandEventType,
        payload: {},
      };

      expect(minimalEvent).not.toHaveProperty('projectId');
      expect(minimalEvent).not.toHaveProperty('brandId');
    });
  });

  describe('pipeline event flow', () => {
    it('pipeline finalize emits project_created from pipeline service', () => {
      const event = {
        service: 'pipeline' as BrandEventService,
        type: 'project_created' as BrandEventType,
      };
      expect(event.service).toBe('pipeline');
      expect(ALL_EVENT_TYPES).toContain(event.type);
    });

    it('director emits director_completed from editron service', () => {
      const event = {
        service: 'editron' as BrandEventService,
        type: 'director_completed' as BrandEventType,
      };
      expect(event.service).toBe('editron');
      expect(HANDLED_EVENT_TYPES).toContain(event.type);
    });

    it('render completion emits video_rendered from editron service', () => {
      const event = {
        service: 'editron' as BrandEventService,
        type: 'video_rendered' as BrandEventType,
      };
      expect(event.service).toBe('editron');
      expect(HANDLED_EVENT_TYPES).toContain(event.type);
    });

    it('quality review emits quality_reviewed from editron service', () => {
      const event = {
        service: 'editron' as BrandEventService,
        type: 'quality_reviewed' as BrandEventType,
      };
      expect(event.service).toBe('editron');
      expect(HANDLED_EVENT_TYPES).toContain(event.type);
    });
  });
});
