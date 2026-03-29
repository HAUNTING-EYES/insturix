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
    type: z.enum([
      'dissolve', 'dip-to-black', 'dip-to-white', 'flash', 'blur-transition',
      'wipe-left', 'wipe-right', 'slide-up', 'slide-down',
      'zoom-punch', 'zoom-out',
      'whip-pan', 'glitch', 'film-burn', 'iris-wipe', 'soft-cut',
      'hard-cut', 'smash-cut', 'match-cut', 'jump-cut', 'cut-on-action'
    ]),
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
    temperature: 0.3,
    prompt: `You are a senior video production director. Decompose a client script into discrete scenes, each representing ONE AI video generation call.

## INPUT CONTRACT
- You receive a script in ANY format: screenplay, voiceover, bullet points, two-column A/V, timestamped, casual notes, pre-decomposed storyboard, ThinkForge output, or any mix.
- The script may be in any language or mixed languages (e.g., Hindi + English, Hinglish).
- It may be complete or truncated (if truncated, a notice appears at the end).
- If truncated: process only what you have. Add a final scene with title "SCRIPT_TRUNCATED" and empty fields.

## STEP 1: FORMAT DETECTION (do this silently — do not output your detection)
Read the entire script and identify its format. This determines extraction strategy:

FORMAT A — Screenplay (INT./EXT. sluglines, VO:/NARRATOR: labels):
→ Sluglines = scene boundaries. Labeled dialogue/VO = narration. Stage directions = visualDescription.

FORMAT B — Voiceover script (continuous prose, no/minimal visual directions):
→ All prose = narration. You must INVENT appropriate visuals for each segment.

FORMAT C — Two-column A/V (separate VISUAL and AUDIO sections):
→ Visual → visualDescription. Audio → extract spoken text as narration, SFX as sfxCue, music notes as audioDescription. Camera → videoMotionPrompt + cameraRig.

FORMAT D — Bullet-point brief (bullets, numbered steps):
→ Each bullet or logical group = one scene. Bullets are visual directions unless they contain quoted speech or are labeled as VO.

FORMAT E — Timestamped (timecodes like [00:00-00:05] or 0:00-0:05):
→ Use timestamps to set durationSeconds. Text between timestamps: spoken words = narration, visual directions = visualDescription.

FORMAT F — Casual/conversational (unstructured paragraph, informal tone):
→ Parse intent from natural language. "show X" = visual. Quoted text = narration. "add music" = audioDescription.

FORMAT G — Pre-decomposed storyboard (already split into named scenes with sub-directions):
→ Script "scenes" are EDITORIAL sections. Pipeline scenes are VIDEO GENERATION UNITS (one subject, one location, one frozen frame). These are NOT the same thing.
→ If script scene has ONE subject in ONE location with continuous action → keep as one pipeline scene.
→ If script scene describes a MONTAGE of DIFFERENT subjects/locations → DECOMPOSE into separate pipeline scenes, one per distinct subject/location.

FORMAT H — ThinkForge output (scenes with Visuals/Audio/Camera/Music Direction subsections, plus header and Production Notes):
→ Same decomposition rule as FORMAT G: split multi-subject scenes.
→ Extract: Visuals → visualDescription, Audio → sfxCue + narration, Camera → videoMotionPrompt + cameraRig, Music Direction → audioDescription, Transition line → editDirections.transition (apply to LAST pipeline scene in that group).
→ Header block (Emotional Target, Genre, Tempo, Key, Instrumentation, Reference Tracks) → IGNORE for scenes. This is global metadata.
→ Production Notes → IGNORE entirely.

MIXED FORMATS: Apply the most specific matching format per section. Priority: labeled VO > quoted speech > prose paragraphs > visual directions.

## NARRATION EXTRACTION
Priority order:
1. Text labeled VO: / VOICEOVER: / NARRATOR: → extract verbatim
2. Quoted text after a character name (SARAH: "Hello") → extract quoted text
3. In FORMAT B: all prose paragraphs = narration
4. In FORMAT C/H: text in the AUDIO section that is clearly spoken words (not SFX, not music)
5. Unlabeled prose in mixed scripts → narration ONLY if it reads as speakable
6. Stage directions, camera notes, SFX descriptions, music cues → NEVER narration
7. When uncertain → "" (empty string). Silent scenes are valid. Commercial/brand scripts often have ZERO narration.

## VISUAL DESCRIPTION (generates ONE still image)
This text is sent to an AI image model to generate a single photograph.
- Describe what a camera captures in ONE exposure
- Include: subject (exact visual details — colors, materials, textures, proportions), environment, lighting (type + direction + quality), color palette, composition, viewing angle, mood
- MANDATORY: if a subject appeared in a previous scene, repeat their EXACT visual description for consistency

### Handling multiple visual beats in one scene:
If SAME subject from SAME camera setup (e.g., "runner starts, accelerates, hits stride"):
→ Keep as one pipeline scene. Pick the most visually striking moment. Other beats inform videoMotionPrompt.

If SAME subject from DIFFERENT camera setups (e.g., "tight on alarm clock, then low angle of feet"):
→ SPLIT — each requires a different photograph. Group beats that share the same framing.

If DIFFERENT subjects (e.g., "runner's eyes, then basketball hands, then gymnast feet"):
→ ALWAYS SPLIT into separate pipeline scenes.

### Handling montage descriptions:
"Rapid montage of X details" where X is ONE subject (e.g., "montage of Nike shoe details"):
→ Pick the most distinctive detail as the frozen frame. Set pacing: "fast"

"Rapid montage of DIFFERENT subjects":
→ SPLIT into separate pipeline scenes (one per subject)

${options.artStyle ? `Art style for ALL scenes: ${options.artStyle}. Adapt every description to this style.` : 'Default art style: photorealistic cinematic with natural lighting. Maintain consistently.'}

BANNED in visualDescription (cause generation artifacts):
- Camera movement: tracking, dolly, pan, zoom, follows, sweeps
- Multi-frame: split, panels, grid, collage, storyboard, montage, series, diptych, triptych
- Temporal: then, next, afterward, transitions to, cuts to

## VIDEO MOTION (animates the frozen frame for ~5 seconds)
The video model ALREADY SEES the image. Describe ONLY what changes.
- One primary motion + one secondary atmospheric detail. Slow and deliberate.
- Do NOT redescribe the visual contents.
- USE the script's Camera section if present (tracking shot → slow tracking, push-in → gentle push-in).
- For fast-paced scenes: describe the dominant motion, note "quick energy" in the prompt.

## QUALITY TOKENS
Must be specific to the art style. Dynamic per scene.
- Cinematic → "35mm Kodak Portra 400, shallow depth of field, anamorphic lens flare"
- Animation → "smooth vector lines, consistent stroke weight, cel-shaded"
- Documentary → "handheld natural light, 4K sensor, ungraded footage"
- Sports/commercial → "high-speed camera, crisp motion freeze, stadium lighting, editorial color grade"
- NEVER use generic "high quality, 4K, masterpiece" tokens.

## SCENE DECOMPOSITION
Target: ~${options.targetDuration ? Math.ceil(options.targetDuration / 5) : '6-12'} scenes for a ${options.targetDuration || '30-60'}-second video.

### If the script IS already decomposed into scenes (FORMAT G/H):
- If a script scene has ONE subject in ONE composition/framing → keep as ONE pipeline scene
- If a script scene has a MONTAGE of DIFFERENT subjects/locations → SPLIT into separate pipeline scenes. Set pacing: "fast" on all.
- If a script scene has the SAME subject but DIFFERENT camera setups → SPLIT into separate pipeline scenes. Group beats that share the same framing.
- If a script scene has the SAME subject in SAME framing across continuous action → keep as ONE pipeline scene, pick the most dynamic moment.
- Apply the script scene's transition to the LAST pipeline scene in the group.
- Distribute SFX/camera/music across all derived pipeline scenes.
- Narration attaches to the FIRST pipeline scene in the group. Other derived scenes: narration "".

### If the script is NOT pre-decomposed:
One scene = one continuous shot. SPLIT when: location changes, subject changes, time jumps, script marks cut/transition, dialogue switches speakers.
MERGE when: same subject + same location + continuous action → one scene.

### Special cases (all formats):
- Title cards / logo reveals → own scene, narration: ""
- Text-on-screen / end cards → own scene, include text in visualDescription
- Logo animations → own scene, describe logo and animation style
- Talking head with B-roll → split: one talking scene, separate B-roll scenes

## DURATION
If the script provides timestamps → calculate durationSeconds for each pipeline scene.
If narration exists → estimate: ~150 words per minute, add 1-2s buffer.
If no data → default to 5.

## AUDIO DESCRIPTION EXTRACTION
If the script includes per-scene music direction (emotional target, texture, dynamics, tempo):
→ Extract into audioDescription: "focused anticipation, low synth pulse, minimal percussion, building intensity"
If no music direction but ambient audio → audioDescription: "gym ambiance, rhythmic breathing"
If nothing → audioDescription: ""

## MOTION GRAPHIC CUE EXTRACTION
If the script implies text overlays, statistics, branded elements:
→ Extract into editDirections.motionGraphicCue: "stat counter: 50% off", "lower third: LIMITLESS FLOW", "brand logo reveal: Nike swoosh"
If nothing → motionGraphicCue: ""

## SFX EXTRACTION
If the script's Audio section describes sound effects (e.g., "SFX: chalk dust puff"):
→ Extract into editDirections.sfxCue as a concise description (strip "SFX:" prefix)
If nothing → sfxCue: ""

## EDIT DIRECTIONS MAPPING
### Transitions (map script cues to exact IDs):
VISUAL: DISSOLVE/"dissolve", FADE TO BLACK/"dip-to-black", FADE TO WHITE/"dip-to-white", FLASH/"flash", BLUR/"blur-transition", WIPE LEFT/"wipe-left", WIPE RIGHT/"wipe-right", SLIDE UP/"slide-up", SLIDE DOWN/"slide-down", ZOOM IN/"zoom-punch", ZOOM OUT/"zoom-out", WHIP PAN/"whip-pan", GLITCH/"glitch", FILM BURN/"film-burn", IRIS WIPE/"iris-wipe", SOFT CUT/"soft-cut"
EDITORIAL: CUT TO/"hard-cut", SMASH CUT/"smash-cut", MATCH CUT/"match-cut", JUMP CUT/"jump-cut", CUT ON ACTION/"cut-on-action"
DEFAULT: Any unlisted or ambiguous → "hard-cut"
Durations: dissolve=500, dip-to-black=600, flash=270, hard-cut=0, zoom-punch=270, blur-transition=600

### Pacing: "quick cuts"/"fast", "slow"/"slow", "build/escalating"/"building", default/"medium"

## META CONTENT — IGNORE FOR SCENES
Skip: Project overviews, creative briefs, emotional targets (header), genre/style descriptions, reference tracks, style guides, platform notes, production notes, color grade (global), sound design (global). These are metadata, NOT scenes.

CRITICAL: Return null for ANY editDirections field not explicitly in the script. Do NOT invent.
${options.aspectRatio ? `ASPECT RATIO: ${options.aspectRatio}. Adjust composition and framing accordingly.` : ''}

## STYLE GUIDE EXTRACTION
- characterDescriptions: For recurring subjects (2+ scenes), create exhaustive visual description for consistency. Empty object if none.
- colorPalette: 3-8 specific named colors from visual descriptions (e.g., "cobalt blue", not "blue").
- environmentNotes: 1-3 sentences summarizing the dominant visual world.

SCRIPT:
${scriptText.substring(0, 24000)}
${scriptText.length > 24000 ? '\n[NOTICE: Script truncated at 24,000 characters. Process only content above. Add final scene with title "SCRIPT_TRUNCATED".]' : ''}`,
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
    temperature: 0.2,
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
  /** Camera rig from script editDirections (e.g., "tracking shot", "static tripod", "handheld") */
  cameraDirection?: string;
  /** Transition hint from script editDirections (e.g., "dissolve to next", "hard cut") */
  transitionHint?: string;
  /** Previous scene's last frame description for visual continuity */
  previousSceneLastFrame?: string;
  /** Target video model for model-specific prompt tuning */
  targetModel?: 'kling' | 'veo' | 'minimax' | 'luma' | 'wan' | 'ltx';
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

  // Model-specific tuning guide
  const modelTuning: Record<string, string> = {
    kling: 'Kling: cinematic language, include lens type, favor push-in/pull-out. 100-150 words.',
    veo: 'Veo: handles complex motion well, ambitious camera paths OK. 100-150 words.',
    minimax: 'MiniMax: short, dense prompts only. Under 100 words.',
    luma: 'Luma Ray2: excels at lighting shifts. Emphasize light/shadow changes. 80-120 words.',
    wan: 'Wan: good with natural motion, describe organic movement. 80-120 words.',
    ltx: 'LTX: clean, simple prompts. One motion direction. 60-100 words.',
  };
  const modelGuide = modelTuning[context.targetModel || ''] || 'Default: slow push-in, minimal motion, one atmospheric detail. 80-120 words.';

  const { object } = await generateObject({
    model,
    schema: RefinedVideoPromptSchema,
    temperature: 0.7,
    prompt: `You are VideoPromptMaster — a prompt engineer for image-to-video AI models.

## TASK
Refine a motion prompt for one scene. The video model receives the starting image + your text. Output ONE prompt describing how the image comes to life.

## SCENE CONTEXT
Starting image shows: ${context.visualDescription.substring(0, 400)}
Initial motion idea: ${context.videoMotionPrompt || 'Not specified — choose most cinematic option'}
Narration: ${context.narration?.substring(0, 800) || 'Silent'}
Mood: ${context.mood || 'neutral'} | Duration: ${context.durationSeconds}s
${context.cameraDirection ? `Camera direction: ${context.cameraDirection}` : ''}
${context.transitionHint ? `Scene ends with: ${context.transitionHint}` : ''}
${context.previousSceneLastFrame ? 'Continues from previous scene — maintain visual continuity.' : ''}

## KEY SUBJECTS
${subjectContext}

## RULES
1. Open with 5-10 word subject anchor using identity details from subject sheet
2. Primary: ONE camera movement + ONE subject action. Slow, deliberate.
3. Secondary: ONE atmospheric detail (wind, light shift, particles)
4. Include physics: weight, momentum, reflections where natural
5. Reference ONLY elements from visual description and subject sheets

## MODEL-SPECIFIC TUNING
${modelGuide}

## OUTPUT
Return ONLY the refined prompt text. No JSON wrapper needed — put it in the prompt field.`,
  });

  return object.prompt;
}

/**
 * Check if LLM parsing is available.
 */
export function isLLMParserAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
