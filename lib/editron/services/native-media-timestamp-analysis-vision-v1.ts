import type {
  NativeMediaTimestampAnalysisMaterializationV1,
} from './native-media-timestamp-analysis-materialization-v1';
import { freezeNativeMediaTimestampAnalysisV1 }
  from './native-media-timestamp-analysis-validation-v1';

export type NativeMediaTimestampAnalysisVisionV1 = Readonly<{
  sceneChanges: readonly string[];
  deadVisualRanges: readonly (readonly [string, string])[];
  gestures: readonly string[];
  onScreenText: readonly string[];
  summary: string | null;
  theme: string | null;
}>;

export function mapVerifiedNativeMediaTimestampAnalysisVisionV1(
  materialization: NativeMediaTimestampAnalysisMaterializationV1,
): NativeMediaTimestampAnalysisVisionV1 {
  const sceneChanges: string[] = [];
  const deadVisualRanges: Array<readonly [string, string]> = [];
  const gestures: string[] = [];
  const onScreenText: string[] = [];
  let summary: string | null = null;
  let theme: string | null = null;
  for (const observation of materialization.analysisReceipt.observations) {
    if (observation.kind === 'POINT') {
      if (observation.signal === 'SCENE_CHANGE') {
        sceneChanges.push(observation.timelineFrame);
      }
      continue;
    }
    if (observation.kind === 'RANGE') {
      if (observation.signal === 'DEAD_VISUAL_RANGE') {
        deadVisualRanges.push([
          observation.timelineStartFrame,
          observation.timelineEndExclusiveFrame,
        ]);
      }
      continue;
    }
    if (observation.signal === 'GESTURE_UNLOCATED') {
      gestures.push(observation.detail);
    } else if (observation.signal === 'ON_SCREEN_TEXT_UNLOCATED') {
      onScreenText.push(observation.detail);
    } else if (observation.signal === 'SUMMARY') {
      if (summary !== null) {
        throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_VISION_SUMMARY_AMBIGUOUS');
      }
      summary = observation.detail;
    } else if (observation.signal === 'THEME') {
      if (theme !== null) {
        throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_VISION_THEME_AMBIGUOUS');
      }
      theme = observation.detail;
    }
  }
  return freezeNativeMediaTimestampAnalysisV1({
    sceneChanges,
    deadVisualRanges,
    gestures,
    onScreenText,
    summary,
    theme,
  });
}
