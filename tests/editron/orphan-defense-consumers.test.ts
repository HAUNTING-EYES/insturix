import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Editron orphan defense consumer contracts', () => {
  it('keeps load-bearing defenses wired to live producers', () => {
    const contracts = [
      {
        name: 'MG CRG repair gate',
        owner: 'lib/editron/motion-graphics/engine/crg-constraint-validator.ts',
        consumer: 'lib/editron/motion-graphics/engine/composition-planner.ts',
        ownerPattern: /export function validateRecipeConstraints\(/,
        consumerPattern: /validateRecipeConstraints\(/,
      },
      {
        name: 'MG correctness eval',
        owner: 'lib/editron/motion-graphics/engine/eval/correctness.ts',
        consumer: 'lib/editron/motion-graphics/engine/composition-planner.ts',
        ownerPattern: /export function scoreCorrectness\(/,
        consumerPattern: /scoreCorrectness\(/,
      },
      {
        name: 'repetition intent discriminator',
        owner: 'lib/editron/services/repetition-intent-discriminator.ts',
        consumer: 'lib/editron/services/raw-footage-processor.ts',
        ownerPattern: /export function classifyRepetitionIntent\(/,
        consumerPattern: /classifyRepetitionIntent\(/,
      },
      {
        name: 'caption preset registry',
        owner: 'lib/editron/services/caption-preset-registry.ts',
        consumer: 'lib/editron/services/canonical-caption-track.ts',
        ownerPattern: /export function selectCaptionPreset\(/,
        consumerPattern: /selectCaptionPreset\(/,
      },
      {
        name: 'decision outcome bandit feedback',
        owner: 'lib/editron/services/threshold-bandit.ts',
        consumer: 'app/api/services/editron/cloudrun/render/route.ts',
        ownerPattern: /export async function processDecisionOutcomes\(/,
        consumerPattern: /processDecisionOutcomes\(/,
      },
      {
        name: 'decision snapshots',
        owner: 'lib/editron/services/decision-tracker.ts',
        consumer: 'lib/editron/agent/director-agent.ts',
        ownerPattern: /export function snapshotDecisions\(/,
        consumerPattern: /snapshotDecisions\(/,
      },
    ];

    for (const contract of contracts) {
      expect(source(contract.owner), `${contract.name} owner`).toMatch(contract.ownerPattern);
      expect(source(contract.consumer), `${contract.name} consumer`).toMatch(contract.consumerPattern);
    }
  });

  it('does not keep old LLM cut-authority services as fake defenses', () => {
    const retiredServices = [
      'lib/editron/services/argument-structure-protector.ts',
      'lib/editron/services/holistic-editor.ts',
      'lib/editron/services/gemma-editorial-service.ts',
    ];

    for (const retiredService of retiredServices) {
      expect(existsSync(join(process.cwd(), retiredService)), retiredService).toBe(false);
    }
  });
});