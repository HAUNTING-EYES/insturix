import { describe, expect, it } from 'vitest';

import {
  EDITRON_EXECUTABLE_FAMILIES,
  EDITRON_EXECUTABLES,
  type EditronExecutable,
} from '@/lib/shared/capabilities';

describe('EDITRON_EXECUTABLES — the executor decision-family inventory', () => {
  it('mirrors the verified BriefDecisionType (31 values, no duplicates)', () => {
    // 31 = code-verified count of creative-brief.ts BriefDecisionType (excludes the 4
    // ContentMode values). If BriefDecisionType changes, update both in lockstep.
    expect(EDITRON_EXECUTABLES).toHaveLength(31);
    expect(new Set(EDITRON_EXECUTABLES).size).toBe(31);
  });

  it('the family grouping PARTITIONS the full list (every executable in exactly one family)', () => {
    const flat = Object.values(EDITRON_EXECUTABLE_FAMILIES).flat() as EditronExecutable[];
    // no duplicates across families
    expect(new Set(flat).size).toBe(flat.length);
    // exact coverage — families union === the full executable set
    expect(new Set(flat)).toEqual(new Set(EDITRON_EXECUTABLES));
  });

  it('every family member is a real executable (no stray strings)', () => {
    const valid = new Set<string>(EDITRON_EXECUTABLES);
    for (const members of Object.values(EDITRON_EXECUTABLE_FAMILIES)) {
      for (const m of members) expect(valid.has(m)).toBe(true);
    }
  });
});
