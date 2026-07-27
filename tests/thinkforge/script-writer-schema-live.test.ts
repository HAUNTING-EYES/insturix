/**
 * LIVE verification that Gemini ACCEPTS the ScriptWriter response schema.
 *
 * Regression guard for the P0 crash: a numeric z.literal (sidecarVersion) in the sidecar
 * schema became a numeric enum in Gemini's response_schema, which only supports STRING enums
 * -> 400 "generation_config.response_schema...enum[0] (TYPE_STRING), 1" -> every video-script
 * generation failed. This drives the REAL path (generateObject with ScriptWriterModelOutputSchema)
 * and asserts Gemini does not reject the schema.
 *
 * Opt-in (never a CI network call): RUN_LIVE_EVAL=1 + a Google key.
 *   RUN_LIVE_EVAL=1 GEMINI_API_KEY=... npx vitest run tests/thinkforge/script-writer-schema-live.test.ts
 */

import { generateObject } from 'ai';
import { describe, expect, it } from 'vitest';

import { createThinkForgeModelForRoute } from '@/lib/thinkforge/agents/model-factory';
import {
  materializeScriptWriterResult,
  ScriptWriterAgent,
  ScriptWriterModelOutputSchema,
} from '@/lib/thinkforge/agents/script-writer-agent';

const HAS_KEY = !!(
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY
);
const RUN_LIVE = HAS_KEY && process.env.RUN_LIVE_EVAL === '1';

/** True only for a schema-level rejection (the bug), NOT content/validation/quota errors. */
function isSchemaRejection(message: string): boolean {
  return /response_schema|generation_config\.response_schema|enum\[\d+\]|TYPE_STRING/i.test(message);
}

describe.skipIf(!RUN_LIVE)('ScriptWriter schema is Gemini-compatible', () => {
  it('Gemini accepts the real writer schema and returns a materializable result', async () => {
    const model = createThinkForgeModelForRoute({
      routePurpose: 'creative_authoring',
      privacyClass: 'business_confidential',
    });
    const writer = new ScriptWriterAgent();
    let errMsg = '';

    try {
      const generation = await generateObject({
        model,
        schema: ScriptWriterModelOutputSchema,
        prompt: writer.buildPrompt({
          context: { projectSummary: 'A simple coffee tutorial for social video.' },
          userPrompt: 'Write a 2-scene, 12-second coffee tutorial. Use narrator voiceover only; no on-camera dialogue.',
        }),
        maxOutputTokens: 8192,
        temperature: 0.2,
      });
      const result = materializeScriptWriterResult(generation.object);
      expect(result.content.match(/^## Scene \d+/gm)).toHaveLength(2);
      expect(result.visualMetadata.scenePrompts).toHaveLength(2);
    } catch (error: unknown) {
      errMsg = error instanceof Error ? error.message : String(error);
    }

    console.log(errMsg ? `[schema-live] writer generation failed: ${errMsg.slice(0, 200)}` : '[schema-live] Gemini returned a materializable writer result');
    expect(isSchemaRejection(errMsg), `Gemini REJECTED the schema: ${errMsg}`).toBe(false);
    expect(errMsg, `Gemini failed the real writer output contract: ${errMsg}`).toBe('');
  }, 120_000);
});
