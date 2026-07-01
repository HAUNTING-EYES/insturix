import { describe, expect, it } from 'vitest';
import {
  assertUsableScriptWriterResult,
  type ScriptWriterResult,
} from '@/lib/thinkforge/agents/script-writer-agent';

const canonicalScript = `## Scene 1: The stalled launch
**Narration:** Ops teams do not lose a launch in one dramatic failure. They lose it in tiny approval loops that never get owned.
**Visual:** Split screen of scattered comments, calendar slips, and one owner moving cards into a single approval lane.

## Scene 2: The cleaner lane
**Narration:** Put one person in charge of final feedback, and the team stops rewriting the same decision five times.
**Visual:** Clean production board with one highlighted approval owner and a finished asset moving to publish.`;

function makeResult(overrides: Partial<ScriptWriterResult> = {}): ScriptWriterResult {
  return {
    content: canonicalScript,
    contentAnalysis: {
      hooks: ['approval loops cost launches'],
      theme: 'single-owner approvals',
      emphasisPoints: ['hidden cost', 'ownership fix'],
      qualityScore: 92,
    },
    visualMetadata: {
      motionInfo: 'restrained documentary pacing with clean interface closeups',
      scenePrompts: [
        'Scene 1 visual: scattered comments, slipped calendar, stalled launch board, anxious ops team.',
        'Scene 2 visual: one approval owner, clean board, finished asset moving toward publish.',
      ],
    },
    metadata: {
      estimatedTimeSeconds: 42,
      platform: 'instagram',
    },
    ...overrides,
  };
}

describe('assertUsableScriptWriterResult', () => {
  it('accepts canonical markdown scene scripts that can hydrate a script board', () => {
    expect(() => assertUsableScriptWriterResult(makeResult())).not.toThrow();
  });

  it('rejects raw ThinkForge block dumps inside the script content field', () => {
    const rawBlockDump = JSON.stringify({
      blocks: [
        { kind: 'header', content: [{ type: 'text', text: 'Scene 1: The stalled launch' }] },
        { kind: 'paragraph', content: [{ type: 'text', text: 'This is not a usable script board.' }] },
      ],
    });

    expect(() => assertUsableScriptWriterResult(makeResult({ content: rawBlockDump }))).toThrow(
      /schema_artifact_content/,
    );
  });

  it('rejects prose that has no scene contract for downstream boards', () => {
    const blocklessProse = [
      'The launch slipped because every team member thought someone else had the final say.',
      'The stronger move is to assign one approval owner before production begins, then route every objection through that owner.',
      'That makes the creative path visible, reduces duplicate feedback, and gives the publish team a real finish line.',
    ].join(' ');

    expect(() => assertUsableScriptWriterResult(makeResult({ content: blocklessProse }))).toThrow(
      /missing_scene_headers/,
    );
  });

  it('rejects scripts whose scene prompts cannot map one-to-one to scenes', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          visualMetadata: {
            motionInfo: 'restrained documentary pacing',
            scenePrompts: ['Only one prompt for two script scenes.'],
          },
        }),
      ),
    ).toThrow(/scene_prompt_count_mismatch:1\/2/);
  });
});