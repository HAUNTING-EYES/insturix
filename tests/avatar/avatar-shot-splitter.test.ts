import { describe, expect, it } from 'vitest';
import {
  isMultiShot,
  packUnitsIntoShots,
  planShots,
  splitIntoSentences,
  type MeasuredUnit,
} from '../../lib/avatar/avatar-shot-splitter';

describe('splitIntoSentences', () => {
  it('splits on sentence boundaries and trims', () => {
    expect(splitIntoSentences('Hi there. How are you?  Great!')).toEqual(['Hi there.', 'How are you?', 'Great!']);
  });
  it('collapses whitespace and drops empties', () => {
    expect(splitIntoSentences('   One.\n\n  Two.   ')).toEqual(['One.', 'Two.']);
    expect(splitIntoSentences('')).toEqual([]);
  });
});

describe('packUnitsIntoShots', () => {
  const u = (text: string, durationSec: number): MeasuredUnit => ({ text, durationSec });

  it('packs consecutive units into ≤budget shots', () => {
    const shots = packUnitsIntoShots([u('a', 4), u('b', 4), u('c', 5), u('d', 3)], 10);
    // a+b = 8 (next c would be 13 → close); c+d = 8
    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ text: 'a b', durationSec: 8, unitCount: 2, index: 0 });
    expect(shots[1]).toMatchObject({ text: 'c d', durationSec: 8, unitCount: 2, index: 1 });
  });

  it('closes a shot exactly at the budget', () => {
    const shots = packUnitsIntoShots([u('a', 6), u('b', 4), u('c', 2)], 10);
    expect(shots).toHaveLength(2);
    expect(shots[0].durationSec).toBe(10); // a+b hits the cap
    expect(shots[1].text).toBe('c');
  });

  it('flags a single over-budget unit as its own shot', () => {
    const shots = packUnitsIntoShots([u('short', 3), u('waytoolong', 13)], 10);
    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ text: 'short', overBudget: false });
    expect(shots[1]).toMatchObject({ text: 'waytoolong', durationSec: 13, overBudget: true });
  });

  it('returns [] for no units', () => {
    expect(packUnitsIntoShots([], 10)).toEqual([]);
  });
});

describe('planShots (audio-first)', () => {
  it('splits, measures each sentence, and packs into shots', async () => {
    const durByText: Record<string, number> = { 'One.': 4, 'Two.': 4, 'Three.': 5 };
    const shots = await planShots('One. Two. Three.', async (t) => durByText[t] ?? 3, 10);
    expect(shots).toHaveLength(2); // One+Two = 8, Three = 5
    expect(shots[0].text).toBe('One. Two.');
    expect(shots[1].text).toBe('Three.');
  });

  it('keeps a short script to a single shot', async () => {
    const shots = await planShots('Hello world.', async () => 2, 10);
    expect(shots).toHaveLength(1);
    expect(isMultiShot(shots)).toBe(false);
  });
});

describe('isMultiShot', () => {
  it('is true only when a script needs more than one shot (route to Editron)', () => {
    expect(isMultiShot([{ index: 0, text: 'a', durationSec: 5, unitCount: 1, overBudget: false }])).toBe(false);
    expect(
      isMultiShot([
        { index: 0, text: 'a', durationSec: 8, unitCount: 1, overBudget: false },
        { index: 1, text: 'b', durationSec: 8, unitCount: 1, overBudget: false },
      ]),
    ).toBe(true);
  });
});
