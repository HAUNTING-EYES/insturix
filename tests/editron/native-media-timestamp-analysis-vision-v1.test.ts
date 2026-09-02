import { describe, expect, it } from 'vitest';

import type { NativeMediaTimestampAnalysisMaterializationV1 }
  from '@/lib/editron/services/native-media-timestamp-analysis-materialization-v1';
import { mapVerifiedNativeMediaTimestampAnalysisVisionV1 }
  from '@/lib/editron/services/native-media-timestamp-analysis-vision-v1';

describe('native media timestamp analysis vision V1', () => {
  it('preserves exact project-frame strings and known global evidence', () => {
    const result = mapVerifiedNativeMediaTimestampAnalysisVisionV1(
      materialization([
        {
          kind: 'POINT', sampleIndex: 1, signal: 'SCENE_CHANGE',
          detail: 'Cut', timelineFrame: '9007199254740993',
        },
        {
          kind: 'RANGE', startSampleIndex: 1, endExclusiveSampleIndex: 2,
          signal: 'DEAD_VISUAL_RANGE', detail: 'Hold',
          timelineStartFrame: '9007199254740993',
          timelineEndExclusiveFrame: '9007199254741023',
        },
        {
          kind: 'GLOBAL', signal: 'GESTURE_UNLOCATED', detail: 'Hand rises',
          coordinateDisposition: 'NO_RANGE_COORDINATE',
        },
        {
          kind: 'GLOBAL', signal: 'ON_SCREEN_TEXT_UNLOCATED', detail: '10%',
          coordinateDisposition: 'NO_RANGE_COORDINATE',
        },
        {
          kind: 'GLOBAL', signal: 'SUMMARY', detail: 'Interview',
          coordinateDisposition: 'NO_RANGE_COORDINATE',
        },
        {
          kind: 'GLOBAL', signal: 'THEME', detail: 'Technology',
          coordinateDisposition: 'NO_RANGE_COORDINATE',
        },
      ]),
    );

    expect(result).toEqual({
      sceneChanges: ['9007199254740993'],
      deadVisualRanges: [['9007199254740993', '9007199254741023']],
      gestures: ['Hand rises'],
      onScreenText: ['10%'],
      summary: 'Interview',
      theme: 'Technology',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects multiple summaries instead of silently choosing by array order', () => {
    expect(() => mapVerifiedNativeMediaTimestampAnalysisVisionV1(
      materialization([
        {
          kind: 'GLOBAL', signal: 'SUMMARY', detail: 'First',
          coordinateDisposition: 'NO_RANGE_COORDINATE',
        },
        {
          kind: 'GLOBAL', signal: 'SUMMARY', detail: 'Second',
          coordinateDisposition: 'NO_RANGE_COORDINATE',
        },
      ]),
    )).toThrow('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_VISION_SUMMARY_AMBIGUOUS');
  });
});

function materialization(
  observations: NativeMediaTimestampAnalysisMaterializationV1[
    'analysisReceipt'
  ]['observations'],
): NativeMediaTimestampAnalysisMaterializationV1 {
  return {
    analysisReceipt: { observations },
  } as unknown as NativeMediaTimestampAnalysisMaterializationV1;
}
