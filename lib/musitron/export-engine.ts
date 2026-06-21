import type { DAWProject } from "./daw-types";

export type ExportFormat = "wav" | "mp3" | "flac";
export type WavBitDepth = 16 | 24 | 32;

export interface ExportOptions {
  format: ExportFormat;
  bitDepth?: WavBitDepth;
  mp3Bitrate?: number;
  sampleRate?: number;
  onProgress?: (phase: string, progress: number) => void;
}

export async function exportProject(
  project: DAWProject,
  options: ExportOptions,
): Promise<Blob> {
  const { format, sampleRate = 44100, onProgress } = options;

  onProgress?.("Mixing tracks...", 0);
  const audioBuffer = await renderOffline(project, sampleRate, (p) => {
    onProgress?.("Mixing tracks...", p * 0.5);
  });

  onProgress?.("Encoding...", 0.5);
  const wavBlob = encodeWav(audioBuffer, options.bitDepth ?? 16);

  if (format === "wav") {
    onProgress?.("Done", 1);
    return wavBlob;
  }

  onProgress?.("Encoding to " + format.toUpperCase() + "...", 0.6);
  const encoded = await encodeWithFFmpeg(wavBlob, format, options);
  onProgress?.("Done", 1);
  return encoded;
}

async function renderOffline(
  project: DAWProject,
  sampleRate: number,
  onProgress?: (p: number) => void,
): Promise<AudioBuffer> {
  let totalDuration = 1;
  for (const track of project.tracks) {
    for (const region of track.regions) {
      const end = region.startTime + region.duration;
      if (end > totalDuration) totalDuration = end;
    }
    for (const midiRegion of (track.midiRegions ?? [])) {
      if (midiRegion.muted) continue;
      const end = midiRegion.startTime + midiRegion.duration;
      if (end > totalDuration) totalDuration = end;
    }
  }
  totalDuration += 0.5;

  const ctx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  const masterGain = ctx.createGain();
  masterGain.gain.value = project.masterBus.gain;
  masterGain.connect(ctx.destination);

  const soloedIds = new Set(
    project.tracks.filter((t) => t.mixer.solo).map((t) => t.id),
  );
  const hasSolo = soloedIds.size > 0;

  let totalRegions = 0;
  for (const track of project.tracks) {
    const isMuted = hasSolo
      ? !soloedIds.has(track.id)
      : track.mixer.mute;
    if (isMuted) continue;
    for (const region of track.regions) {
      if (!region.muted) totalRegions++;
    }
  }

  let loaded = 0;

  for (const track of project.tracks) {
    const isMuted = hasSolo
      ? !soloedIds.has(track.id)
      : track.mixer.mute;
    if (isMuted) continue;

    const trackGain = ctx.createGain();
    trackGain.gain.value = track.mixer.gain;
    const trackPan = ctx.createStereoPanner();
    trackPan.pan.value = track.mixer.pan;
    trackGain.connect(trackPan);
    trackPan.connect(masterGain);

    for (const region of track.regions) {
      if (region.muted) continue;

      try {
        const response = await fetch(region.sourceUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const regionGainNode = ctx.createGain();
        regionGainNode.gain.value = region.gain;
        source.connect(regionGainNode);
        regionGainNode.connect(trackGain);

        source.start(region.startTime, region.sourceOffset, region.duration);
      } catch (err) {
        console.error(`[ExportEngine] Failed to load region ${region.id}:`, err);
      }

      loaded++;
      if (totalRegions > 0) onProgress?.(loaded / totalRegions);
    }
  }

  return ctx.startRendering();
}

function encodeWav(buffer: AudioBuffer, bitDepth: WavBitDepth): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const dataSize = length * numChannels * bytesPerSample;
  const totalSize = 44 + dataSize;

  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeStr(view, 8, "WAVE");

  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);

  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      if (bitDepth === 16) {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      } else if (bitDepth === 24) {
        const val = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF);
        view.setUint8(offset, val & 0xFF);
        view.setUint8(offset + 1, (val >> 8) & 0xFF);
        view.setUint8(offset + 2, (val >> 16) & 0xFF);
      } else {
        view.setFloat32(offset, sample, true);
      }
      offset += bytesPerSample;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

async function encodeWithFFmpeg(
  wavBlob: Blob,
  format: "mp3" | "flac",
  options: ExportOptions,
): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL, fetchFile } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  const wavData = await fetchFile(wavBlob);
  await ffmpeg.writeFile("input.wav", wavData);

  const outputFile = `output.${format}`;
  if (format === "mp3") {
    const bitrate = `${options.mp3Bitrate ?? 320}k`;
    await ffmpeg.exec(["-i", "input.wav", "-b:a", bitrate, "-y", outputFile]);
  } else {
    await ffmpeg.exec(["-i", "input.wav", "-y", outputFile]);
  }

  const data = await ffmpeg.readFile(outputFile);
  ffmpeg.terminate();

  const mimeType = format === "mp3" ? "audio/mpeg" : "audio/flac";
  if (typeof data === "string") {
    return new Blob([data], { type: mimeType });
  }
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  return new Blob([ab], { type: mimeType });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
