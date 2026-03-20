/**
 * Script-to-Scenes Converter
 *
 * Converts ThinkForge blocks, CIR documents, or plain-text scripts
 * into SceneDescriptor arrays that Editron can ingest.
 */

import type { ThinkForgeBlock, RichTextNode } from '@/lib/thinkforge/schemas/thinkforge-block';
import type { CIRDocument } from '@/lib/thinkforge/schemas/cir';
import type { SceneDescriptor } from './schemas/storyboard';

// ─── Helpers ────────────────────────────────────────────────────────

/** Extract plain text from a RichTextNode array. */
function richTextToPlain(nodes: RichTextNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return n.text ?? '';
      if (n.type === 'link') {
        return (n.content ?? []).map((c) => c.text ?? '').join('');
      }
      return '';
    })
    .join('')
    .trim();
}

/** Estimate narration duration from word count (~150 wpm). */
function estimateDuration(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round((words / 150) * 60));
}

/** Infer a mood keyword from text. */
function inferMood(text: string): string {
  const lower = text.toLowerCase();
  if (/excit|energi|hype|wow|amazing|intense|urgent|chaotic|rapid|escalat|relentless/i.test(lower)) return 'energetic';
  if (/calm|peace|relax|gentle|serene|soft|tranquil/i.test(lower)) return 'calm';
  if (/serious|import|critical|warn|grave|ominous|tension|dread|threat|sinister|grim|resolut/i.test(lower)) return 'serious';
  if (/fun|funny|humour|humor|laugh|joke|playful|whimsi/i.test(lower)) return 'playful';
  if (/sad|disappoint|unfortunat|mourn|grief|somber|melan|desolat|isolat|desperat/i.test(lower)) return 'somber';
  return 'neutral';
}

// ─── Meta-section detection ──────────────────────────────────────

/** Headers / titles that describe script structure, not actual scenes. */
const META_HEADER_KEYWORDS =
  /\b(overview|introduction|intro|core directives?|scene breakdown|forbidden elements?|notes|credits|preview|outro|closing remarks?|table of contents|agenda|disclaimer|references?|appendix|summary|conclusion|musical direction|music direction|project overview|general notes|style guide|tone guide|pacing guide|target audience|format|guidelines|requirements|specifications?)\b/i;

/**
 * Check whether a header/title is a meta / structural section rather
 * than an actual scene. Uses keyword matching (not exact match) so
 * titles like "Project Overview" or "Music & Audio Direction" are caught.
 */
