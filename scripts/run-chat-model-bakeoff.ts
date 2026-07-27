import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildChatModelBakeoffInput,
  scoreChatModelRouting,
} from '@/lib/editron/agent/chat-model-bakeoff';
import {
  createGeminiOwnerGenerator,
  createKimiOwnerGenerator,
} from '@/lib/editron/agent/chat-model-providers';
import {
  CHAT_MODEL_NAME,
} from '@/lib/editron/utils/gemini-model-factory';
import {
  classifyChatRequestOwner,
} from '@/lib/editron/agent/chat-request-owner';
import {
  CHAT_EDIT_BATTLE_SCENARIOS,
} from '@/lib/editron/services/chat-edit-battle-harness';

interface ModelSpec {
  id: string;
  generate?: ReturnType<typeof createGeminiOwnerGenerator>;
}

interface ScenarioResult {
  scenarioId: string;
  latencyMs: number;
  status: 'passed' | 'failed' | 'error';
  score?: ReturnType<typeof scoreChatModelRouting>;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

const args = parseArgs(process.argv.slice(2));
const models = resolveModels(args.models);
const wantedScenarios = args.scenarios
  ? new Set(args.scenarios)
  : null;
const scenarios = CHAT_EDIT_BATTLE_SCENARIOS
  .filter((scenario) => scenario.executionLane === 'live')
  .filter((scenario) => !wantedScenarios || wantedScenarios.has(scenario.id))
  .slice(0, args.limit ?? Number.POSITIVE_INFINITY);

if (scenarios.length === 0) {
  throw new Error('No live chat battle scenarios matched the requested filters');
}

const report = {
  version: 'editron-chat-model-bakeoff-v1',
  generatedAt: new Date().toISOString(),
  scenarioCount: scenarios.length,
  models: [] as Array<{
    model: string;
    passed: number;
    failed: number;
    errors: number;
    averageLatencyMs: number;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    results: ScenarioResult[];
  }>,
};

for (const model of models) {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const startedAt = performance.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    const addUsage = (usage: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    }) => {
      inputTokens += usage.promptTokenCount ?? 0;
      outputTokens += usage.candidatesTokenCount ?? 0;
      totalTokens += usage.totalTokenCount
        ?? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0);
    };
    try {
      const license = await classifyChatRequestOwner(
        buildChatModelBakeoffInput(scenario),
        model.generate ? { generate: model.generate, addUsage } : { addUsage },
      );
      const score = scoreChatModelRouting(scenario, license);
      results.push({
        scenarioId: scenario.id,
        latencyMs: Math.round(performance.now() - startedAt),
        status: score.passed ? 'passed' : 'failed',
        score,
        usage: totalTokens > 0 ? { inputTokens, outputTokens, totalTokens } : undefined,
      });
    } catch (error) {
      results.push({
        scenarioId: scenario.id,
        latencyMs: Math.round(performance.now() - startedAt),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        usage: totalTokens > 0 ? { inputTokens, outputTokens, totalTokens } : undefined,
      });
    }
  }

  report.models.push({
    model: model.id,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    errors: results.filter((result) => result.status === 'error').length,
    averageLatencyMs: Math.round(
      results.reduce((total, result) => total + result.latencyMs, 0) / results.length,
    ),
    usage: results.reduce(
      (total, result) => ({
        inputTokens: total.inputTokens + (result.usage?.inputTokens ?? 0),
        outputTokens: total.outputTokens + (result.usage?.outputTokens ?? 0),
        totalTokens: total.totalTokens + (result.usage?.totalTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    ),
    results,
  });
}

const outputPath = path.resolve(
  args.out ?? `.artifacts/chat-model-bakeoff-${Date.now()}.json`,
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const model of report.models) {
  console.log(
    `${model.model}: ${model.passed}/${report.scenarioCount} routing passes, `
      + `${model.failed} failures, ${model.errors} provider errors, `
      + `${model.averageLatencyMs}ms average, ${model.usage.totalTokens} tokens`,
  );
}
console.log(`Report: ${outputPath}`);

function resolveModels(requested: string[] | undefined): ModelSpec[] {
  const ids = requested ?? [CHAT_MODEL_NAME, 'gemini-3.5-flash', 'kimi-k3'];
  return ids.map((id) => {
    if (id === CHAT_MODEL_NAME || id === 'current') {
      return { id: CHAT_MODEL_NAME };
    }
    if (id.startsWith('gemini-')) {
      return { id, generate: createGeminiOwnerGenerator({ model: id }) };
    }
    if (id === 'kimi-k3') {
      return { id, generate: createKimiOwnerGenerator() };
    }
    throw new Error(`Unsupported bakeoff model: ${id}`);
  });
}

function parseArgs(argv: string[]): {
  models?: string[];
  scenarios?: string[];
  limit?: number;
  out?: string;
} {
  const parsed: {
    models?: string[];
    scenarios?: string[];
    limit?: number;
    out?: string;
  } = {};
  for (const arg of argv) {
    if (arg.startsWith('--models=')) {
      parsed.models = csv(arg.slice('--models='.length));
    } else if (arg.startsWith('--scenarios=')) {
      parsed.scenarios = csv(arg.slice('--scenarios='.length));
    } else if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isFinite(value) || value <= 0) throw new Error('--limit must be positive');
      parsed.limit = value;
    } else if (arg.startsWith('--out=')) {
      parsed.out = arg.slice('--out='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function csv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
