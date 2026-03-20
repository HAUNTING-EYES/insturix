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
  visualDescription: z.string().describe('Static image prompt: what the camera frame captures as a STILL photograph. Subject, setting, lighting, colors, composition, framing. NO camera movement, NO motion words.'),
  videoMotionPrompt: z.string().describe('Video animation prompt: how this still frame comes to life. Camera movement (dolly, pan, orbit), subject micro-motion, atmospheric effects (particles, light shifts, fabric movement). Keep subtle and cinematic.'),
  audioDescription: z.string().describe('Background audio/sound effects for this scene (not voiceover): ambient sounds, music mood, sfx.'),
  durationSeconds: z.number().describe('Scene duration in seconds based on voiceover pacing (~150 words/minute). Minimum 3s, maximum 15s.'),
  mood: z.enum(['energetic', 'calm', 'serious', 'playful', 'mysterious', 'dramatic', 'inspirational', 'neutral']),
  imageQualityTokens: z.string().describe('Style-appropriate quality descriptors for the image. E.g. for cinematic: "35mm film grain, shallow depth of field, anamorphic lens". For anime: "cel-shaded, clean linework, vibrant saturation". Tailor to the art style.'),
  videoQualityTokens: z.string().describe('Style-appropriate quality descriptors for the video. E.g. for cinematic: "smooth cinematic footage, film grain, professional color grade". For anime: "fluid animation, consistent character model, clean frames". Tailor to the art style.'),
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
    prompt: `You are a premium video production director working with a client's script. Your job is to faithfully translate their creative vision into AI-optimized scene descriptions.

CRITICAL RULES:
- HONOR THE USER'S SCRIPT: Every scene must faithfully represent what the user wrote. Do NOT invent new content, alter their message, or add creative liberties beyond what the script describes.
- IGNORE all meta sections: project overview, creative direction, style guide, target audience, format notes, platform info, production notes, branding guidelines — anything that describes the document itself rather than a scene.
- ONLY extract scenes that would appear as footage in the final video.
- Scene titles should be SHORT and CINEMATIC (e.g. "City Night Chase", "Holographic Display"), never generic like "Scene 1" or "Introduction".
- Narration must be ONLY the spoken voiceover words — not visual descriptions or stage directions. Keep the user's exact wording and tone. If the script has no voiceover text for a scene, write concise narration that matches the script's intent.

IMAGE PROMPT RULES (visualDescription):
- This generates a STILL IMAGE. Absolutely NO camera movement words (no "tracking", "dolly", "pan", "zoom", "follows"). Describe a FROZEN MOMENT in time.
- Write as a detailed AI image generation prompt describing what the camera frame captures as a photograph.
- Include: specific subject with exact visual details (colors, materials, textures), setting/environment, lighting setup (type, direction, quality), color palette, composition (framing, rule of thirds, centered), viewing angle (eye level, low angle, overhead), atmosphere/mood.
- Be SPECIFIC. Instead of "a person at a desk", write "young woman with dark curly hair wearing olive green blazer, seated at oak desk with open MacBook, warm afternoon sunlight streaming through floor-to-ceiling windows, modern minimalist office, soft shadows".
- Keep the SAME subject visually identical across every scene it appears in. Repeat key identifying details (hair color, clothing, object shape/color) verbatim each time.
${options.artStyle ? `- Art style: ${options.artStyle}. EVERY visual description must be written FOR THIS SPECIFIC STYLE. Adapt subject rendering, lighting, and composition to match this aesthetic. Do NOT write photorealistic descriptions for an anime style, or cartoon descriptions for a cinematic style.` : '- Infer the appropriate visual style from the script content and maintain it consistently.'}

VIDEO MOTION PROMPT RULES (videoMotionPrompt):
- This animates the still image into a 5-second video clip. The storyboard image is the STARTING FRAME.
- Describe ONLY motion and change over time: how the camera moves, how the subject moves, how light/atmosphere shifts.
- AI video models work best with SLOW, DELIBERATE, MINIMAL motion. One primary motion + one secondary detail.
- GOOD: "Slow push-in toward subject's face, hair gently moving in breeze, warm light gradually intensifying"
- GOOD: "Static camera, steam slowly rising from coffee cup, morning light shifting across table surface"
- GOOD: "Gentle orbit left around product, reflections sliding across metallic surface, soft bokeh circles drifting"
- BAD: "Fast zoom, explosion, rapid cuts, character runs across room" — AI video CANNOT handle this.
- DO NOT repeat the visual description. The video model already sees the image. Only describe WHAT CHANGES.

QUALITY TOKENS (imageQualityTokens & videoQualityTokens):
- These must be DYNAMIC and SPECIFIC to the art style. Do NOT use generic "high quality" tokens.
- For "${options.artStyle || 'the chosen style'}", write tokens that an expert in that medium would use.
- Image examples by style:
  - cinematic → "35mm Kodak Portra 400, anamorphic lens flare, shallow depth of field, color graded"
  - anime → "studio quality cel animation, clean linework, vibrant saturated colors, detailed backgrounds"
  - superhero → "Marvel concept art, dynamic composition, vivid saturated palette, volumetric god rays"
  - watercolor → "wet-on-wet technique, organic pigment bleeding, visible paper texture, luminous washes"
  - horror → "desaturated cold tones, heavy vignette, grain, unsettling negative space"
- Video examples by style:
  - cinematic → "smooth 24fps footage, professional color grade, film grain, anamorphic breathing"
  - anime → "fluid 12fps animation, consistent model sheet, clean in-betweens, no morphing artifacts"
  - superhero → "dynamic camera energy, vivid color persistence, clean motion trails, no flickering"
  - watercolor → "organic paint-like motion, colors bleeding gently, brushstroke texture preserved"
- NEVER use style-inappropriate tokens. "Film grain" makes no sense for pixel art. "Cel-shaded" makes no sense for photorealistic.

DURATION: Based on voiceover pacing at ~150 words/minute. If no voiceover, use 5-8 seconds.
TOTAL TARGET: ~${options.targetDuration || 30} seconds.
${options.aspectRatio ? `ASPECT RATIO: ${options.aspectRatio}. Adjust composition and framing accordingly.` : ''}

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
    prompt: `You are a video pre-production AI. Analyze these scenes and identify ONLY the HERO SUBJECTS — the core subjects the video is ABOUT that must look visually identical across scenes.

