export interface WaveformPeaks {
  peaks: Float32Array;
  length: number;
  duration: number;
}

const peakCache = new Map<string, WaveformPeaks>();

export function getCachedPeaks(key: string): WaveformPeaks | undefined {
  return peakCache.get(key);
}

export async function extractPeaks(
  url: string,
  resolution: number = 512,
): Promise<WaveformPeaks> {
  const cached = peakCache.get(url);
  if (cached && cached.length >= resolution) return cached;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const channelData = audioBuffer.getChannelData(0);
  const secondChannel = audioBuffer.numberOfChannels > 1
    ? audioBuffer.getChannelData(1)
    : null;

  const samplesPerPeak = Math.max(1, Math.floor(channelData.length / resolution));
  const actualPeaks = Math.ceil(channelData.length / samplesPerPeak);
  const peaks = new Float32Array(actualPeaks * 2);

  for (let i = 0; i < actualPeaks; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);
    let min = 1;
    let max = -1;

    for (let j = start; j < end; j++) {
      let sample = channelData[j];
      if (secondChannel) {
        sample = (sample + secondChannel[j]) * 0.5;
      }
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    peaks[i * 2] = min;
    peaks[i * 2 + 1] = max;
  }

  const result: WaveformPeaks = { peaks, length: actualPeaks, duration: audioBuffer.duration };
  peakCache.set(url, result);
  return result;
}

export function clearPeakCache(): void {
  peakCache.clear();
}
