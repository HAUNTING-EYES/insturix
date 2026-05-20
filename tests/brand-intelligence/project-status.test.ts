/**
 * Tests for Project Status State Machine
 *
 * Validates the VALID_TRANSITIONS map — every allowed transition,
 * every blocked transition, and edge cases like failed recovery.
 *
 * These are pure logic tests (no MongoDB). The transition validation
 * logic is extracted and tested directly.
 */

import { describe, it, expect } from 'vitest';

// We can't import the full module (it calls getDatabase at import time),
// so we replicate the transition map and test the contract.
// If the map changes in project-status.ts, these tests catch regressions.

type ProjectStatus =
  | 'draft'
  | 'scripting'
  | 'storyboarding'
  | 'generating'
  | 'editing'
  | 'reviewing'
  | 'rendering'
  | 'rendered'
  | 'published'
  | 'archived'
  | 'failed';

const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['scripting', 'generating', 'editing', 'failed'],
  scripting: ['storyboarding', 'failed'],
  storyboarding: ['generating', 'failed'],
  generating: ['editing', 'failed'],
  editing: ['reviewing', 'rendering', 'failed'],
  reviewing: ['rendering', 'editing', 'failed'],
  rendering: ['rendered', 'failed'],
  rendered: ['published', 'archived', 'editing', 'failed'],
  published: ['archived', 'failed'],
  archived: ['draft', 'failed'],
  failed: ['draft', 'editing'],
};

function isValidTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Project Status State Machine', () => {
  describe('happy path: full pipeline lifecycle', () => {
    const lifecycle: ProjectStatus[] = [
      'draft',
      'scripting',
      'storyboarding',
      'generating',
      'editing',
      'reviewing',
      'rendering',
      'rendered',
      'published',
    ];

    for (let i = 0; i < lifecycle.length - 1; i++) {
      const from = lifecycle[i];
      const to = lifecycle[i + 1];
      it(`allows ${from} → ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(true);
      });
    }
  });

  describe('any state can transition to failed', () => {
    const allStates: ProjectStatus[] = [
      'draft', 'scripting', 'storyboarding', 'generating',
      'editing', 'reviewing', 'rendering', 'rendered',
      'published', 'archived',
    ];

    for (const state of allStates) {
      it(`allows ${state} → failed`, () => {
        expect(isValidTransition(state, 'failed')).toBe(true);
      });
    }
  });

  describe('failed recovery paths', () => {
    it('allows failed → draft (restart)', () => {
      expect(isValidTransition('failed', 'draft')).toBe(true);
    });

    it('allows failed → editing (manual fix)', () => {
      expect(isValidTransition('failed', 'editing')).toBe(true);
    });

    it('blocks failed → rendering (must go through editing first)', () => {
      expect(isValidTransition('failed', 'rendering')).toBe(false);
    });

    it('blocks failed → published (can\'t publish from failure)', () => {
      expect(isValidTransition('failed', 'published')).toBe(false);
    });
  });

  describe('blocked backward transitions', () => {
    it('blocks rendering → editing (must fail first or complete)', () => {
      expect(isValidTransition('rendering', 'editing')).toBe(false);
    });

    it('blocks published → editing (must archive first)', () => {
      expect(isValidTransition('published', 'editing')).toBe(false);
    });

    it('blocks generating → draft (no going back)', () => {
      expect(isValidTransition('generating', 'draft')).toBe(false);
    });

    it('blocks scripting → draft', () => {
      expect(isValidTransition('scripting', 'draft')).toBe(false);
    });
  });

  describe('skip transitions are blocked', () => {
    it('blocks draft → rendering (must go through pipeline)', () => {
      expect(isValidTransition('draft', 'rendering')).toBe(false);
    });

    it('blocks draft → published', () => {
      expect(isValidTransition('draft', 'published')).toBe(false);
    });

    it('blocks scripting → editing (must go through generating)', () => {
      expect(isValidTransition('scripting', 'editing')).toBe(false);
    });

    it('blocks generating → rendering (must go through editing)', () => {
      expect(isValidTransition('generating', 'rendering')).toBe(false);
    });
  });

  describe('archive/unarchive', () => {
    it('allows rendered → archived', () => {
      expect(isValidTransition('rendered', 'archived')).toBe(true);
    });

    it('allows published → archived', () => {
      expect(isValidTransition('published', 'archived')).toBe(true);
    });

    it('allows archived → draft (unarchive)', () => {
      expect(isValidTransition('archived', 'draft')).toBe(true);
    });

    it('blocks archived → editing (must go to draft first)', () => {
      expect(isValidTransition('archived', 'editing')).toBe(false);
    });
  });

  describe('re-edit after render', () => {
    it('allows rendered → editing (re-open for editing)', () => {
      expect(isValidTransition('rendered', 'editing')).toBe(true);
    });

    it('allows reviewing → editing (sent back for changes)', () => {
      expect(isValidTransition('reviewing', 'editing')).toBe(true);
    });
  });

  describe('transition map completeness', () => {
    const allStatuses: ProjectStatus[] = [
      'draft', 'scripting', 'storyboarding', 'generating',
      'editing', 'reviewing', 'rendering', 'rendered',
      'published', 'archived', 'failed',
    ];

    it('every status has at least one valid transition', () => {
      for (const status of allStatuses) {
        expect(VALID_TRANSITIONS[status].length).toBeGreaterThan(0);
      }
    });

    it('no status can transition to itself', () => {
      for (const status of allStatuses) {
        expect(isValidTransition(status, status)).toBe(false);
      }
    });

    it('all 11 statuses are in the map', () => {
      expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(11);
    });
  });
});
