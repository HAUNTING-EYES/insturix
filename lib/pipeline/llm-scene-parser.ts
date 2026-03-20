/**
 * LLM-based Scene Parser
 *
 * Uses Gemini Flash to intelligently extract scenes from any script format.
 * Replaces fragile regex parsing — handles meta sections, markdown, timestamps,
 * and arbitrary script structures reliably.
 *
 * Cost: ~$0.0001 per script (Gemini Flash at $0.075/1M tokens, ~1500 tokens/script)
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─── Schema ──────────────────────────────────────────────────────

const SceneSchema = z.object({
  title: z.string().describe('Short cinematic scene title (2-6 words, no markdown, no "Scene 1" generic labels)'),
  narration: z.string().describe('The voiceover/narration text spoken aloud during this scene. Must be the actual spoken words only — no stage directions, no visual descriptions.'),
  visualDescription: z.string().describe('Detailed visual description for AI image generation: what the viewer sees, lighting, colors, composition, camera angle. Be specific and cinematic.'),
  videoMotionPrompt: z.string().describe('Motion/animation prompt for AI video generation: describe camera movement, subject motion, particle effects, transitions. Use cinematic language like "slow dolly forward", "rack focus", "gentle parallax".'),
  audioDescription: z.string().describe('Background audio/sound effects for this scene (not voiceover): ambient sounds, music mood, sfx.'),
  durationSeconds: z.number().describe('Scene duration in seconds based on voiceover pacing (~150 words/minute). Minimum 3s, maximum 15s.'),
  mood: z.enum(['energetic', 'calm', 'serious', 'playful', 'mysterious', 'dramatic', 'inspirational', 'neutral']),
});

const ParseResultSchema = z.object({
  scenes: z.array(SceneSchema).min(1).max(20),
  overallMusicPrompt: z.string().describe('Overall background music style/mood for the entire video. E.g. "cinematic orchestral with building tension" or "upbeat electronic pop with driving beat"'),
});

export type ParsedScene = z.infer<typeof SceneSchema>;
export type LLMParseResult = z.infer<typeof ParseResultSchema>;

// ─── Parser ──────────────────────────────────────────────────────

function getGeminiProvider() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key found (GEMINI_API_KEY or GOOGLE_API_KEY)');
  return createGoogleGenerativeAI({ apiKey });
}

/**
 * Parse a script into scenes using Gemini Flash.
 * Handles any format: ThinkForge blocks, markdown, timestamped, plain text.
 */
export async function parseScriptWithLLM(
  scriptText: string,
  options: {
    aspectRatio?: string;
    artStyle?: string;
    targetDuration?: number; // total video duration in seconds
  } = {},
): Promise<LLMParseResult> {
  const google = getGeminiProvider();
  const model = google('gemini-2.0-flash');

  const { object } = await generateObject({
    model,
    schema: ParseResultSchema,
    prompt: `You are a premium video production director. Extract ONLY the actual visual scenes from this script and produce output optimized for AI generation.

CRITICAL RULES:
- IGNORE all meta sections: project overview, creative direction, style guide, target audience, format notes, platform info, production notes, branding guidelines, any section that describes the document itself rather than a scene.
- ONLY extract scenes that would appear as footage in the final video.
- Scene titles should be SHORT and CINEMATIC (e.g. "City Night Chase", "Holographic Display"), never generic like "Scene 1" or "Introduction".
- Narration must be ONLY the spoken voiceover words — not visual descriptions or stage directions. Write natural, conversational voiceover that sounds premium.

IMAGE PROMPT RULES (visualDescription):
- Write as a detailed AI image generation prompt, NOT a script direction.
- Include: specific subject/product, setting details, lighting type (golden hour, neon, studio), colors, composition (rule of thirds, centered, close-up), camera angle (low angle, bird's eye, eye level), atmosphere.
- Be SPECIFIC and DETAILED. Instead of "a watch on a table", write "luxury silver chronograph watch with blue dial resting on polished marble surface, warm studio key light from upper left, shallow depth of field, dark moody background with soft bokeh".
- Avoid abstract concepts — describe what the camera literally SEES.
- IMPORTANT: Keep the main subject/product CONSISTENT across all scenes. Describe the same subject with the same key visual details (color, shape, distinguishing features) every time it appears.
${options.artStyle ? `- Art style for ALL scenes: ${options.artStyle}. Every visual description MUST be written in this style. Do NOT default to photorealistic unless that is the specified style.` : '- Match the visual style to what makes sense for the script content.'}

VIDEO MOTION RULES (videoMotionPrompt):
- Describe SUBTLE, CINEMATIC motion for 5-second AI video clips. AI video models work best with SLOW, DELIBERATE movement.
- GOOD examples: "Slow dolly push-in, light reflections gently shifting, shallow depth of field with soft background blur", "Gentle camera orbit around subject, volumetric light rays, dust particles floating"
- BAD: "Fast zoom, explosion, rapid cuts" — AI video models can't handle fast/complex motion.
- Always include: camera motion (push-in, pull-back, orbit, pan, static), subject movement (subtle), lighting shifts, atmospheric effects.
- Keep motion minimal and elegant.

- Duration should reflect voiceover length at ~150 words per minute. If no voiceover, use 5-8 seconds.
- The total video should be approximately ${options.targetDuration || 30} seconds.
${options.aspectRatio ? `- Aspect ratio: ${options.aspectRatio}. Consider framing in visual descriptions.` : ''}

SCRIPT:
${scriptText.substring(0, 8000)}`,
  });

  return object;
}

