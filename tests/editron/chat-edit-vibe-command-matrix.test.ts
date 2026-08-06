import { describe, expect, it } from 'vitest';

import { CHAT_TOOL_REGISTRY } from '@/lib/editron/agent/chat-tool-registry';
import { planChatBattleFixture } from '@/lib/editron/services/chat-edit-battle-fixture-plan';
import { CHAT_EDIT_BATTLE_SCENARIOS } from '@/lib/editron/services/chat-edit-battle-harness';

function requiredTools(): Set<string> {
  return new Set(
    CHAT_EDIT_BATTLE_SCENARIOS.flatMap((scenario) =>
      scenario.requiredToolSequence.flatMap((step) =>
        typeof step === 'string' ? [step] : [...step],
      ),
    ),
  );
}

describe('Editron vibe-editing command matrix', () => {
  it('covers every live chat tool with at least one explicit journey', () => {
    const required = requiredTools();
    const missing = Object.values(CHAT_TOOL_REGISTRY)
      .filter((tool) => tool.exposure === 'live-chat' && !required.has(tool.name))
      .map((tool) => tool.name)
      .sort();

    expect(missing).toEqual([]);
  });

  it('keeps shadow-authority tools out of executable battle journeys', () => {
    const required = requiredTools();
    const shadowAuthority = Object.values(CHAT_TOOL_REGISTRY)
      .filter((tool) => tool.exposure === 'shadow-authority-filtered')
      .map((tool) => tool.name)
      .sort();

    expect(shadowAuthority).toEqual([
      'add_fancy_captions',
      'add_motion_graphic',
      'add_transition',
      'analyze_clip_audio',
      'analyze_clip_video',
      'apply_style',
      'auto_edit_from_script',
      'auto_motion_graphics',
      'extract_style',
      'generate_html_scene',
      'refresh_fancy_captions',
    ]);
    expect(shadowAuthority.filter((tool) => required.has(tool))).toEqual([]);
  });

  it('uses unique scenario identities and prompts', () => {
    const ids = CHAT_EDIT_BATTLE_SCENARIOS.map((scenario) => scenario.id);
    const prompts = CHAT_EDIT_BATTLE_SCENARIOS.map((scenario) => scenario.prompt);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('runs every journey in an explicit product lane', () => {
    const modes = Object.fromEntries(
      CHAT_EDIT_BATTLE_SCENARIOS.map((scenario) => [
        scenario.id,
        planChatBattleFixture(scenario).projectMode,
      ]),
    );

    expect(modes['selected-overlay-edit']).toBe('auto');
    expect(modes['plain-caption-track']).toBe('assist');
    expect(modes['fancy-caption-track']).toBe('assist');
    expect(modes['dialogue-ducking']).toBe('assist');
    expect(modes['beat-sync-cuts']).toBe('assist');
  });

  it('makes read-only journeys mutation-proof and evidence-light', () => {
    const invalid = CHAT_EDIT_BATTLE_SCENARIOS
      .filter((scenario) =>
        scenario.mutationExpectation === 'forbidden'
        && !scenario.expectOperationReplay,
      )
      .filter((scenario) =>
        scenario.minimumSuccessfulMutations !== 0
        || scenario.requireEvidenceBeforeMutation
        || scenario.requireUiReload
        || scenario.requireRenderedEvidence,
      )
      .map((scenario) => scenario.id);

    expect(invalid).toEqual([]);
  });

  it('proves replay journeys from durable rejection and unchanged reloaded state', () => {
    const replayScenarios = CHAT_EDIT_BATTLE_SCENARIOS.filter(
      (scenario) => scenario.expectOperationReplay,
    );

    expect(replayScenarios.length).toBeGreaterThan(0);
    for (const scenario of replayScenarios) {
      expect(scenario).toMatchObject({
        mutationExpectation: 'forbidden',
        minimumSuccessfulMutations: 0,
        requiredToolSequence: [],
        requireEvidenceBeforeMutation: false,
        requireUiReload: true,
        requireRenderedEvidence: false,
      });
      expect(scenario.fixtureRequirements).toContain('prior-idempotency-record');
    }
  });

  it('keeps dependency-fault contracts deterministic instead of adding live backdoors', () => {
    const deterministicContracts = CHAT_EDIT_BATTLE_SCENARIOS.filter(
      (scenario) => scenario.executionLane === 'deterministic-contract',
    );

    expect(deterministicContracts.map((scenario) => scenario.id))
      .toEqual(['bgm-provider-failure']);
    for (const scenario of deterministicContracts) {
      expect(scenario.requireRenderedEvidence).toBe(false);
      expect(scenario.fixtureRequirements).toEqual([]);
      expect(scenario.requiredToolSequence.length).toBeGreaterThan(0);
    }
  });
});
