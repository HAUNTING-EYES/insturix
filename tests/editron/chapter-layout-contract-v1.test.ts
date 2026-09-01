import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  assertChapterLayoutManifestV1,
  createChapterLayoutManifestV1,
  parseChapterLayoutManifestV1,
  type ChapterLayoutManifestInputV1,
} from '@/lib/editron/services/chapter-layout-contract-v1';

const PARENT_ADMISSION_ID = 'chr_123456789012';
const BINDING_HASH = 'a'.repeat(64);

function timebase() {
  return {
    timebaseId: 'project-1:timeline',
    version: 'timebase-v1',
    rate: { numerator: '30000', denominator: '1001' },
  } as const;
}

function policy() {
  return {
    policyId: 'chapter-layout-scene-gap-v1',
    policyVersion: '1',
    splitThresholdFrames: 27_000,
    targetFrames: 4_500,
    minimumFrames: 900,
  } as const;
}

function oneChapterInput(): ChapterLayoutManifestInputV1 {
  return {
    parentAdmissionId: PARENT_ADMISSION_ID,
    bindingHash: BINDING_HASH,
    totalFrames: 90,
    projectTimebase: timebase(),
    policy: policy(),
    chapters: [{ index: 0, startFrame: 0, endFrame: 90, durationFrames: 90 }],
  };
}

function multiChapterInput(): ChapterLayoutManifestInputV1 {
  return {
    ...oneChapterInput(),
    totalFrames: 120,
    chapters: [
      { index: 0, startFrame: 0, endFrame: 40, durationFrames: 40 },
      { index: 1, startFrame: 40, endFrame: 90, durationFrames: 50 },
      { index: 2, startFrame: 90, endFrame: 120, durationFrames: 30 },
    ],
  };
}

