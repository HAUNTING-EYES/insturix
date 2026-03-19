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
  if (/excit|energi|hype|wow|amazing/i.test(lower)) return 'energetic';
  if (/calm|peace|relax|gentle/i.test(lower)) return 'calm';
  if (/serious|import|critical|warn/i.test(lower)) return 'serious';
  if (/fun|funny|humour|humor|laugh|joke/i.test(lower)) return 'playful';
  if (/sad|disappoint|unfortunat/i.test(lower)) return 'somber';
  return 'neutral';
}

// ─── ThinkForge Blocks → Scenes ──────────────────────────────────

export function convertThinkForgeBlocksToScenes(
  blocks: ThinkForgeBlock[],
): SceneDescriptor[] {
  if (!blocks || blocks.length === 0) return [];

  const scenes: SceneDescriptor[] = [];
  let currentScene: Partial<SceneDescriptor> | null = null;
  let idx = 0;

  const flushScene = () => {
    if (!currentScene) return;
    const narration = currentScene.narration || '';
    scenes.push({
      sceneIndex: idx,
      title: currentScene.title || `Scene ${idx + 1}`,
      narration,
      visualDescription: currentScene.visualDescription || narration.substring(0, 200),
      durationSeconds: currentScene.durationSeconds || estimateDuration(narration),
      mood: currentScene.mood || inferMood(narration),
      cameraDirection: currentScene.cameraDirection,
    });
    idx++;
  };

  for (const block of blocks) {
    const text = richTextToPlain(block.content);
    if (!text) continue;

    if (block.kind === 'header') {
      // Headers mark scene boundaries
      flushScene();
      currentScene = { title: text, narration: '', visualDescription: '', mood: '' };
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
      // No header yet — create implicit first scene
      currentScene = {
        title: 'Opening',
        narration: text,
        visualDescription: '',
        mood: '',
      };
    }
  }

  flushScene(); // flush last scene
  return scenes;
}

// ─── Plain Text → Scenes ─────────────────────────────────────────

export function convertPlainTextToScenes(content: string): SceneDescriptor[] {
  if (!content || !content.trim()) return [];

  // Split by markdown headers or double newlines
  const sections = content
    .split(/(?=^#{1,3}\s)|(?:\n\s*\n)/m)
    .map((s) => s.trim())
    .filter(Boolean);

  return sections.map((section, i) => {
    // Extract title from first line if it's a header
    const headerMatch = section.match(/^#{1,3}\s+(.+)/m);
    const title = headerMatch ? headerMatch[1].trim() : `Scene ${i + 1}`;
    const body = headerMatch ? section.replace(/^#{1,3}\s+.+\n?/, '').trim() : section;

    return {
      sceneIndex: i,
      title,
      narration: body,
      visualDescription: body.substring(0, 250),
      durationSeconds: estimateDuration(body),
      mood: inferMood(body),
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
