/**
 * knob-parser-cases - the eval fixture for the prompt->knob parser (Rule 35: cases before deploy).
 * Each case is a user request + the knobs a careful human would say are EXPLICITLY stated. The
 * suite is deliberately weighted toward HALLUCINATION TRAPS (vibe-only prompts whose expected
 * answer is {}), because inventing a knob is the parser's worst failure. Consumed by the vitest
 * unit suite (offline) and the live-LLM eval runner (Phase 2).
 *
 * Multilingual by design: prompts include Hinglish / non-English so extraction is not English-only.
 */

import type { RequestedKnobs } from './prompt-knob-parser';

export interface KnobCase {
  id: string;
  prompt: string;
  expected: RequestedKnobs;
  /** Why this case exists - the specific behavior it pins. */
  note: string;
}

export const KNOB_CASES: readonly KnobCase[] = [
  // ── fully-specified ──
  {
    id: 'tiktok-30s-vertical-2x',
    prompt: 'punchy 30-second vertical cut for TikTok, make two versions',
    expected: { platform: 'tiktok', targetDurationSec: 30, aspectRatio: '9:16', count: 2 },
    note: 'the headline case - platform + duration + explicit "vertical" + count all stated ("punchy" is NOT a knob).',
  },
  {
    id: 'yt-widescreen-explicit',
    prompt: 'a 10 minute YouTube video, widescreen',
    expected: { platform: 'youtube', targetDurationSec: 600, aspectRatio: '16:9' },
    note: 'minutes -> seconds; "widescreen" -> 16:9 explicitly stated.',
  },

  // ── hallucination traps (expected {}) ──
  {
    id: 'vibe-snappy',
    prompt: 'make it snappy and clean',
    expected: {},
    note: 'pure vibe words state NO platform, duration, or aspect. Inventing any = damage-8 hallucination.',
  },
  {
    id: 'vibe-pop',
    prompt: 'something that really pops, very professional and modern',
    expected: {},
    note: 'style/mood only. Must not infer "professional" -> LinkedIn or 16:9.',
  },
  {
    id: 'vague-social',
    prompt: 'edit this for social media',
    expected: {},
    note: '"social media" is not a platform enum value and is ambiguous - omit platform (resolver infers).',
  },
  {
    id: 'vague-short',
    prompt: 'keep it short and make it good',
    expected: {},
    note: '"short" is not a duration. Must not invent 15s/30s/60s.',
  },

  // ── partials (one knob only) ──
  {
    id: 'platform-only-reels',
    prompt: 'turn this into an Instagram reel',
    expected: { platform: 'instagram-reels' },
    note: 'platform stated; aspect NOT stated -> omit aspectRatio (resolver derives 9:16 from platform).',
  },
  {
    id: 'count-only',
    prompt: 'give me three different versions of this',
    expected: { count: 3 },
    note: 'count only; nothing else stated.',
  },
  {
    id: 'duration-under-a-minute',
    prompt: 'cut it down to under a minute',
    expected: { targetDurationSec: 60 },
    note: '"under a minute" = a stated 60s bound; no platform/aspect.',
  },
  {
    id: 'aspect-only-square',
    prompt: 'I need a square version',
    expected: { aspectRatio: '1:1' },
    note: '"square" -> 1:1 explicitly; no platform stated.',
  },

  // ── languages (multilingual) ──
  {
    id: 'hindi-vo-english-captions',
    prompt: 'make a reel with Hindi voiceover and English captions',
    expected: { platform: 'instagram-reels', voiceLanguages: ['hi'], captionLanguages: ['en'] },
    note: 'ISO codes; voice vs caption language separated; "reel" -> instagram-reels.',
  },
  {
    id: 'hinglish-request',
    prompt: 'ek 15 second ka vertical short banao YouTube ke liye',
    expected: { platform: 'youtube-shorts', targetDurationSec: 15, aspectRatio: '9:16' },
    note: 'Hinglish request must parse as well as English; "short" here = the YouTube Shorts format, "vertical" -> 9:16.',
  },

  // ── deliverables ──
  {
    id: 'reel-plus-thumbnail',
    prompt: 'a 20s TikTok and also a thumbnail',
    expected: { platform: 'tiktok', targetDurationSec: 20, deliverables: ['thumbnail'] },
    note: 'a named extra output beyond the cut goes to deliverables.',
  },

  // ── overreach guard: a platform-adjacent brand word that is NOT a knob ──
  {
    id: 'brand-mention-not-platform',
    prompt: "match our brand's usual style, whatever length works",
    expected: {},
    note: '"whatever length works" explicitly DEFERS duration - must stay unset; brand style is not a knob here.',
  },
];
