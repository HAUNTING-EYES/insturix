import { describe, expect, it } from 'vitest';
import { scoreContent } from '@/lib/thinkforge/data/quality-scorer';

describe('ThinkForge quality scorer', () => {
  it('loads AI filler patterns through the writing graph loader', () => {
    const score = scoreContent('This draft calls the approval flow a game-changer instead of naming the actual operational change.');

    expect(score.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraintId: 'ai_filler_words',
          message: expect.stringContaining('game-changer'),
        }),
      ]),
    );
  });
});