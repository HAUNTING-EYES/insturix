const FPS = 30;
const SAMPLE_RATE = 48_000;

export const HOLDOUT_VISUAL_ASSET_IDS_V2R = [
  'h01-clock', 'h01-dial', 'h02-door', 'h02-process', 'h03-a', 'h03-b',
  'h03-ref', 'h04-host', 'h05-subject', 'h06-office', 'h07-card', 'h08-runner',
] as const;

type Rgb = [number, number, number];

export function renderHoldoutFrameV2R(
  assetId: string,
  frame: number,
  width: number,
  height: number,
  frameCount: number,
): Buffer {
  if (!(HOLDOUT_VISUAL_ASSET_IDS_V2R as readonly string[]).includes(assetId)) {
    throw new Error(`HOLDOUT_VISUAL_ASSET_UNSUPPORTED:${assetId}`);
  }
  if (!Number.isInteger(frame) || frame < 0 || frame >= frameCount
    || !Number.isInteger(width) || width < 16 || !Number.isInteger(height) || height < 16) {
    throw new Error(`HOLDOUT_VISUAL_COORDINATES_INVALID:${assetId}`);
  }
  const rgb = Buffer.alloc(width * height * 3);
  const progress = frameCount <= 1 ? 0 : frame / (frameCount - 1);
  fill(rgb, 15, 20, 30);

  if (assetId === 'h01-clock' || assetId === 'h01-dial') {
    const clock = assetId === 'h01-clock';
    const phase = clock ? clamp((frame - 80) / 70) : clamp((frame - 30) / 90);
    const x = clock ? lerp(0.16, 0.5, phase) : lerp(0.5, 0.84, phase);
    const radius = Math.round(height * 0.18);
    circle(rgb, width, height, x, 0.5, radius, clock ? [224, 187, 74] : [92, 188, 217]);
    circle(rgb, width, height, x, 0.5, Math.round(radius * 0.72), [24, 31, 45]);
    line(rgb, width, height, x, 0.5, x, 0.37, 4, [242, 242, 230]);
    line(rgb, width, height, x, 0.5, x + 0.08, 0.55, 4, [242, 242, 230]);
  } else if (assetId === 'h02-door') {
    fill(rgb, 49, 43, 39);
    rect(rgb, width, height, 0.2, 0.08, 0.6, 0.84, [16, 18, 24]);
    const open = frame < 180 ? clamp((frame - 30) / 75) : 1 - clamp((frame - 240) / 75);
    rect(rgb, width, height, 0.2, 0.08, 0.6 * (1 - 0.82 * open), 0.84, [137, 80, 48]);
  } else if (assetId === 'h02-process') {
    const section = Math.min(2, Math.floor(frame / Math.max(1, frameCount / 3)));
    const colors: Rgb[] = [[58, 121, 173], [121, 75, 157], [46, 150, 105]];
    fill(rgb, ...colors[section]);
    const x = 0.18 + 0.62 * ((progress * 3) % 1);
    if (section === 0) circle(rgb, width, height, x, 0.42, Math.round(width * 0.11), [242, 210, 122]);
    if (section === 1) rect(rgb, width, height, x - 0.1, 0.30, 0.2, 0.34, [235, 228, 215]);
    if (section === 2) line(rgb, width, height, 0.12, 0.72, x, 0.28, 10, [250, 205, 75]);
  } else if (assetId === 'h03-a') {
    fill(rgb, 45, 55, 70);
    for (let index = 0; index < 5; index += 1) {
      circle(rgb, width, height, 0.14 + index * 0.18, 0.34 + 0.08 * (index % 2), Math.round(width * 0.055), [210, 156 + index * 9, 128]);
    }
    rect(rgb, width, height, 0.1 + progress * 0.62, 0.70, 0.16, 0.09, [59, 139, 220]);
  } else if (assetId === 'h03-b') {
    fill(rgb, 74, 48, 82);
    circle(rgb, width, height, 0.5 + 0.08 * Math.sin(progress * Math.PI * 2), 0.38, Math.round(width * 0.18), [232, 177, 137]);
    rect(rgb, width, height, 0.31, 0.56, 0.38, 0.38, [86, 132, 176]);
  } else if (assetId === 'h03-ref') {
    fill(rgb, 0, 0, 0);
    rect(rgb, width, height, 0.03, 0.03, 0.27, 0.94, [59, 85, 121]);
    rect(rgb, width, height, 0.33, 0.03, 0.34, 0.29, [119, 67, 96]);
    rect(rgb, width, height, 0.70, 0.03, 0.27, 0.44, [119, 84, 54]);
    rect(rgb, width, height, 0.70, 0.50, 0.27, 0.47, [67, 74, 119]);
    rect(rgb, width, height, 0.33, 0.35, 0.34, 0.62, [52, 106, 91]);
    rect(rgb, width, height, 0.20, 0.44, 0.60, 0.07, [252, 218, 45]);
    rect(rgb, width, height, 0.28, 0.54, 0.44, 0.045, [252, 218, 45]);
  } else if (assetId === 'h04-host') {
    fill(rgb, 28, 42, 58);
    circle(rgb, width, height, 0.36, 0.33, Math.round(height * 0.12), [231, 180, 141]);
    rect(rgb, width, height, 0.24, 0.46, 0.24, 0.44, [45, 112, 177]);
    const activeTake = frame >= 120 && frame < 192 ? 0 : frame >= 225 && frame < 297 ? 1 : -1;
    if (activeTake >= 0) rect(rgb, width, height, 0.56, 0.68, activeTake ? 0.30 : 0.22, 0.045, activeTake ? [75, 211, 139] : [235, 126, 87]);
  } else if (assetId === 'h05-subject') {
    fill(rgb, 48, 59, 67);
    const x = lerp(0.18, 0.82, progress);
    circle(rgb, width, height, x, 0.32, Math.round(height * 0.105), [230, 177, 137]);
    rect(rgb, width, height, x - 0.075, 0.43, 0.15, 0.40, [62, 137, 198]);
  } else if (assetId === 'h06-office') {
    fill(rgb, 208, 211, 205);
    rect(rgb, width, height, 0.05, 0.62, 0.90, 0.12, [96, 79, 65]);
    for (let index = 0; index < 3; index += 1) {
      circle(rgb, width, height, 0.24 + index * 0.25, 0.42, Math.round(height * 0.075), [183, 126 + index * 12, 104]);
    }
  } else if (assetId === 'h07-card') {
    const section = Math.min(2, Math.floor(progress * 3));
    const colors: Rgb[] = [[41, 96, 159], [126, 70, 143], [43, 143, 104]];
    fill(rgb, ...colors[section]);
    rect(rgb, width, height, 0.22, 0.32, 0.56, 0.36, [239, 235, 221]);
  } else {
    const stripe = Math.floor(progress * 12) % 2;
    fill(rgb, stripe ? 58 : 32, 45, stripe ? 70 : 50);
    const x = lerp(0.08, 0.92, progress);
    circle(rgb, width, height, x, 0.32, Math.round(height * 0.08), [224, 137, 84]);
    rect(rgb, width, height, x - 0.045, 0.40, 0.09, 0.30, [48, 121, 196]);
    line(rgb, width, height, x - 0.02, 0.68, x - 0.10, 0.90, 6, [224, 137, 84]);
    line(rgb, width, height, x + 0.02, 0.68, x + 0.11, 0.88, 6, [224, 137, 84]);
  }
  return rgb;
}