function isMetaHeader(title: string): boolean {
  const cleaned = title.trim().replace(/^#+\s*/, '');
  if (!cleaned) return false;
  return META_HEADER_KEYWORDS.test(cleaned);
}

/**
 * Check if a section body looks like meta/structural content rather than
 * scene narration — e.g. "This document outlines the musical direction..."
 */
function isMetaContent(text: string): boolean {
  const lower = text.toLowerCase().substring(0, 300);
  return /\b(this document|this script|the goal is to create|outlines the|the following|no dialogue or exposition is permitted|music carries the full)\b/i.test(lower);
}

// ─── ThinkForge Blocks → Scenes ──────────────────────────────────

export function convertThinkForgeBlocksToScenes(
  blocks: ThinkForgeBlock[],
): SceneDescriptor[] {
  if (!blocks || blocks.length === 0) return [];

  const scenes: SceneDescriptor[] = [];
  let currentScene: Partial<SceneDescriptor> | null = null;
  /** True when we're inside a meta header — content is skipped. */
  let inMetaSection = false;
  let idx = 0;

  const flushScene = () => {
    if (!currentScene) return;
    const narration = currentScene.narration || '';
    // Skip scenes that have no real narration / visual content
    if (!narration.trim() && !(currentScene.visualDescription || '').trim()) return;
    // Skip scenes whose content reads like a meta description / preamble
    if (isMetaContent(narration)) return;
    scenes.push({
      sceneIndex: idx,
      title: currentScene.title || `Scene ${idx + 1}`,
      narration,
      visualDescription: currentScene.visualDescription || narration.substring(0, 200),
      durationSeconds: currentScene.durationSeconds || Math.min(estimateDuration(narration), 15),
      mood: currentScene.mood || inferMood(narration),
      cameraDirection: currentScene.cameraDirection,
    });
    idx++;
  };

  for (const block of blocks) {
    const text = richTextToPlain(block.content);
    if (!text) continue;

    if (block.kind === 'header') {
      if (isMetaHeader(text)) {
        // This is a structural header (Overview, Scene Breakdown, etc.)
        // — flush any real scene we were building and skip until next header.
        flushScene();
        currentScene = null;
        inMetaSection = true;
        continue;
      }
      // Real scene header
      flushScene();
      currentScene = { title: text, narration: '', visualDescription: '', mood: '' };
      inMetaSection = false;
    } else if (inMetaSection) {
      // Inside a meta section — skip content
      continue;
    } else if (currentScene) {
      if (block.kind === 'action') {
        // Action blocks describe visuals / camera directions
        currentScene.visualDescription =
          ((currentScene.visualDescription || '') + ' ' + text).trim();
        // Check for camera keywords
        if (/wide shot|close[- ]up|pan|zoom|tracking|dolly|crane|aerial/i.test(text)) {
          currentScene.cameraDirection =
            ((currentScene.cameraDirection || '') + ' ' + text).trim();
        }
      } else if (block.kind === 'why') {
        // "Why" blocks give mood / intent hints
        currentScene.mood = inferMood(text) !== 'neutral' ? inferMood(text) : currentScene.mood;
      } else {
        // paragraph / example → narration content
        currentScene.narration = ((currentScene.narration || '') + ' ' + text).trim();
      }
    } else {
      // No header yet — create implicit first scene only if it has real content
      currentScene = {
        title: `Scene 1`,
        narration: text,
        visualDescription: '',
        mood: '',
      };
    }
  }

  flushScene(); // flush last scene
  return scenes;
}

// ─── Timestamped Script Detection ───────────────────────────────

/**
 * Detect whether content uses a timestamped scene format like:
 *   00:00 - 00:15 | Scene Title
 *   HH:MM:SS - HH:MM:SS | Scene Title
 */
const TIMESTAMP_SCENE_RE =
  /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\|\s*(.+)/;

export function hasTimestampedScenes(content: string): boolean {
  return isTimestampedScript(content);
}

function isTimestampedScript(content: string): boolean {
  const lines = content.split('\n');
  let matches = 0;
  for (const line of lines) {
    if (TIMESTAMP_SCENE_RE.test(line.trim())) matches++;
    if (matches >= 2) return true;
  }
  return false;
}

/** Parse "MM:SS" or "HH:MM:SS" into total seconds. */
function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * Extract labelled sections from a scene body.
 * Recognises patterns like:
 *   **Visuals:**   / **Visual:**
 *   **Audio:**
 *   **Voiceover:** / **Voiceover (…):**  / **VO:**
 *   **Narration:** / **Narrator:**
 * Returns { visuals, audio, voiceover, other }
 */
function extractLabelledSections(body: string): {
  visuals: string;
  audio: string;
  voiceover: string;
  other: string;
} {
  // Match **Label:** or **Label (extra):** at start of line
  const labelRe = /^\*{0,2}(Visuals?|Audio|Voiceover|VO|Narrat(?:ion|or)|Sound)\s*(?:\([^)]*\))?\s*:?\*{0,2}\s*:?\s*/im;
  const lines = body.split('\n');
  let currentLabel = 'other';
  const buckets: Record<string, string[]> = { visuals: [], audio: [], voiceover: [], other: [] };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Check if this line starts a labelled section
    const labelMatch = line.match(labelRe);
    if (labelMatch) {
      const key = labelMatch[1].toLowerCase();
      if (key.startsWith('visual')) currentLabel = 'visuals';
      else if (key === 'audio' || key === 'sound') currentLabel = 'audio';
      else if (key.startsWith('vo') || key.startsWith('narrat')) currentLabel = 'voiceover';
      // Strip the label prefix and keep the rest
      const rest = line.replace(labelRe, '').trim();
      if (rest) buckets[currentLabel].push(rest);
    } else {
      // Strip markdown bold, timestamp prefixes like "**00:00-00:02:**"
      const cleaned = line
        .replace(/^\*{2}\d{2}:\d{2}(?::\d{2})?[-–—]\d{2}:\d{2}(?::\d{2})?\s*:?\*{2}\s*:?\s*/, '')
        .replace(/^\*{2,}|^\*{2,}$/g, '')
        .trim();
      if (cleaned) buckets[currentLabel].push(cleaned);
    }
  }

  return {
    visuals: buckets.visuals.join(' ').trim(),
    audio: buckets.audio.join(' ').trim(),
    voiceover: buckets.voiceover.join(' ').trim(),
    other: buckets.other.join(' ').trim(),
  };
}

