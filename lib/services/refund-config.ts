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
    analysis: ['maxTotalAnalysis'],
    analysis_long: ['maxTotalAnalysis','maxOver20MinuteAnalysis'],
  },
  musitron: {
    music_generation: ['maxMusicGeneration'],
  }
};