export function synthesizeHoldout04AudioV2R(durationFrames = 540): Buffer {
  if (!Number.isInteger(durationFrames) || durationFrames < 298) throw new Error('HOLDOUT_AUDIO_DURATION_INVALID');
  const samples = Math.round(durationFrames / FPS * SAMPLE_RATE);
  const pcm = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const time = index / SAMPLE_RATE;
    const frame = time * FPS;
    const inFirst = frame >= 120 && frame < 192;
    const inSecond = frame >= 225 && frame < 297;
    const syllable = Math.floor(frame / 12) % 4;
    const voice = inFirst || inSecond
      ? 0.22 * Math.sin(2 * Math.PI * (150 + syllable * 35) * time)
      : 0.008 * Math.sin(2 * Math.PI * 70 * time);
    pcm.writeInt16LE(Math.round(voice * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function lerp(start: number, end: number, amount: number): number { return start + (end - start) * clamp(amount); }
function fill(buffer: Buffer, red: number, green: number, blue: number): void {
  for (let offset = 0; offset < buffer.length; offset += 3) {
    buffer[offset] = red; buffer[offset + 1] = green; buffer[offset + 2] = blue;
  }
}
function rect(buffer: Buffer, width: number, height: number, x: number, y: number, w: number, h: number, color: Rgb): void {
  const left = Math.max(0, Math.floor(x * width)); const right = Math.min(width, Math.ceil((x + w) * width));
  const top = Math.max(0, Math.floor(y * height)); const bottom = Math.min(height, Math.ceil((y + h) * height));
  for (let py = top; py < bottom; py += 1) for (let px = left; px < right; px += 1) {
    const offset = (py * width + px) * 3;
    buffer[offset] = color[0]; buffer[offset + 1] = color[1]; buffer[offset + 2] = color[2];
  }
}
function circle(buffer: Buffer, width: number, height: number, x: number, y: number, radius: number, color: Rgb): void {
  const cx = Math.round(x * width); const cy = Math.round(y * height);
  for (let py = Math.max(0, cy - radius); py < Math.min(height, cy + radius); py += 1) {
    for (let px = Math.max(0, cx - radius); px < Math.min(width, cx + radius); px += 1) {
      if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) {
        const offset = (py * width + px) * 3;
        buffer[offset] = color[0]; buffer[offset + 1] = color[1]; buffer[offset + 2] = color[2];
      }
    }
  }
}
function line(buffer: Buffer, width: number, height: number, x1: number, y1: number, x2: number, y2: number, thickness: number, color: Rgb): void {
  const steps = Math.max(1, Math.ceil(Math.hypot((x2 - x1) * width, (y2 - y1) * height)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    circle(buffer, width, height, lerp(x1, x2, t), lerp(y1, y2, t), Math.max(1, Math.floor(thickness / 2)), color);
  }
}