STRICT RULES:
- ONLY extract the 1-3 most important recurring subjects. Quality over quantity.
- The subject must be a PHYSICAL, TANGIBLE thing that can be rendered as a single isolated image: a specific person/character, a specific product, a specific vehicle, a specific key object.
- The subject MUST appear in 2+ scenes and be CENTRAL to the video's narrative.
- Do NOT extract:
  • Locations, rooms, buildings, or environments (these are SETTINGS, not subjects)
  • Background elements, furniture, props, or set dressing
  • Text, logos, brand names, or UI elements
  • Abstract concepts, moods, or atmospheres
  • Generic items (a table, the sky, a phone) that aren't the HERO of the video
  • Anything that is part of the setting rather than the subject
- For a PRODUCT AD: extract ONLY the product itself (the watch, the shoe, the car)
- For a STORY: extract ONLY the main character(s)
- For each subject, write a visualDescription as an AI IMAGE GENERATION PROMPT for a REFERENCE SHEET:
  - Describe the subject COMPLETELY IN ISOLATION against a clean neutral/white background
  - Include: exact colors, materials, textures, proportions, distinguishing details
  - Studio lighting, sharp focus
  - Example: "Luxury silver chronograph watch with midnight blue dial, polished steel bracelet, sapphire crystal, date window at 3 o'clock, clean white background, studio product photography, sharp focus"
  - NEVER include scene context, backgrounds, or other objects — ONLY the subject itself
${options.artStyle ? `- Art style: ${options.artStyle}. Describe subjects in this visual style.` : ''}

