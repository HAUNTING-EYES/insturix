import { describe, expect, it } from 'vitest';

import { getChatEditBattleScenario } from '@/lib/editron/services/chat-edit-battle-harness';
import { planChatBattleFixture } from '@/lib/editron/services/chat-edit-battle-fixture-plan';

describe('chat edit impact-audio fixture plan', () => {
  it('routes camera shake to the licensed measured-impact source', () => {
    expect(plan('audio-anchored-camera-shake')).toMatchObject({
      profile: 'impact-audio',
      sourceProjectId: 'proj_chatbattle_impact_audio_v1',
      soundOverlayPolicy: 'preserve-all',
      nativeAudioPolicy: 'mute-embedded-when-explicit-tracks',
    });
  });

  it.each([
    'bgm-explicit',
    'manual-impact-sfx',
    'mixed-multi-step',
  ])('keeps %s on the general audio source', (scenarioId) => {
    expect(plan(scenarioId)).toMatchObject({
      profile: 'audio',
      sourceProjectId: 'proj_4N_6crLWX89A',
    });
  });
});

function plan(scenarioId: string) {
  const scenario = getChatEditBattleScenario(scenarioId);
  if (!scenario) throw new Error(`Missing chat battle scenario ${scenarioId}.`);
  return planChatBattleFixture(scenario);
}
