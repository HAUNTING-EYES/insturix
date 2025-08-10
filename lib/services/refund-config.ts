export interface RefundMapping {
  [serviceName: string]: {
    [taskType: string]: string[];
  };
}

export const REFUND_MAPPING: RefundMapping = {
  clickatron: {
    thumbnail_gen: ['maxThumbnailGeneration'],
  },
  alyzitron: {
    analysis: ['AnalysisMinutes'],
    analysis_long: ['AnalysisMinutes'],
  },
  musitron: {
    music_generation: ['maxMusicGeneration'],
  }
};