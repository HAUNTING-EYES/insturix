import { describe, expect, it } from 'vitest';

import {
  attachTechnicalRenderPlan,
  ThinkForgeRenderPlanError,
} from '@/lib/thinkforge/production/build-script-render-plan';
import { parseScriptSidecarV2 } from '@/lib/thinkforge/schemas/script-sidecar-v2';

function shotIntent() {
  return {
    narrativePurpose: 'Deliver the argument to camera.',
    emotionalBeat: 'Calm conviction.',
    energy: 0.5,
    visualPriority: 'The speaker and their evidence.',
    action: 'talking' as const,
    desiredFraming: 'medium-close-up' as const,
    desiredAngle: 'eye-level' as const,
    desiredMovement: 'static' as const,
    simultaneousPerformers: 1,
    spokenAudio: true,
    performance: [{
      characterId: 'host',
      stance: 'standing' as const,
      emotion: 'assured',
      intensity: 0.5,
      gaze: 'into camera',
      posture: 'upright',
      gesture: 'natural emphasis',
      movement: 'controlled',
    }],
    continuity: { wardrobe: [], props: [], previousSceneIds: [] },
  };
}

function sidecar(input: {
  durationSeconds: number;
  text?: string;
  delivery?: 'sync-dialogue' | 'voiceover';
}) {
  const delivery = input.delivery ?? 'sync-dialogue';
  return {
    sidecarVersion: 2,
    spokenTextSource: 'beat-lines' as const,
    characters: [{ id: 'host', name: 'Host', role: 'host' as const }],
    acts: [{
      id: 'act_1',
      title: 'Argument',
      narrativePurpose: 'Make one coherent argument.',
      narrativeScenes: [{
        id: 'scene_1',
        title: 'Continuous scene',
        narrativePurpose: 'Keep the story unit intact.',
        durationIntentSeconds: input.durationSeconds,
        charactersPresent: ['host'],
        sourceRefs: [],
        beats: [{
          id: 'beat_1',
          kind: delivery === 'sync-dialogue' ? 'dialogue' as const : 'voiceover' as const,
          narrativePurpose: 'Deliver the complete thought.',
          durationIntentSeconds: input.durationSeconds,
          lines: [{
            id: 'line_1',
            text: input.text ?? 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
            speakerId: 'host',
            onCamera: delivery === 'sync-dialogue',
            delivery,
            sourceRefs: [],
          }],
          visualIntent: { description: 'The host presents the complete thought.', onScreenText: [] },
          ...(delivery === 'sync-dialogue' ? { shotIntent: shotIntent() } : {}),
          sourceRefs: [],
        }],
      }],
    }],
    sourceRefs: [],
  };
}

describe('ThinkForge technical render planner', () => {
  it('partitions a long lip-sync line without changing the narrative hierarchy or text', () => {
    const input = sidecar({ durationSeconds: 70 });
    const result = attachTechnicalRenderPlan(input);
    const segments = result.renderPlan?.renderSegments ?? [];

    expect(result.acts).toEqual(input.acts);
    expect(result.acts[0]?.narrativeScenes).toHaveLength(1);
    expect(segments).toHaveLength(7);
    expect(segments.every((segment) => segment.durationSeconds <= 10)).toBe(true);
    expect(segments.reduce((sum, segment) => sum + segment.durationSeconds, 0)).toBeCloseTo(70);

    const line = input.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!;
    const projected = segments.map((segment) => {
      const span = segment.lineSpans[0]!;
      return line.text.slice(span.startOffsetUtf16, span.endOffsetUtf16);
    }).join('');
    expect(projected).toBe(line.text);
  });

  it('does not invent a voiceover provider ceiling before a provider is selected', () => {
    const result = attachTechnicalRenderPlan(sidecar({
      durationSeconds: 420,
      delivery: 'voiceover',
      text: 'A fully developed long-form narration remains one authored beat.',
    }));

    expect(result.acts[0]?.narrativeScenes).toHaveLength(1);
    expect(result.renderPlan?.renderSegments).toHaveLength(1);
    expect(result.renderPlan?.renderSegments[0]).toMatchObject({
      kind: 'voiceover',
      durationSeconds: 420,
    });
  });

  it('uses an explicitly selected visual-provider limit for technical jobs only', () => {
    const input = parseScriptSidecarV2(sidecar({ durationSeconds: 25, delivery: 'voiceover' }));
    input.acts[0]!.narrativeScenes[0]!.beats[0]!.lines = [];
    input.acts[0]!.narrativeScenes[0]!.beats[0]!.kind = 'visual';

    const result = attachTechnicalRenderPlan(input, {
      maxLipSyncDurationSeconds: 10,
      maxVisualDurationSeconds: 10,
    });

    expect(result.acts).toEqual(input.acts);
    const durations = result.renderPlan?.renderSegments.map((segment) => segment.durationSeconds) ?? [];
    expect(durations).toHaveLength(3);
    expect(durations.every((duration) => duration <= 10)).toBe(true);
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(25);
  });

  it('fails visibly when timing cannot be resolved without inventing beat durations', () => {
    const input = parseScriptSidecarV2(sidecar({ durationSeconds: 20, delivery: 'voiceover' }));
    const firstBeat = input.acts[0]!.narrativeScenes[0]!.beats[0]!;
    delete firstBeat.durationIntentSeconds;
    input.acts[0]!.narrativeScenes[0]!.beats.push({
      ...firstBeat,
      id: 'beat_2',
      lines: [{ ...firstBeat.lines[0]!, id: 'line_2' }],
    });

    expect(() => attachTechnicalRenderPlan(input)).toThrow(ThinkForgeRenderPlanError);
    expect(() => attachTechnicalRenderPlan(input)).toThrow(/explicit duration/);
  });

  it('preserves an existing validated technical plan', () => {
    const planned = attachTechnicalRenderPlan(sidecar({ durationSeconds: 10 }));
    expect(attachTechnicalRenderPlan(planned)).toEqual(planned);
  });
});