describe('provider-free chapter layout manifest V1', () => {
  it('creates exact one- and multi-chapter coverage with a deterministic canonical hash', () => {
    const one = createChapterLayoutManifestV1(oneChapterInput());
    const many = createChapterLayoutManifestV1(multiChapterInput());
    const reorderedKeys = createChapterLayoutManifestV1({
      chapters: oneChapterInput().chapters,
      policy: {
        minimumFrames: 900,
        targetFrames: 4_500,
        splitThresholdFrames: 27_000,
        policyVersion: '1',
        policyId: 'chapter-layout-scene-gap-v1',
      },
      projectTimebase: {
        rate: { denominator: '1001', numerator: '30000' },
        version: 'timebase-v1',
        timebaseId: 'project-1:timeline',
      },
      totalFrames: 90,
      bindingHash: BINDING_HASH,
      parentAdmissionId: PARENT_ADMISSION_ID,
    });

    expect(one.chapterCount).toBe(1);
    expect(one.chapters).toEqual([
      { index: 0, startFrame: 0, endFrame: 90, durationFrames: 90 },
    ]);
    expect(many.chapterCount).toBe(3);
    expect(many.chapters.at(-1)?.endFrame).toBe(120);
    expect(reorderedKeys).toEqual(one);
    const { layoutManifestHash, ...material } = one;
    expect(layoutManifestHash).toBe(hashEditronCanonicalJsonV1(material));
    expect(assertChapterLayoutManifestV1(one)).toEqual(one);
    expect(parseChapterLayoutManifestV1(one)).toEqual(one);
  });

  it('detaches and freezes caller input, including nested chapters and policy/timebase', () => {
    const source = oneChapterInput();
    const receipt = createChapterLayoutManifestV1(source);

    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.projectTimebase)).toBe(true);
    expect(Object.isFrozen(receipt.policy)).toBe(true);
    expect(Object.isFrozen(receipt.chapters)).toBe(true);
    expect(Object.isFrozen(receipt.chapters[0])).toBe(true);

    (source.projectTimebase as { rate: { numerator: string } }).rate.numerator = '25';
    (source.policy as { targetFrames: number }).targetFrames = 5_000;
    (source.chapters[0] as { endFrame: number; durationFrames: number }).endFrame = 80;
    (source.chapters[0] as { endFrame: number; durationFrames: number }).durationFrames = 80;

    expect(receipt.projectTimebase.rate).toEqual({ numerator: '30000', denominator: '1001' });
    expect(receipt.policy.targetFrames).toBe(4_500);
    expect(receipt.chapters[0]?.endFrame).toBe(90);
    expect(() => parseChapterLayoutManifestV1(receipt)).not.toThrow();
  });

  it('changes identity for every layout-affecting binding, policy, timebase, and boundary mutation', () => {
    const original = createChapterLayoutManifestV1(multiChapterInput());
    type MutableInput = {
        parentAdmissionId: string;
        bindingHash: string;
        totalFrames: number;
        projectTimebase: { timebaseId: string; version: string; rate: { numerator: string; denominator: string } };
        policy: { policyId: string; policyVersion: string; splitThresholdFrames: number; targetFrames: number; minimumFrames: number };
        chapters: Array<{ index: number; startFrame: number; endFrame: number; durationFrames: number }>;
    };
    const mutate = (change: (input: MutableInput) => void) => {
      const base = multiChapterInput();
      const input: MutableInput = {
        parentAdmissionId: base.parentAdmissionId,
        bindingHash: base.bindingHash,
        totalFrames: base.totalFrames,
        projectTimebase: {
          timebaseId: base.projectTimebase.timebaseId,
          version: base.projectTimebase.version,
          rate: { ...base.projectTimebase.rate },
        },
        policy: { ...base.policy },
        chapters: base.chapters.map((chapter) => ({ ...chapter })),
      };
      change(input);
      return createChapterLayoutManifestV1(input);
    };

    expect(mutate((input) => { input.parentAdmissionId = 'chr_abcdefghijkl'; }).layoutManifestHash)
      .not.toBe(original.layoutManifestHash);
    expect(mutate((input) => { input.bindingHash = 'b'.repeat(64); }).layoutManifestHash)
      .not.toBe(original.layoutManifestHash);
    expect(mutate((input) => { input.projectTimebase.rate = { numerator: '24', denominator: '1' }; }).layoutManifestHash)
      .not.toBe(original.layoutManifestHash);
    expect(mutate((input) => { input.policy.targetFrames = 4_400; }).layoutManifestHash)
      .not.toBe(original.layoutManifestHash);
    expect(mutate((input) => {
      input.chapters[0] = { index: 0, startFrame: 0, endFrame: 45, durationFrames: 45 };
      input.chapters[1] = { index: 1, startFrame: 45, endFrame: 90, durationFrames: 45 };
    }).layoutManifestHash).not.toBe(original.layoutManifestHash);
  });

  it('rejects gaps, overlaps, reordered or duplicate indexes, malformed ranges, counts, hashes, and provider data', () => {
    const valid = multiChapterInput();
    const rejects = [
      {
        name: 'gap',
        value: { ...valid, chapters: [
          valid.chapters[0]!,
          { index: 1, startFrame: 45, endFrame: 90, durationFrames: 45 },
          valid.chapters[2]!,
        ] },
      },
      {
        name: 'overlap',
        value: { ...valid, chapters: [
          { index: 0, startFrame: 0, endFrame: 50, durationFrames: 50 },
          { index: 1, startFrame: 40, endFrame: 90, durationFrames: 50 },
          valid.chapters[2]!,
        ] },
      },
      { name: 'reordered indexes', value: { ...valid, chapters: [...valid.chapters].reverse() } },
      { name: 'duplicate indexes', value: { ...valid, chapters: [valid.chapters[0]!, { ...valid.chapters[1]!, index: 0 }, valid.chapters[2]!] } },
      { name: 'negative start', value: { ...valid, chapters: [{ index: 0, startFrame: -1, endFrame: 40, durationFrames: 41 }, ...valid.chapters.slice(1)] } },
      { name: 'out of range end', value: { ...valid, chapters: [...valid.chapters.slice(0, 2), { index: 2, startFrame: 90, endFrame: 121, durationFrames: 31 }] } },
      { name: 'wrong duration', value: { ...valid, chapters: [{ ...valid.chapters[0]!, durationFrames: 39 }, ...valid.chapters.slice(1)] } },
      { name: 'wrong count', value: { ...valid, chapterCount: 2 } },
      { name: 'invalid parent ID', value: { ...valid, parentAdmissionId: 'parent-1' } },
      { name: 'invalid binding hash', value: { ...valid, bindingHash: 'A'.repeat(64) } },
      { name: 'invalid layout hash', value: { ...valid, layoutManifestHash: 'c'.repeat(64) } },
      { name: 'provider field', value: { ...valid, providerRenderId: 'render-1' } as unknown as ChapterLayoutManifestInputV1 },
      { name: 'output field', value: { ...valid, outputUrl: 'https://example.test/out.mp4' } as unknown as ChapterLayoutManifestInputV1 },
      { name: 'concat source manifest', value: { ...valid, sourceManifestHash: 'd'.repeat(64) } as unknown as ChapterLayoutManifestInputV1 },
      { name: 'nested provider field', value: { ...valid, policy: { ...valid.policy, provider: 'remotion' } } as unknown as ChapterLayoutManifestInputV1 },
    ];

    for (const candidate of rejects) {
      expect(() => createChapterLayoutManifestV1(candidate.value), candidate.name).toThrow();
    }
  });

  it('rejects parser tampering when a boundary changes without the corresponding hash', () => {
    const original = createChapterLayoutManifestV1(multiChapterInput());
    const tampered = {
      ...original,
      chapters: original.chapters.map((chapter, index) => index === 1
        ? { ...chapter, startFrame: chapter.startFrame + 1, durationFrames: chapter.durationFrames - 1 }
        : chapter),
    };
    expect(() => parseChapterLayoutManifestV1(tampered)).toThrow();
    expect(() => assertChapterLayoutManifestV1({
      ...original,
      layoutManifestHash: 'e'.repeat(64),
    })).toThrow();
  });
});
