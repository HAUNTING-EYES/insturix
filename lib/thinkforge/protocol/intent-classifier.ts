import { generateText } from 'ai';
import { createThinkForgeModel } from '../agents/model-factory';
import { ScriptIntent } from './intent';

// ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
const CLASSIFIER_PROMPT = `<role>You are a strict intent classifier.</role>
<task>Classify the user's request. Return ONLY one label: REWRITE, EDIT, CONTINUE, or FORK.</task>
<rules>
- REWRITE: start over, rewrite, discard existing content.
- CONTINUE: continue, add more, proceed to next part.
- EDIT: modify existing content, fix, adjust tone, refine.
- FORK: new version or branch while preserving original.
</rules>
<output_format>One word only. No additional text.</output_format>`;

function normalizeIntent(raw: string): ScriptIntent | null {
  const value = raw.trim().toUpperCase();
  if (value in ScriptIntent) {
    const intent = ScriptIntent[value as keyof typeof ScriptIntent];
    // FORK (new branch preserving the original) has no separate-document path yet, so it used to
    // dead-end at a 501 in /script/edit-blocks. Treat it as REWRITE (a new version in place) so the
    // request does something useful. True fork-to-new-document is a later feature.
    return intent === ScriptIntent.FORK ? ScriptIntent.REWRITE : intent;
  }
  return null;
}

export async function classifyIntent(input: {
  userMessage: string;
}): Promise<ScriptIntent> {
  const message = input.userMessage || '';

  try {
    const { text } = await generateText({
      model: createThinkForgeModel('gemini-2.5-flash'),
      temperature: 0,
      prompt: `${CLASSIFIER_PROMPT}\n\nUser: ${message}`,
    });

    const intent = normalizeIntent(text || '');
    if (intent) return intent;
  } catch (error) {
    console.error('[IntentClassifier] Failed to classify intent:', error);
  }

  // Default to CONTINUE (non-destructive) when classification fails.
  // EDIT was the prior default but it rewrites content — dangerous as a silent fallback.
  return ScriptIntent.CONTINUE;
}
