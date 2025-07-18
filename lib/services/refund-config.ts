export interface RefundMapping {
  [serviceName: string]: {
    [taskType: string]: string[];
  };
}

export const REFUND_MAPPING: RefundMapping = {
  clickatron: {
    thumbnail_gen: ['maxThumbnailGeneration'],
    // Add more task types and their usage keys here
  },
  alyzitron: {
    analysis: ['maxTotalAnalysis'],
    analysis_long: ['maxTotalAnalysis','maxOver20MinuteAnalysis'],
    // Add more task types and their usage keys here
  }
};