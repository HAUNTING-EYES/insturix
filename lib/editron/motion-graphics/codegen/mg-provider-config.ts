export type MgComponentProviderName = 'gemini' | 'zai';

export const DEFAULT_MG_COMPONENT_MODEL = 'gemini-3.1-pro-preview';
export const LEGACY_GLM_COMPONENT_MODEL = 'glm-5v-turbo';

type EnvLike = Record<string, string | undefined>;

export function resolveMgComponentModel(env: EnvLike = process.env): string {
  return env.MG_CODEGEN_MODEL?.trim() || DEFAULT_MG_COMPONENT_MODEL;
}

export function resolveMgComponentProviderName(model: string): MgComponentProviderName | null {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith('gemini-')) return 'gemini';
  if (normalized === LEGACY_GLM_COMPONENT_MODEL) return 'zai';
  return null;
}

export function assertProductionMgUsesGemini(input: {
  componentModel: string;
  visualJudgeProvider: string;
}): void {
  if (input.componentModel !== DEFAULT_MG_COMPONENT_MODEL) {
    throw new Error(
      `MG Sandbox: production component writer must use ${DEFAULT_MG_COMPONENT_MODEL}; received ${input.componentModel}`,
    );
  }
  if (input.visualJudgeProvider !== 'gemini') {
    throw new Error(
      `MG Sandbox: production visual judge must use Gemini; received ${input.visualJudgeProvider}`,
    );
  }
}
