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

const SceneEditDirectionsSchema = z.object({
  transition: z.object({
    type: z.enum(['dissolve', 'dip-to-black', 'dip-to-white', 'hard-cut', 'zoom-punch', 'whip-pan', 'wipe-left', 'glitch', 'soft-cut']),
    durationMs: z.number().optional(),
  }).optional().describe('Transition INTO this scene. Only set if the script explicitly mentions a transition (e.g. "CUT TO", "DISSOLVE TO", "FADE IN"). null if not mentioned.'),
  filterPresetId: z.string().optional().describe('Color grade for this scene, mapped to preset ID. Only set if the script explicitly describes a color mood for this specific scene. Options: cinematic, teal-orange, blade-runner, neon-nights, muted-doc, golden-hour-pro, desaturated-drama, film-portra, clean-corporate, vivid, warm-neutral, noir, retro, warm, cool. null if not mentioned.'),
  pacing: z.enum(['fast', 'medium', 'slow', 'building', 'beat-synced']).optional().describe('Pacing for this scene. Only set if the script explicitly mentions pacing (e.g. "quick cuts", "slow reveal"). null if not mentioned.'),
  sfxCue: z.string().optional().describe('Specific sound effect cue beyond general audio. Only set if the script explicitly describes an SFX moment (e.g. "whoosh", "heartbeat", "glass shatter"). null if not mentioned.'),
  motionGraphicCue: z.string().optional().describe('Motion graphic to overlay. Only set if the script mentions a callout, lower third, stat display, or graphic overlay. null if not mentioned.'),
  cameraRig: z.string().optional().describe('Camera movement/rig notes from the script (e.g. "steadicam", "dolly", "crane shot"). Preserved for reference. null if not mentioned.'),
}).describe('Editing directions for this scene. Return null for any field NOT explicitly present in the script — do NOT invent directions.');

const SceneSchema = z.object({
  title: z.string().describe('Short cinematic scene title (2-6 words, no markdown, no "Scene 1" generic labels)'),
  narration: z.string().describe('ONLY the voiceover/dialogue words spoken aloud by a voice actor. Extract exact quoted text from "Voiceover:" or "VO:" or "Narrator:" labels. Empty string "" if no voiceover in this scene. NEVER include visual descriptions, camera directions, audio notes, or music cues.'),
  visualDescription: z.string().describe('Static image prompt: what the camera frame captures as a STILL photograph. Subject, setting, lighting, colors, composition, framing. NO camera movement, NO motion words.'),
  videoMotionPrompt: z.string().describe('Video animation prompt: how this still frame comes to life. Camera movement (dolly, pan, orbit), subject micro-motion, atmospheric effects (particles, light shifts, fabric movement). Keep subtle and cinematic.'),
  audioDescription: z.string().describe('Background audio/sound effects for this scene (not voiceover): ambient sounds, music mood, sfx.'),
  durationSeconds: z.number().describe('Scene duration in seconds based on voiceover pacing (~150 words/minute). Minimum 3s, maximum 15s.'),
  mood: z.enum(['energetic', 'calm', 'serious', 'playful', 'mysterious', 'dramatic', 'inspirational', 'neutral']),
  imageQualityTokens: z.string().describe('Style-appropriate quality descriptors for the image. E.g. for cinematic: "35mm film grain, shallow depth of field, anamorphic lens". For anime: "cel-shaded, clean linework, vibrant saturation". Tailor to the art style.'),
  videoQualityTokens: z.string().describe('Style-appropriate quality descriptors for the video. E.g. for cinematic: "smooth cinematic footage, film grain, professional color grade". For anime: "fluid animation, consistent character model, clean frames". Tailor to the art style.'),
  editDirections: SceneEditDirectionsSchema.optional().describe('Editing directions extracted from the script. ONLY populate fields that are explicitly mentioned in the script text. Return null/omit for anything not stated.'),
});