// ─── Subject Extraction ─────────────────────────────────────────

const SubjectSchema = z.object({
  id: z.string().describe('Unique kebab-case identifier, e.g. "silver-chronograph-watch"'),
  name: z.string().describe('Human-readable name, e.g. "Luxury Silver Chronograph Watch"'),
  category: z.enum(['character', 'product', 'location', 'object', 'vehicle']),
  visualDescription: z.string().describe('Detailed visual description for generating a reference image of this subject IN ISOLATION: appearance, colors, materials, textures, distinguishing features. Describe against a clean neutral background with studio lighting.'),
  scenesAppearingIn: z.array(z.number()).describe('Scene indices (0-based) where this subject appears'),
});

const SubjectExtractionSchema = z.object({
  subjects: z.array(SubjectSchema).min(1).max(10),
});

export type ExtractedSubject = z.infer<typeof SubjectSchema>;
export type SubjectExtractionResult = z.infer<typeof SubjectExtractionSchema>;

/**
 * Extract key visual subjects from parsed scenes.
 * These will be used to generate reference images for visual consistency.
 */
export async function extractSubjectsFromScenes(
  scenes: Array<{ title: string; narration: string; visualDescription: string; sceneIndex: number }>,
  options: { artStyle?: string } = {},
): Promise<SubjectExtractionResult> {
  const google = getGeminiProvider();
  const model = google('gemini-2.0-flash');

  const scenesSummary = scenes
    .map((s, i) => `Scene ${i}: "${s.title}" — ${s.visualDescription.substring(0, 200)}`)
    .join('\n');

  const { object } = await generateObject({
    model,
    schema: SubjectExtractionSchema,
    prompt: `You are a video pre-production AI. Analyze these scenes and identify the KEY VISUAL SUBJECTS that need to look consistent across the video.

RULES:
- Only extract subjects that appear in 2 or more scenes (consistency matters for recurring subjects).
- Focus on TANGIBLE visual subjects: characters, products, vehicles, specific locations, key objects.
- Do NOT extract abstract concepts, emotions, or generic items like "table" or "sky".
- For each subject, write a visualDescription as an AI IMAGE GENERATION PROMPT for a REFERENCE SHEET:
  - Describe the subject in isolation against a clean neutral/white background
  - Include: exact colors, materials, textures, proportions, distinguishing details
  - Studio lighting, sharp focus, multiple angles if it's a product
  - Example: "Luxury silver chronograph watch with midnight blue dial, polished steel bracelet, sapphire crystal, date window at 3 o'clock, clean white background, studio product photography, sharp focus"
${options.artStyle ? `- Art style: ${options.artStyle}. Describe subjects in this visual style.` : ''}

SCENES:
${scenesSummary}`,
  });

  return object;
}

/**
 * Check if LLM parsing is available.
 */
export function isLLMParserAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
