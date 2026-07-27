export const DETERMINISTIC_GEMINI_THOUGHT_SIGNATURE =
  'skip_thought_signature_validator' as const;

export interface DeterministicGeminiFunctionCall {
  name: string;
  args: unknown;
}

export function buildDeterministicGeminiFunctionCallPart(
  toolCall: DeterministicGeminiFunctionCall,
) {
  return {
    functionCall: {
      name: toolCall.name,
      args: toolCall.args,
    },
    thoughtSignature: DETERMINISTIC_GEMINI_THOUGHT_SIGNATURE,
  };
}