SCENES:
${scenesSummary}`,
  });

  return object;
}

// ─── Video Prompt Refinement (VideoPromptMaster) ────────────────

const RefinedVideoPromptSchema = z.object({
  prompt: z.string().describe('The final optimized video generation prompt. Raw text only, no markdown, no explanations.'),
});

export interface VideoPromptContext {
  /** What the storyboard image shows (for context — don't re-describe) */
  visualDescription: string;
  /** Initial motion prompt from scene parser */
  videoMotionPrompt?: string;
  /** Voiceover/narration text for this scene */
  narration?: string;
  /** Scene mood */
  mood?: string;
  /** Clip duration in seconds */
  durationSeconds: number;
  /** Art style (cinematic, anime, superhero, etc.) */
  artStyle?: string;
  /** Aspect ratio */
  aspectRatio?: string;
  /** Approved reference subjects appearing in this scene */
  referenceSubjects?: Array<{
    name: string;
    category: string;
    visualDescription: string;
  }>;
  /** LLM-generated video quality tokens */
  videoQualityTokens?: string;
}

/**
 * Refine a video prompt using LLM (VideoPromptMaster).
 *
 * Takes scene context + reference subject data and produces a dense,
 * optimized prompt specifically for image-to-video models.
 *
 * Cost: ~$0.00005 per scene (Gemini Flash, ~500 tokens)
 */
export async function refineVideoPrompt(
  context: VideoPromptContext,
): Promise<string> {
  const google = getGeminiProvider();
  const model = google('gemini-2.0-flash');

  // Build reference subject context
  const subjectContext = context.referenceSubjects && context.referenceSubjects.length > 0
    ? context.referenceSubjects
        .map((s) => `${s.name} (${s.category}): ${s.visualDescription}`)
        .join('\n')
    : 'No specific reference subjects — describe motion generically for what\'s in the image.';

  const { object } = await generateObject({
    model,
    schema: RefinedVideoPromptSchema,
    prompt: `You are VideoPromptMaster — an expert prompt engineer specialized in generating MAXIMUM-ACCURACY prompts for image-to-video AI models (Kling, Runway Gen-3, Luma Ray2, MiniMax).

You receive a STARTING IMAGE + your text prompt. The model already SEES the image.
Your ONLY job: output ONE dense, optimized text prompt describing how the image comes to life.
NEVER add explanations, NEVER say "here is the prompt". Just the raw optimized prompt.

=== SCENE CONTEXT ===
What the starting image shows: ${context.visualDescription.substring(0, 400)}
Initial motion direction: ${context.videoMotionPrompt || 'Not specified — infer from scene'}
Scene narration: ${context.narration?.substring(0, 200) || 'No narration'}
Mood: ${context.mood || 'neutral'}
Duration: ${context.durationSeconds}s
Art style: ${context.artStyle || 'cinematic'}
Aspect ratio: ${context.aspectRatio || '16:9'}

=== KEY SUBJECTS IN THIS SCENE ===
${subjectContext}

=== STRICT RULES ===
1. The model SEES the starting image. Do NOT fully re-describe the scene. Instead, open with a brief subject anchor (1 line, key identifying details only) then immediately describe motion.
2. For subjects with reference descriptions: weave in 1-2 key identity anchors naturally (e.g. "the silver chronograph watch" not "a watch") and add "maintaining exact appearance throughout" once.
3. Describe primary motion first: camera movement (slow dolly, gentle orbit, static hold, subtle push-in, etc.) + main subject action.
4. Layer secondary motion: atmospheric details (particles, light shifts, fabric/hair movement, reflections, liquid, smoke).
5. Include physics that sell realism: wind effect on hair/fabric, weight in movement, natural light caustics, surface reflections shifting.
${context.durationSeconds > 5 ? `6. For this ${context.durationSeconds}s clip, imply timing naturally: "gradually...", "then slowly...", "building to..." — guide the temporal arc.` : '6. For this short clip, keep motion minimal and focused — one clean camera move + one detail.'}
7. End with style-appropriate motion quality tokens for ${context.artStyle || 'cinematic'} — these must match the medium (don't use "film grain" for anime or "cel-shaded" for photorealistic).
8. Dense but concise: 80-200 words. Every word must earn its place.
9. NEVER invent elements not in the scene context or reference subjects.
10. NEVER use Midjourney/StableDiffusion flags (--ar, --stylize, etc.) — these are API-based models.
11. Adapt language to the art style: cinematic = film language, anime = animation language, etc.
${context.videoQualityTokens ? `12. Incorporate these quality tokens naturally: ${context.videoQualityTokens}` : ''}

Output ONLY the final video generation prompt. Nothing else.`,
  });

  return object.prompt;
}

/**
 * Check if LLM parsing is available.
 */
export function isLLMParserAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
