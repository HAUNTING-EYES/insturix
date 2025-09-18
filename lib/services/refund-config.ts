export interface RefundMapping {
  [serviceName: string]: {
    [taskType: string]: string[];
  };
}

export const REFUND_MAPPING: RefundMapping = {
  clickatron: {
    variation_gen: ['maxVariationGeneration'],
    prompt_enhance: ['maxPromptEnhancements'],
  },
  alyzitron: {
    analysis: ['AnalysisMinutes'],
    analysis_long: ['AnalysisMinutes'],
  },
  musitron: {
    music_generation: ['maxMusicGeneration'],
  }
};