const GlobalEditDirectionsSchema = z.object({
  colorGrade: z.string().optional().describe('Overall color grade description from production notes (e.g. "cool sophisticated palette", "warm cinematic"). null if not mentioned.'),
  defaultFilterPresetId: z.string().optional().describe('Default filter preset for all scenes. Map from script color/grade instructions. Options: cinematic, teal-orange, blade-runner, neon-nights, muted-doc, golden-hour-pro, desaturated-drama, film-portra, clean-corporate, vivid, warm-neutral, noir. null if not mentioned.'),
  defaultTransition: z.object({
    type: z.string(),
    durationMs: z.number(),
  }).optional().describe('Default transition between scenes if the script specifies a consistent style (e.g. "use dissolves throughout"). null if not mentioned.'),
  pacing: z.string().optional().describe('Overall pacing from the script (e.g. "fast-paced", "building tension", "slow and deliberate"). null if not mentioned.'),
  graphicsDensity: z.enum(['heavy', 'moderate', 'minimal']).optional().describe('How graphic-heavy the edit should be, inferred from production notes. null if not mentioned.'),
  musicMood: z.string().optional().describe('Music mood/style beyond overallMusicPrompt — from production notes section. null if not mentioned.'),
  narrativeArc: z.enum(['three-act', 'aida', 'hero-journey', 'gap-method', 'before-after']).optional().describe('Narrative structure if detectable from the script. null if not clear.'),
}).describe('Global editing directions for the entire video. ONLY populate from explicit script/production notes content.');

