/**
 * MG Codegen — DESIGN-THEN-CODE Phase C (production): the real DESIGNER model call.
 *
 * runVideoDesignSession (design-session.ts) takes an INJECTED `generate(parts) => text` so the brain stays pure
 * and unit-testable with a fake. This is the default production adapter: it hits Gemini with the multimodal
 * designer parts and returns the raw text the session parses. Mirrors imagery-client.ts's DI shape ("testable
 * with a fake, provider-swappable") and the EXACT call shape eval-mg-designer.ts verified live
 * (gemini-3.1-pro-preview, temperature 0, maxOutputTokens 16384, parts → contents[0].parts, text joined).
 *
 * FAIL LOUD (R18N): an HTTP error, a non-STOP finishReason, or an empty response throws — runVideoDesignSession
 * catches it, retries once, and on a second failure returns { plan: null } so every offered MG is explicitly
 * unavailable. A bad designer call can never fabricate a plan or restore legacy/free-form graphic authority.
 */

import type { MgDesignerGenerate } from './design-session';
import type { MgDesignerPart } from './designer-prompt';

/** The verified production designer model (eval-mg-designer.ts, live). Overridable for a bake-off / provider swap. */
export const DEFAULT_MG_DESIGNER_MODEL = 'gemini-3.1-pro-preview';

/** Map a provider-neutral designer part to the Gemini generateContent part shape (text | inlineData). */
function toGeminiPart(part: MgDesignerPart): { text: string } | { inlineData: { mimeType: string; data: string } } {
  return part.kind === 'text'
    ? { text: part.text }
    : { inlineData: { mimeType: part.mimeType, data: part.data } };
}

/**
 * The default Gemini designer call — the live-verified generateContent shape. Returns the model's raw text
 * (the design-plan JSON, possibly fenced); the session owns extraction + validation + retry.
 */
export function defaultGeminiDesignerGenerate(
  env: Record<string, string | undefined> = process.env,
): MgDesignerGenerate {
  const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error('MG designer: missing GEMINI_API_KEY / GOOGLE_API_KEY');
  const model = env.MG_DESIGNER_GEMINI_MODEL?.trim() || DEFAULT_MG_DESIGNER_MODEL;
  return async (parts: MgDesignerPart[]): Promise<string> => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: parts.map(toGeminiPart) }],
          generationConfig: { temperature: 0, maxOutputTokens: 16_384 },
        }),
      },
    );
    if (!res.ok) throw new Error(`MG designer: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (json.error) throw new Error(`MG designer: ${json.error.message?.slice(0, 200)}`);
    const candidate = json.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`MG designer: finishReason=${candidate.finishReason}`);
    }
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text.trim()) throw new Error('MG designer: response contained no text');
    return text;
  };
}