/**
 * Parse a timestamped script format (as produced by ThinkForge):
 *
 *   # Title
 *   Overview …
 *   ## Scene Breakdown
 *   00:00 - 00:15 | Public Outcry
 *   **Visuals:** …
 *   **Audio:** …
 *   **Voiceover:** …
 *   00:15 - 00:35 | On The Run
 *   …
 */
function convertTimestampedScriptToScenes(content: string): SceneDescriptor[] {
  const lines = content.split('\n');
  const rawScenes: Array<{
    title: string;
    startSec: number;
    endSec: number;
    bodyLines: string[];
  }> = [];

  let current: (typeof rawScenes)[number] | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const tsMatch = line.match(TIMESTAMP_SCENE_RE);
    if (tsMatch) {
      // Flush previous scene
      if (current) rawScenes.push(current);
      current = {
        title: tsMatch[3].trim(),
        startSec: parseTimestamp(tsMatch[1]),
        endSec: parseTimestamp(tsMatch[2]),
        bodyLines: [],
      };
    } else if (current) {
      current.bodyLines.push(line);
    }
    // Lines before the first timestamp (overview/title) are ignored for scenes
  }
  if (current) rawScenes.push(current);

  return rawScenes.map((raw, i) => {
    const bodyText = raw.bodyLines.join('\n');
    const sections = extractLabelledSections(bodyText);
    const durationSeconds = Math.max(3, raw.endSec - raw.startSec);

    // Narration = voiceover text. If none found, fall back to other content.
    const narration = sections.voiceover || sections.other || '';
    // Visual description = visuals section (for storyboard image gen)
    const visualDescription = sections.visuals || narration.substring(0, 300);
    // Mood from audio description + visual description
    const moodSource = sections.audio + ' ' + sections.visuals;

    return {
      sceneIndex: i,
      title: raw.title,
      narration,
      visualDescription,
      durationSeconds,
      mood: inferMood(moodSource) !== 'neutral' ? inferMood(moodSource) : inferMood(narration),
      cameraDirection: extractCameraDirections(sections.visuals),
      audioDescription: sections.audio || undefined,
    };
  });
}

/** Extract camera direction keywords from visual description text. */
function extractCameraDirections(text: string): string | undefined {
  if (!text) return undefined;
  const camKeywords =
    /(?:extreme\s+)?close[- ]?up|wide\s+shot|medium\s+shot|pan(?:ning)?|zoom|tracking\s+shot|dolly|crane|aerial|POV|overhead|establishing\s+shot|montage|rapid[- ]?cut|quick\s+cut/gi;
  const matches = text.match(camKeywords);
  return matches ? [...new Set(matches)].join(', ') : undefined;
}

// ─── Plain Text → Scenes ─────────────────────────────────────────

