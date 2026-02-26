type Range = { startSec: number, endSec: number } | null;

export function parseTimeToSeconds(time: string): number {
  // supports "hh:mm:ss", "mm:ss", "ss" (also "10s", "2m", "1m30s")
  time = time.trim();
  if (/^\d+[sm]$/i.test(time)) {
    const m = time.match(/(\d+)([sm])/i)!;
    return m[2].toLowerCase() === 'm' ? Number(m[1]) * 60 : Number(m[1]);
  }
  const parts = time.split(':').map(Number);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  throw new Error('Invalid time format');
}

export function formatSecondsToHHMMSS(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function parsePromptTimeRange(prompt: string, projectFps = 30, maxSeconds = 120): Range {
  if (!prompt || !prompt.trim()) return null;
  const p = prompt.toLowerCase();

  // 1) explicit range with hyphen or "to": 00:00-00:10 or 00:00 to 00:10
  const hyphen = p.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (hyphen) {
    const s = parseTimeToSeconds(hyphen[1]);
    const e = parseTimeToSeconds(hyphen[2]);
    return normalizeRange(s, e, maxSeconds);
  }
  const toMatch = p.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:to|-)\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (toMatch) {
    const s = parseTimeToSeconds(toMatch[1]);
    const e = parseTimeToSeconds(toMatch[2]);
    return normalizeRange(s, e, maxSeconds);
  }

  // 2) "first N seconds/minutes"
  const first = p.match(/first\s+(\d+)\s*(seconds|secs|s|minutes|mins|m)?/);
  if (first) {
    const value = Number(first[1]);
    const unit = first[2] || 'seconds';
    const sec = /m/i.test(unit) ? value * 60 : value;
    return normalizeRange(0, sec, maxSeconds);
  }

  // 3) "from X for Y" e.g., "from 00:10 for 30s" or "at 00:10 for 20s"
  const fromFor = p.match(/(?:from|at)\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+\s*[sm]?)[\s,]*(?:for)?\s*(\d+\s*[sm]?)/);
  if (fromFor) {
    const s = isNaN(Number(fromFor[1])) && fromFor[1].includes(':') ? parseTimeToSeconds(fromFor[1]) : parseTimeToSeconds(fromFor[1].replace(/\s+/g,''));
    const e = s + parseTimeToSeconds(fromFor[2].replace(/\s+/g,''));
    return normalizeRange(s, e, maxSeconds);
  }

  // 4) single time or single "Xs" like "analyze 30s" -> treat as start at 0 for that duration
  const durationOnly = p.match(/(\d+)\s*(seconds|secs|s|minutes|mins|m)\b/);
  if (durationOnly) {
    const val = Number(durationOnly[1]);
    const sec = /m/i.test(durationOnly[2]) ? val * 60 : val;
    return normalizeRange(0, sec, maxSeconds);
  }

  // nothing reliable found
  return null;
}

export function normalizeRange(startSec: number, endSec: number, maxSeconds: number): Range {
  if (startSec < 0) startSec = 0;
  if (endSec <= startSec) endSec = startSec + Math.min( Math.max(1, endSec - startSec), maxSeconds );
  const dur = Math.min(maxSeconds, endSec - startSec);
  return { startSec, endSec: startSec + dur };
}

export function framesToSeconds(frames: number, fps: number): number {
  if (!Number.isFinite(frames)) return 0;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`Invalid fps value: ${fps}`);
  }
  return frames / fps;
}
