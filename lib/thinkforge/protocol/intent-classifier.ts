import { generateText } from 'ai';
import { createThinkForgeModel } from '../agents/model-factory';
import { ScriptIntent } from './intent';

const CLASSIFIER_PROMPT = `You are a strict classifier. Decide the intent of the user's request.
Return ONLY one of: REWRITE, EDIT, CONTINUE, FORK.
Rules:
- REWRITE: user asks to start over, rewrite, or discard existing content.
- CONTINUE: user asks to continue, add more, or proceed to the next part.
- EDIT: user asks to modify existing content, fix, adjust tone, refine.
- FORK: user asks for a new version or branch while preserving the original.
No additional text.`;

function normalizeIntent(raw: string): ScriptIntent | null {
  const value = raw.trim().toUpperCase();
  if (value in ScriptIntent) {
    return ScriptIntent[value as keyof typeof ScriptIntent];
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

  // Safe default
  return ScriptIntent.EDIT;
}