export function convertPlainTextToScenes(content: string): SceneDescriptor[] {
  if (!content || !content.trim()) return [];

  // If the script uses timestamps (ThinkForge format), use the smart parser
  if (isTimestampedScript(content)) {
    return convertTimestampedScriptToScenes(content);
  }

  // Fallback: split by markdown headers or double newlines
  const sections = content
    .split(/(?=^#{1,3}\s)|(?:\n\s*\n)/m)
    .map((s) => s.trim())
    .filter(Boolean);

  // Filter out meta-sections that aren't actual scenes
  const sceneSections = sections.filter((s) => {
    const firstLine = s.split('\n')[0]?.replace(/^#+\s*/, '').trim() || '';
    // Skip if the header itself is meta
    if (isMetaHeader(firstLine)) return false;
    // Skip sections that are just a title with no body (e.g. "# Spider-Man: No Way Home")
    const body = s.replace(/^#{1,3}\s+.+\n?/, '').trim();
    if (!body) return false;
    // Skip sections whose body reads like a document preamble / overview
    if (isMetaContent(body)) return false;
    return true;
  });

  const finalSections = sceneSections.length > 0 ? sceneSections : sections;

  return finalSections.map((section, i) => {
    // Extract title from first line if it's a header
    const headerMatch = section.match(/^#{1,3}\s+(.+)/m);
    const title = headerMatch ? headerMatch[1].trim() : `Scene ${i + 1}`;
    const body = headerMatch ? section.replace(/^#{1,3}\s+.+\n?/, '').trim() : section;

    // Try to extract labelled sections even in non-timestamped scripts
    const labelled = extractLabelledSections(body);
    // Only use actual voiceover/narration text for narration — NOT visual
    // descriptions, audio notes, or camera directions which inflate duration.
    const narration = labelled.voiceover || body;
    const visualDescription = labelled.visuals || narration.substring(0, 250);
    // Duration should reflect spoken words only. If we have labelled voiceover
    // use that word count; otherwise use full body but cap at 15s per scene.
    const durationText = labelled.voiceover || body;
    const rawDuration = estimateDuration(durationText);
    const durationSeconds = labelled.voiceover ? rawDuration : Math.min(rawDuration, 15);

    return {
      sceneIndex: i,
      title,
      narration,
      visualDescription,
      durationSeconds,
      mood: inferMood(body),
      cameraDirection: extractCameraDirections(labelled.visuals),
    };
  });
}

// ─── CIR → Scenes ────────────────────────────────────────────────

/**
 * CIR sections use label + body. We group by "Header" sections
 * (each Header starts a new scene) and aggregate Action/Why/Example
 * bodies under it.
 */
export function convertCIRToScenes(cir: CIRDocument): SceneDescriptor[] {
  if (!cir?.sections || cir.sections.length === 0) return [];

  const scenes: SceneDescriptor[] = [];
  let current: { title: string; narration: string; visual: string; mood: string } | null = null;
  let idx = 0;

  const flush = () => {
    if (!current) return;
    scenes.push({
      sceneIndex: idx,
      title: current.title,
      narration: current.narration,
      visualDescription: current.visual || current.narration.substring(0, 250),
      durationSeconds: estimateDuration(current.narration),
      mood: current.mood || inferMood(current.narration),
    });
    idx++;
  };

  for (const section of cir.sections) {
    const body = section.body || '';
    if (section.label === 'Header') {
      flush();
      current = { title: body, narration: '', visual: '', mood: '' };
    } else if (current) {
      if (section.label === 'Action') {
        current.visual = (current.visual + ' ' + body).trim();
      } else if (section.label === 'Why') {
        current.mood = inferMood(body) !== 'neutral' ? inferMood(body) : current.mood;
      } else {
        current.narration = (current.narration + ' ' + body).trim();
      }
    } else {
      // No header yet — start implicit scene
      current = { title: cir.title || 'Opening', narration: body, visual: '', mood: '' };
    }
  }

  flush();
  return scenes;
}
