import {
  assertProviderPromptAllowed,
  type ProviderPrivacyAuditRecord,
  type ProviderPrivacyClass,
  type ProviderRoutePurpose,
} from './provider-privacy-gateway';

export interface ThinkForgeProviderPromptRoute {
  provider: string;
  model: string;
  routePurpose: ProviderRoutePurpose;
  privacyClass: ProviderPrivacyClass;
}

export interface ThinkForgeProviderPromptDispatch {
  systemInstruction: string;
  prompt: string;
  promptChars: number;
  audit: ProviderPrivacyAuditRecord;
}

export function prepareThinkForgeProviderPromptDispatch(input: {
  route: ThinkForgeProviderPromptRoute;
  systemInstruction: string;
  prompt: string;
  fieldsSent?: string[];
  now?: Date | string;
}): ThinkForgeProviderPromptDispatch {
  const boundary = createPrivacyEnvelopeBoundary(input.systemInstruction, input.prompt);
  const combinedPrompt = `${input.systemInstruction}${boundary}${input.prompt}`;
  const decision = assertProviderPromptAllowed({
    provider: input.route.provider,
    model: input.route.model,
    routePurpose: input.route.routePurpose,
    declaredPrivacyClass: input.route.privacyClass,
    prompt: combinedPrompt,
    fieldsSent: input.fieldsSent ?? (input.systemInstruction ? ['system', 'prompt'] : ['prompt']),
    now: input.now,
  });
  const boundaryIndex = decision.prompt.indexOf(boundary);
  const hasOneBoundary = boundaryIndex >= 0
    && decision.prompt.indexOf(boundary, boundaryIndex + boundary.length) < 0;
  if (!hasOneBoundary) {
    throw new Error('Provider privacy gateway returned an invalid prompt envelope');
  }

  const systemInstruction = decision.prompt.slice(0, boundaryIndex);
  const prompt = decision.prompt.slice(boundaryIndex + boundary.length);
  return {
    systemInstruction,
    prompt,
    promptChars: systemInstruction.length + prompt.length,
    audit: decision.audit,
  };
}

function createPrivacyEnvelopeBoundary(systemInstruction: string, prompt: string): string {
  let suffix = 0;
  let boundary = '';
  do {
    boundary = `\n<tf_privacy_boundary_${systemInstruction.length}_${prompt.length}_${suffix}>\n`;
    suffix += 1;
  } while (systemInstruction.includes(boundary) || prompt.includes(boundary));
  return boundary;
}
