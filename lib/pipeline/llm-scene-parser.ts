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
    prompt: `You are a premium video production director. Extract ONLY the actual visual scenes from this script and produce cinematic output.

CRITICAL RULES:
- IGNORE all meta sections: project overview, creative direction, style guide, target audience, format notes, platform info, production notes, branding guidelines, any section that describes the document itself rather than a scene.
- ONLY extract scenes that would appear as footage in the final video.
- Scene titles should be SHORT and CINEMATIC (e.g. "City Night Chase", "Holographic Display"), never generic like "Scene 1" or "Introduction".
- Narration must be ONLY the spoken voiceover words — not visual descriptions or stage directions. Write natural, conversational voiceover that sounds premium.

IMAGE PROMPT RULES (visualDescription):
- Write as a detailed image generation prompt, NOT a script direction.
- Include: specific subject/product, setting details, lighting type (golden hour, neon, studio), colors, composition (rule of thirds, centered, close-up), camera angle (low angle, bird's eye, eye level), atmosphere.
- Be PHOTOREALISTIC and SPECIFIC. Instead of "a watch on a table", write "luxury silver chronograph watch with blue dial resting on polished marble surface, warm studio key light from upper left, shallow depth of field, dark moody background with soft bokeh".
- Avoid abstract concepts — describe what the camera literally SEES.

VIDEO MOTION RULES (videoMotionPrompt):
- Describe SUBTLE, CINEMATIC motion for 5-second AI video clips. AI video models work best with SLOW, DELIBERATE movement.
- GOOD: "Slow dolly push-in toward watch face, light reflections gently shifting across dial, shallow depth of field with soft background blur"
- GOOD: "Gentle camera orbit around product, volumetric light rays streaming through window, dust particles floating"
- BAD: "Fast zoom, explosion, rapid cuts" — AI video models can't handle fast/complex motion.
- Always include: camera motion (push-in, pull-back, orbit, pan, static), subject movement (subtle), lighting shifts, atmospheric effects.
- Keep motion minimal and elegant — think Apple product videos, luxury brand commercials.

- Duration should reflect voiceover length at ~150 words per minute. If no voiceover, use 5-8 seconds.
- The total video should be approximately ${options.targetDuration || 30} seconds.
${options.artStyle ? `- Art style: ${options.artStyle}. Incorporate this into visual descriptions.` : ''}
${options.aspectRatio ? `- Aspect ratio: ${options.aspectRatio}. Consider framing in visual descriptions.` : ''}

SCRIPT:
${scriptText.substring(0, 8000)}`,
  });

  return object;
}

/**
 * Check if LLM parsing is available.
 */
export function isLLMParserAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