const ParseResultSchema = z.object({
  scenes: z.array(SceneSchema).min(1).max(60),
  overallMusicPrompt: z.string().describe('Overall background music style/mood for the entire video. E.g. "cinematic orchestral with building tension" or "upbeat electronic pop with driving beat"'),
  characterDescriptions: z.record(z.string(), z.string()).describe('Character sheet: map of recurring character/subject name → detailed visual description for cross-scene consistency. Only include subjects appearing in 2+ scenes. Empty object if no recurring subjects.'),
  colorPalette: z.array(z.string()).describe('Specific color names used throughout the script\'s visual identity. Extract 3-8 dominant colors from the visual descriptions. Use specific color names, not generic ("cobalt blue" not "blue").'),
  environmentNotes: z.string().describe('Brief description (1-3 sentences) of the overall visual environment and setting across the video. E.g. "Modern minimalist tech office with floor-to-ceiling windows, warm natural lighting, and clean geometric furniture." Summarize the dominant setting/world of the script.'),
  globalEditDirections: GlobalEditDirectionsSchema.optional().describe('Global editing instructions extracted from the script\'s production notes, creative direction, or style guide sections. ONLY populate from explicit content in the script.'),
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
- Narration = ONLY the spoken voiceover/dialogue words that a voice actor reads aloud. NOTHING ELSE.
- If the script labels voiceover (e.g. "**Voiceover:**", "VO:", "NARRATOR:"), extract ONLY those exact quoted words.
- DO NOT include stage directions, visual descriptions, camera notes, audio notes, music cues, or transition instructions in narration.
- If a scene has NO voiceover/dialogue text, set narration to an EMPTY STRING "". Do NOT invent narration. Silent scenes are valid.

IMAGE PROMPT RULES (visualDescription):
- This generates ONE SINGLE STILL IMAGE. Absolutely NO camera movement words (no "tracking", "dolly", "pan", "zoom", "follows"). Describe a FROZEN MOMENT in time.
- NEVER describe multiple frames, panels, grids, collages, storyboards, or split-screen layouts. ONE image = ONE continuous photograph.
- If the script mentions "quick cuts" or "montage" with multiple elements (A, B, C), pick the SINGLE most visually striking element as the image subject. The others are edit directions, not visual content.
- NEVER write things like "split into frames showing..." or "a series of images..." or "four panels..." — this creates collage artifacts in the image generator.
- Write as a detailed AI image generation prompt describing what the camera frame captures as a photograph.
- Include: specific subject with exact visual details (colors, materials, textures), setting/environment, lighting setup (type, direction, quality), color palette, composition (framing, rule of thirds, centered), viewing angle (eye level, low angle, overhead), atmosphere/mood.
- Be SPECIFIC. Instead of "a person at a desk", write a detailed description with exact visual attributes: hair, clothing, materials, lighting direction, environment details, and color specifics. Describe what the camera frame actually captures.
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

STYLE GUIDE EXTRACTION:
- characterDescriptions: For any character/person appearing in 2+ scenes, create a CHARACTER SHEET entry mapping their name to an exhaustive visual description (face, hair, skin, build, clothing, accessories). This ensures visual consistency across scenes. If no recurring characters, return an empty object.
- colorPalette: Extract 3-8 specific, named colors that define the script's visual identity from across all scenes. Use precise color names like "cobalt blue", "warm amber", "brushed silver" — never generic like "blue" or "red".
- environmentNotes: Write 1-3 sentences summarizing the dominant visual environment/world of the entire video. What kind of spaces, lighting, and atmosphere define this script?

EDIT DIRECTIONS EXTRACTION:
- For each scene, extract editDirections ONLY from explicit script cues:
  - "CUT TO:" → transition: { type: "hard-cut" }
  - "DISSOLVE TO:" / "CROSS DISSOLVE" → transition: { type: "dissolve" }
  - "FADE TO BLACK" / "FADE OUT" → transition: { type: "dip-to-black" }
  - "SMASH CUT" → transition: { type: "zoom-punch" }
  - "Quick cuts" / "rapid editing" → pacing: "fast"
  - "Slow reveal" / "hold on" → pacing: "slow"
  - Camera rig mentions → cameraRig: the specific camera note
  - Explicit sound effect mentions → sfxCue: the specific SFX
  - "lower third" / "text overlay" / "stat display" → motionGraphicCue
- For globalEditDirections, extract from production notes / creative direction sections:
  - Color grade instructions → map to filter preset IDs using these mappings:
    "cool sophisticated" → "cinematic", "warm" → "golden-hour-pro"
    "gritty" → "muted-doc", "clean" → "clean-corporate"
    "teal and orange" → "teal-orange", "neon" → "neon-nights"
    "dark/thriller" → "desaturated-drama", "film stock" → "film-portra"
  - Overall pacing instructions
  - Graphics density hints
  - Music mood from sound design sections
  - Narrative structure (AIDA, before/after, three-act)
- CRITICAL: Return null for ANY field not explicitly in the script. Do NOT invent directions.

DURATION: Based on voiceover pacing at ~150 words/minute. If no voiceover, use 5-8 seconds per scene.
TOTAL TARGET: ~${options.targetDuration || 30} seconds total.

SCENE COUNT RULES — THIS IS CRITICAL:
- For a ${options.targetDuration || 30}-second video: generate EXACTLY ${Math.max(2, Math.min(Math.ceil((options.targetDuration || 30) / 7), 8))} to ${Math.max(3, Math.min(Math.ceil((options.targetDuration || 30) / 5), 12))} scenes. NO MORE.
- Each scene = ONE continuous camera shot / ONE storyboard frame. A scene is 5-10 seconds of footage.
- "Quick cuts: A, B, C" or "Montage: X, Y, Z" = ONE scene with the MOST IMPORTANT visual element as the visualDescription. The quick cuts/montage is a PACING instruction (set pacing: "fast"), NOT multiple scenes.
- If the script explicitly labels scenes (Scene 1, Scene 2, etc.), use EXACTLY those scene boundaries. Do NOT split a labeled scene into multiple scenes.
- Multiple visual actions within one scene stay as ONE scene. Pick the SINGLE most striking frame for the storyboard image.
- NEVER generate more than 12 scenes for any video under 2 minutes.
${options.aspectRatio ? `ASPECT RATIO: ${options.aspectRatio}. Adjust composition and framing accordingly.` : ''}

SCRIPT:
${scriptText.substring(0, 24000)}`,
  });

  return object;
}

// ─── Subject Extraction ─────────────────────────────────────────

const SubjectSchema = z.object({
  id: z.string().describe('Unique kebab-case identifier, e.g. "hero-product-main" or "lead-character-alex"'),
  name: z.string().describe('Human-readable name matching the script, e.g. the product name, character name, or location name as written'),
  category: z.enum(['character', 'product', 'location', 'object', 'vehicle']),
  visualDescription: z.string().describe('Exhaustively detailed visual description of this subject IN ISOLATION for generating a reference image. Include: exact shape, specific color names (not "colorful" — say "cobalt blue"), materials, textures, proportions, distinguishing features. For characters: face, hair, skin tone, build, clothing, accessories. For products: dimensions, finish, design details, distinctive elements.'),
  scenesAppearingIn: z.array(z.number()).describe('Scene indices (0-based) where this subject appears'),
  /** Priority tier: "hero" = auto-generate immediately, "suggested" = show as one-click add option */
  priority: z.enum(['hero', 'suggested']).describe('"hero" = the 1-2 most important subjects that MUST have reference images. "suggested" = other notable subjects the user might want references for.'),
});

const SubjectExtractionSchema = z.object({
  subjects: z.array(SubjectSchema).min(1).max(15),
});

export type ExtractedSubject = z.infer<typeof SubjectSchema>;
export type SubjectExtractionResult = z.infer<typeof SubjectExtractionSchema>;

/**
 * Extract ALL possible visual subjects from parsed scenes.
 *
 * Returns subjects in two tiers:
 * - "hero": Top 1-2 most important subjects → auto-generated immediately
 * - "suggested": Other notable subjects → shown as one-click add options
 *
 * Uses FULL scene descriptions (not truncated) so the LLM can identify
 * every visual detail mentioned in the script.
 */
export async function extractSubjectsFromScenes(
  scenes: Array<{ title: string; narration: string; visualDescription: string; sceneIndex: number }>,
  options: { artStyle?: string } = {},
): Promise<SubjectExtractionResult> {
  const google = getGeminiProvider();
  const model = google('gemini-2.0-flash');

  // Give the LLM the FULL visual description + narration — not truncated.
  // The narration often contains key subject details the visual desc misses.
  const scenesSummary = scenes
    .map((s) => {
      const parts = [`Scene ${s.sceneIndex}: "${s.title}"`];
      parts.push(`  Visual: ${s.visualDescription}`);
      if (s.narration) parts.push(`  Narration: ${s.narration}`);
      return parts.join('\n');
    })
    .join('\n\n');

  const { object } = await generateObject({
    model,
    schema: SubjectExtractionSchema,
    prompt: `You are a senior concept artist doing pre-production for a video. Read EVERY scene carefully and extract ALL visual subjects that could benefit from a reference image.

=== SCENES ===
${scenesSummary}

=== YOUR TASK ===
Extract TWO TIERS of subjects:

TIER 1 — "hero" (1-2 subjects): The absolute most important recurring subjects that MUST have reference images. These will be auto-generated.
TIER 2 — "suggested" (3-10 subjects): Every other notable visual subject mentioned in the script that the user MIGHT want a reference for. Be thorough — scan every scene for characters, objects, products, vehicles. Even things appearing once can be suggested if they're visually important.

WHAT TO EXTRACT (for both tiers):
- Characters/people (main AND secondary)
- Products (hero product AND any other products shown)
- Key objects (gadgets, tools, food items, symbols, props)
- Vehicles (cars, bikes, drones, spacecraft)
- Animals or creatures
- Specific clothing/outfits that are narratively important
- Branded items or distinctive products

WHAT TO SKIP:
- Generic settings/locations (rooms, buildings, landscapes) — use category "location" only for VERY specific, narratively critical places
- Abstract concepts, moods, logos as text
- Truly generic items (a random table, generic clouds)

=== VISUAL DESCRIPTION INSTRUCTIONS ===
For each subject, write a visualDescription as if briefing an illustrator who has NEVER seen this thing.

Be EXHAUSTIVE and SPECIFIC:
- Physical form: exact shape, size, proportions
- Colors: use specific names ("cobalt blue", "brushed silver", "warm amber" — NOT "colorful" or "blue")
- Materials & textures: leather, matte plastic, polished chrome, cotton fabric, etc.
- Distinguishing features: what makes THIS subject unique?
- For characters: face details, hair, skin tone, build, specific clothing, accessories
- For products: dimensions, finish, design language, distinctive elements

BAD: "A modern product" → generic, could be anything
GOOD (product example): "Matte black titanium device, rounded rectangular form, 3-inch OLED display with minimal UI, single recessed side button, subtle chamfered edges, woven fabric strap with magnetic clasp"
GOOD (vehicle example): "Electric sedan, pearl white metallic paint, low swept roofline, flush door handles, full-width LED light bar spanning rear, 21-inch turbine wheels, panoramic glass roof"
GOOD (food example): "Artisan sourdough loaf, deep golden-brown crust with distinctive ear scoring, dusted with rice flour, open crumb visible at torn edge, rustic oval shape on dark slate board"

BAD: "A young woman" → generic, could be anyone
GOOD (character example): "Woman in her late 20s, straight jawline-length dark hair with side-swept bangs, warm skin tone, defined cheekbones, tailored charcoal blazer over cream top, layered thin necklaces, confident subtle smile, athletic build"
${options.artStyle ? `\nArt style: ${options.artStyle}. Describe subjects in this visual style.` : ''}

Extract ALL subjects now (heroes + suggestions):`,
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
Scene narration: ${context.narration?.substring(0, 800) || 'No narration'}
Mood: ${context.mood || 'neutral'}
Duration: ${context.durationSeconds}s
Art style: ${context.artStyle || 'cinematic'}
Aspect ratio: ${context.aspectRatio || '16:9'}

=== KEY SUBJECTS IN THIS SCENE ===
${subjectContext}

=== STRICT RULES ===
1. The model SEES the starting image. Do NOT fully re-describe the scene. Instead, open with a brief subject anchor (1 line, key identifying details only) then immediately describe motion.
2. For subjects with reference descriptions: weave in 1-2 key identity anchors naturally (use the subject's specific name/description, not a generic term) and add "maintaining exact appearance throughout" once.
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
