import {
  filterChatToolsForRequestOwner,
  type ChatRequestOwnerLicense,
  type ClassifyChatRequestOwnerInput,
} from '@/lib/editron/agent/chat-request-owner';
import { CHAT_TOOL_REGISTRY } from '@/lib/editron/agent/chat-tool-registry';
import type {
  ChatBattleScenario,
} from '@/lib/editron/services/chat-edit-battle-harness';

export interface ChatModelRoutingScore {
  scenarioId: string;
  passed: boolean;
  owner: ChatRequestOwnerLicense['owner'];
  semanticWorkflow?: ChatRequestOwnerLicense['semanticWorkflow'];
  requiredSteps: Array<{
    alternatives: string[];
    reachable: boolean;
  }>;
  forbiddenToolLeaks: string[];
  licensedTools: string[];
}

const TOOL_STUBS = Object.keys(CHAT_TOOL_REGISTRY).map((name) => ({ name }));

export function buildChatModelBakeoffInput(
  scenario: ChatBattleScenario,
): ClassifyChatRequestOwnerInput {
  const mentionsSelectedTarget = /\bselected\b/i.test(scenario.prompt);
  return {
    userMessage: scenario.prompt,
    restoreStatus: scenario.id.startsWith('undo-') ? 'ready' : 'no-intent',
    selectedOverlayPresent: mentionsSelectedTarget,
    visualEvidencePresent: false,
    attachments: [],
  };
}

export function scoreChatModelRouting(
  scenario: ChatBattleScenario,
  license: ChatRequestOwnerLicense,
): ChatModelRoutingScore {
  const licensedTools = filterChatToolsForRequestOwner(TOOL_STUBS, license, {
    assistLane: scenario.projectMode === 'assist',
  }).map((tool) => tool.name);
  const licensed = new Set(licensedTools);
  const requiredSteps = scenario.requiredToolSequence.map((step) => {
    const alternatives = typeof step === 'string' ? [step] : [...step];
    return {
      alternatives,
      reachable: alternatives.some((toolName) => licensed.has(toolName)),
    };
  });
  const forbiddenToolLeaks = scenario.forbiddenTools.filter((toolName) => licensed.has(toolName));

  return {
    scenarioId: scenario.id,
    passed: requiredSteps.every((step) => step.reachable) && forbiddenToolLeaks.length === 0,
    owner: license.owner,
    semanticWorkflow: license.semanticWorkflow,
    requiredSteps,
    forbiddenToolLeaks,
    licensedTools,
  };
}
