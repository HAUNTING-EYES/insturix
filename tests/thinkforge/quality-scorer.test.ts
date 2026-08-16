import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreContent } from '@/lib/thinkforge/data/quality-scorer';
import {
  computeQualityScore,
  getAllSignals,
  getConstraints,
  getTechniqueCategories,
  getVersion,
  loadAntiAiFillerPatterns,
} from '@/lib/thinkforge/data/writing-graph-query';

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

  it('loads bundled policy assets with their declared production inventory', () => {
    expect(getVersion()).toBe('1.0.0');
    expect(getAllSignals()).toHaveLength(48);
    expect(getTechniqueCategories().length).toBeGreaterThan(0);
    expect(getConstraints()).toHaveLength(26);
    expect(loadAntiAiFillerPatterns()).toHaveLength(28);
    expect(computeQualityScore(['ai_filler_words'])).toMatchObject({
      score: 95,
      status: 'pass',
    });
  });

  it('fails closed on policy drift instead of returning a false green', () => {
    expect(() => computeQualityScore(['constraint_not_in_graph']))
      .toThrow('Unknown writing quality constraint: constraint_not_in_graph');

    const source = readFileSync(
      resolve(process.cwd(), 'lib/thinkforge/data/writing-graph-query.ts'),
      'utf8',
    );
    expect(source).toContain("import writingKnowledgeJson from './writing-knowledge.json'");
    expect(source).toContain("import antiAiFillerPatternsJson from './ai-filler-patterns.json'");
    expect(source).not.toContain('readFileSync');
    expect(source).not.toContain('process.cwd()');
    expect(source).not.toContain("return { score: 100, status: 'pass', violations: [] }");
  });
});
