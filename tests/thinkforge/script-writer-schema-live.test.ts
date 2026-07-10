/**
 * LIVE verification that Gemini ACCEPTS the ScriptWriter response schema.
 *
 * Regression guard for the P0 crash: a numeric z.literal (sidecarVersion) in the sidecar
 * schema became a numeric enum in Gemini's response_schema, which only supports STRING enums
 * -> 400 "generation_config.response_schema...enum[0] (TYPE_STRING), 1" -> every video-script
 * generation failed. This drives the REAL path (generateObject with ScriptWriterResultSchema)
 * and asserts Gemini does not reject the schema.
 *
 * Opt-in (never a CI network call): RUN_LIVE_EVAL=1 + a Google key.
 *   RUN_LIVE_EVAL=1 GEMINI_API_KEY=... npx vitest run tests/thinkforge/script-writer-schema-live.test.ts
 */

import { generateObject } from 'ai';
import { describe, expect, it } from 'vitest';

import { createThinkForgeModelForRoute } from '@/lib/thinkforge/agents/model-factory';
import { ScriptWriterResultSchema } from '@/lib/thinkforge/agents/script-writer-agent';

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
  it('Gemini accepts the response schema (no numeric-enum 400)', async () => {
    const model = createThinkForgeModelForRoute({
      routePurpose: 'creative_authoring',
      privacyClass: 'business_confidential',
    });

    let errMsg = '';
    try {
      await generateObject({
        model,
        schema: ScriptWriterResultSchema,
        prompt:
          'Write a minimal 2-scene, 10-second talking-head video script about making coffee. ' +
          'One host character. Keep every field short.',
      });
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    console.log(errMsg ? `[schema-live] non-schema error (OK for this check): ${errMsg.slice(0, 200)}` : '[schema-live] Gemini accepted the schema and generated an object');
    expect(isSchemaRejection(errMsg), `Gemini REJECTED the schema: ${errMsg}`).toBe(false);
  }, 120_000);
});
