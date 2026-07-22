export const STORYLINE_MAX_OUTPUT_TOKENS = 16_384;

export interface StorylineGenerationRequest {
  contents: Array<{
    role: 'user';
    parts: Array<{ text: string }>;
  }>;
  generationConfig: {
    temperature: number;
    seed: number;
    responseMimeType: 'application/json';
    maxOutputTokens: number;
  };
}

interface StorylineGenerationResponse {
  text(): string;
  candidates?: Array<{ finishReason?: string }>;
}

export type StorylineJsonGenerator = (
  request: StorylineGenerationRequest,
) => Promise<{ response: StorylineGenerationResponse }>;

/**
 * Provider edge for the Storyline ordering pass. A truncated or blocked response is not a
 * usable ordering plan; throwing here lets the caller record an honest LLM fallback instead
 * of misclassifying provider truncation as malformed editorial reasoning.
 */
export async function completeStorylineJsonPrompt(
  prompt: string,
  generate: StorylineJsonGenerator,
): Promise<string> {
  const result = await generate({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      seed: 42,
      responseMimeType: 'application/json',
      maxOutputTokens: STORYLINE_MAX_OUTPUT_TOKENS,
    },
  });

  const finishReason = result.response.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`Storyline ordering response truncated at ${STORYLINE_MAX_OUTPUT_TOKENS} output tokens.`);
  }
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`Storyline ordering response stopped unexpectedly: ${finishReason}.`);
  }

  const text = result.response.text().trim();
  if (!text) throw new Error('Storyline ordering response was empty.');
  return text;
}
