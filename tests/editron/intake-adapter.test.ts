import { describe, expect, it } from 'vitest';

import type { ProjectAssetAnalysisDoc } from '@/lib/editron/storyline/asset-analysis-reader';
import {
  type IntakeAssetDuration,
  intakeSignalsFromProject,
} from '@/lib/editron/production-brief/intake-adapter';
import { resolveProductionBrief } from '@/lib/editron/production-brief/intake-resolver';

function doc(assetId: string, contentType?: string | null, speechCoverage?: number | null): ProjectAssetAnalysisDoc {
  return {
    projectId: 'p1',
    assetId,
    rawFootageAnalysis: {
      contentTypeDetection: contentType !== undefined ? { contentType } : undefined,
      speechCoverage,
    },
  };
}
function asset(assetId: string, durationSec?: number | null): IntakeAssetDuration {
  return { assetId, durationSec };
}

describe('intakeSignalsFromProject', () => {
  it('aggregates count, total duration, dominant contentType, mean speech coverage', () => {
    const s = intakeSignalsFromProject(
      [doc('a', 'podcast', 0.8), doc('b', 'podcast', 0.6), doc('c', 'interview', 0.4)],
      [asset('a', 600), asset('b', 300), asset('c', 120)],
    );
    expect(s.assetCount).toBe(3);
    expect(s.totalDurationSec).toBe(1020);
    expect(s.contentType).toBe('podcast'); // 2 of 3
    expect(s.speechCoverage).toBeCloseTo(0.6); // (0.8+0.6+0.4)/3
    expect(s.entryPoint).toBe('upload');
  });

  it('unknown signals -> null (resolver treats as follow-the-content, not a guess)', () => {
    const s = intakeSignalsFromProject([doc('a', null, null)], [asset('a', null)]);
    expect(s.contentType).toBeNull();
    expect(s.speechCoverage).toBeNull();
    expect(s.totalDurationSec).toBeNull();
    expect(s.assetCount).toBe(1);
  });

  it('hasBrand derives from an explicit flag or the presence of brand defaults', () => {
    expect(intakeSignalsFromProject([], [], { brand: { preferredPlatform: 'tiktok' } }).hasBrand).toBe(true);
    expect(intakeSignalsFromProject([], [], { hasBrand: true }).hasBrand).toBe(true);
    expect(intakeSignalsFromProject([], []).hasBrand).toBe(false);
  });

  it('passes the user intake through (platforms, prompt, requested)', () => {
    const s = intakeSignalsFromProject([], [], {
      connectedPlatforms: ['tiktok'],
      prompt: 'punchy cut',
      requested: { targetDurationSec: 30 },
    });
    expect(s.connectedPlatforms).toEqual(['tiktok']);
    expect(s.prompt).toBe('punchy cut');
    expect(s.requested).toEqual({ targetDurationSec: 30 });
  });

  it('ignores zero/negative durations when summing', () => {
    const s = intakeSignalsFromProject([], [asset('a', 100), asset('b', 0), asset('c', -5)]);
    expect(s.totalDurationSec).toBe(100);
  });

  it('feeds the resolver end-to-end: a podcast upload resolves to a faithful YouTube brief', () => {
    const signals = intakeSignalsFromProject([doc('a', 'podcast', 0.9)], [asset('a', 3600)]);
    const b = resolveProductionBrief(signals);
    expect(b.output.platform).toBe('youtube'); // long-form content inference
    expect(b.sourceDurationSec).toBe(3600); // duration reached the brief as the source cap
  });
});
