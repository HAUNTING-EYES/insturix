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
  pacing: z.enum(['fast', 'medium', 'slow', 'building', 'beat-synced']).optional().describe('Pacing for THIS specific scene. ONLY set if the script explicitly describes pacing for this scene (e.g. "quick cuts", "slow reveal", "building tension"). Do NOT propagate global pacing to individual scenes — the global pacing field handles that. null if this scene has no explicit pacing instruction.'),
  sfxCue: z.string().optional().describe('Specific sound effect cue beyond general audio. Only set if the script explicitly describes an SFX moment (e.g. "whoosh", "heartbeat", "glass shatter"). null if not mentioned.'),
  motionGraphicCue: z.string().optional().describe('Motion graphic to overlay. Only set if the script mentions a callout, lower third, stat display, or graphic overlay. null if not mentioned.'),
  cameraRig: z.string().optional().describe('Camera movement/rig notes from the script (e.g. "steadicam", "dolly", "crane shot"). Preserved for reference. null if not mentioned.'),
}).describe('Editing directions for this scene. Return null for any field NOT explicitly present in the script — do NOT invent directions.');

const SubShotSchema = z.object({
  description: z.string().describe('What this sub-shot shows (e.g. "child reaching for Happy Meal toy")'),
  startNormalized: z.number().min(0).max(1).describe('Where in the parent clip this sub-shot starts (0.0 = beginning, 1.0 = end). Used when sub-shots share one generated clip.'),
  endNormalized: z.number().min(0).max(1).describe('Where in the parent clip this sub-shot ends'),
  targetDurationSeconds: z.number().describe('How long this sub-shot appears in the final video. Minimum 3s for AI video quality.'),
  narration: z.string().optional().describe('Narration during this sub-shot. Empty if narration continues from the scene level.'),
  independentGeneration: z.boolean().optional().describe('If true, this sub-shot generates its own independent video clip (separate AI call, separate cost). Set true when sub-shots show COMPLETELY DIFFERENT subjects/actions that cannot come from one clip. Set false/omit when sub-shots can be cut from one continuous clip.'),
  visualDescription: z.string().optional().describe('Distinct visual prompt for this sub-shot (required when independentGeneration=true). Follow the same ONE-subject ONE-moment rules as the parent scene\'s visualDescription.'),
  videoMotionPrompt: z.string().optional().describe('Motion prompt for this sub-shot\'s video gen (required when independentGeneration=true).'),
  imageQualityTokens: z.string().optional().describe('Image quality tokens for this sub-shot (inherits parent if not set).'),
  videoQualityTokens: z.string().optional().describe('Video quality tokens for this sub-shot (inherits parent if not set).'),
});

const SceneSchema = z.object({
  title: z.string().describe('Short cinematic scene title (2-6 words, no markdown, no "Scene 1" generic labels)'),
  narration: z.string().describe('ONLY the voiceover/dialogue words spoken aloud by a voice actor. Extract exact quoted text from "Voiceover:" or "VO:" or "Narrator:" labels. Empty string "" if no voiceover in this scene. NEVER include visual descriptions, camera directions, audio notes, or music cues.'),
  visualDescription: z.string().describe('Static image prompt: ONE primary subject, ONE setting, ONE frozen moment. This generates a SINGLE photograph.\n\nBAD: "A family sharing a meal, a grandparent smiling at a grandchild, friends laughing over lunch" — this is 3 different shots, will produce a collage.\nGOOD: "A grandmother smiling warmly at her young grandchild across a McDonald\'s table, warm golden overhead lighting, soft bokeh background" — ONE moment, ONE camera position.\n\nPick the HERO moment from the script. Other visual beats become separate scenes or sub-shots.'),
  videoMotionPrompt: z.string().describe('Video animation prompt: how this still frame comes to life. Camera movement (dolly, pan, orbit), subject micro-motion, atmospheric effects (particles, light shifts, fabric movement). Keep subtle and cinematic.'),
  audioDescription: z.string().describe('Background audio/sound effects for this scene (not voiceover): ambient sounds, music mood, sfx.'),
  durationSeconds: z.number().describe('Total duration this generation unit occupies in the final video (sum of all sub-shot durations if sub-shots exist). Minimum 3s, maximum 15s.'),
  mood: z.enum(['energetic', 'calm', 'serious', 'playful', 'mysterious', 'dramatic', 'inspirational', 'neutral']).describe('Scene mood based on actual content: energetic=action/montage/high-energy, calm=gentle/reflective/slow moments, serious=corporate/formal/grave, playful=fun/light/humorous, mysterious=suspense/unknown/moody, dramatic=emotional-peak/conflict/revelation, inspirational=uplifting/triumph/brand-aspiration, neutral=informational/transitional. Vary based on what happens in each scene — do NOT assign the same mood to every scene.'),
  imageQualityTokens: z.string().describe('Style-appropriate quality descriptors for the image. E.g. for cinematic: "35mm film grain, shallow depth of field, anamorphic lens". For anime: "cel-shaded, clean linework, vibrant saturation". Tailor to the art style.'),
  videoQualityTokens: z.string().describe('Style-appropriate quality descriptors for the video. E.g. for cinematic: "smooth cinematic footage, film grain, professional color grade". For anime: "fluid animation, consistent character model, clean frames". Tailor to the art style.'),
  editDirections: SceneEditDirectionsSchema.optional().describe('Editing directions extracted from the script. ONLY populate fields that are explicitly mentioned in the script text. Return null/omit for anything not stated.'),

  // Generation unit + sub-shots
  generationUnitId: z.string().describe('Group ID for scenes generated from the SAME video clip. Scenes with the same generationUnitId share one AI video generation call. Use a short descriptive ID like "playground", "car-night", "food-closeup". Each unique ID = one $0.35 video gen call.'),
  primaryVisualForUnit: z.boolean().describe('true if this scene is the PRIMARY visual for its generation unit (the one that gets generated). false if this scene reuses/cuts from another scene\'s generated video.'),
  subShots: z.array(SubShotSchema).optional().describe('If the script describes multiple quick cuts within this scene\'s time window (e.g. "Quick cuts: A, B, C"), define sub-shots here.\n\nFor montage of DIFFERENT subjects: set independentGeneration=true on each sub-shot with its own visualDescription. Each generates a separate AI video clip (separate cost). Example: "child reaching" + "parent wiping" = 2 independent clips.\n\nFor montage of SAME subject: leave independentGeneration=false. Sub-shots cut from one generated clip. Example: "shoe sole detail" + "lacing detail" = one shoe clip, cut at sub-shot boundaries.\n\nLeave empty/omit for continuous scenes.'),
  sceneType: z.enum(['continuous', 'montage', 'logo-reveal', 'text-card', 'talking-head']).describe('Scene type: "continuous" = one unbroken shot, "montage" = rapid cuts (may have sub-shots with independent generation), "logo-reveal" = brand/logo moment, "text-card" = title/end card, "talking-head" = speaker on camera'),
  assetRecommendation: z.enum(['ai-video', 'stock', 'animated-still', 'graphics-only']).describe(`Asset source for this scene based on cost optimization:
- "ai-video": ONLY for hero shots — the emotional peak, the key product moment, the hook (first shot), the closer (last shot), or shots requiring specific compositions impossible to find in stock. Max 30-40% of total scenes.
- "stock": Generic establishing shots, common human activities (walking, talking, eating, driving), cityscapes, nature, abstract b-roll. Will search Pixabay/Pexels.
- "animated-still": Quick montage cuts (<2s), background/ambient shots, flashback moments. Uses Ken Burns drift-zoom on the generated storyboard image instead of AI video ($0.012 vs $0.35).
- "graphics-only": Data-heavy scenes, SaaS product demos, abstract concepts, "the numbers speak" moments. No video needed — graphics ARE the visual.`),
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
  const model = google('gemini-2.5-flash', { structuredOutputs: true });

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
→ Extract: Visuals → visualDescription, Audio → split into narration + sfxCue (see SFX EXTRACTION), Camera → videoMotionPrompt + cameraRig, Music Direction → audioDescription, **Transition:** line → editDirections.transition (map to exact transition ID).
→ IMPORTANT: Look for standalone **Transition:** lines between scenes (e.g. "**Transition:** Hard cut to next scene", "**Transition:** Fast dissolve into next scene"). Map these to transition IDs: "Hard cut"→"hard-cut", "Fast dissolve"→"dissolve", "Quick energetic cut"→"hard-cut".
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
→ Keep as ONE scene with sceneType="montage"
→ Create sub-shots with independentGeneration=FALSE (cut from same clip)
→ The parent visualDescription shows the subject, sub-shots define cut timings

"Rapid montage of DIFFERENT subjects" (e.g., "child reaching, parent wiping, both laughing"):
→ Keep as ONE scene with sceneType="montage"
→ Create sub-shots with independentGeneration=TRUE on each
→ Each sub-shot gets its own visualDescription and videoMotionPrompt
→ Each generates a separate AI video clip (additional cost per sub-shot)
→ The parent scene's visualDescription becomes the FIRST sub-shot's visual

COST NOTE: Each sub-shot with independentGeneration=true costs 3 credits.
A montage with 3 independent sub-shots = 9 credits instead of 3.
The user will see this breakdown in the cost preview and can collapse to 1 shot.

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
Must be specific to the art style AND the scene content.
- If the script has a global style guide (e.g. "35mm Portra" in production notes) → use it consistently across all scenes. That's intentional.
- If no global guide → vary tokens based on scene content:
  - Food close-up → "macro lens, shallow depth of field, food photography lighting"
  - Night scene → "high ISO, neon reflections, ambient city glow"
  - Logo reveal → "clean sharp render, minimal depth of field, studio lighting"
  - Establishing wide → "wide-angle lens, deep focus, golden hour"
- Reference examples by style:
  - Cinematic → "35mm Kodak Portra 400, shallow depth of field, anamorphic lens flare"
  - Animation → "smooth vector lines, consistent stroke weight, cel-shaded"
  - Documentary → "handheld natural light, 4K sensor, ungraded footage"
  - Sports/commercial → "high-speed camera, crisp motion freeze, stadium lighting"
- NEVER use generic "high quality, 4K, masterpiece" tokens.
- NEVER put quality tokens inside videoMotionPrompt — that field is ONLY for motion/animation.

## GENERATION UNIT GROUPING (CRITICAL — this controls cost and quality)

Each output scene = ONE AI video generation call (~$0.35). Your job is to MINIMIZE generation calls while MAXIMIZING visual coverage.

RULE: Group shots by SUBJECT + LOCATION + VISUAL STYLE. One generation unit = one 5-second video clip that can be CUT into multiple sub-shots.

### How to group:
1. Read ALL visual descriptions across the entire script
2. Identify distinct SUBJECT+LOCATION combinations (e.g., "children at playground", "teenagers in car", "food close-ups")
3. Each unique combination = ONE generation unit with a descriptive ID
4. Assign generationUnitId to each scene
5. Mark primaryVisualForUnit=true on the BEST scene in each unit (most visually rich)
6. Other scenes in the same unit get primaryVisualForUnit=false (they reuse the generated video)

### Sub-shots for montage sections:
When a script section says "Quick cuts: A, B, C" and A/B/C share the same subject/location:
- Create ONE scene with subShots array
- Each sub-shot defines a cut point within the generated clip
- The assembly step will cut the 5s clip into 1-2s segments

Example for McDonald's "0:00-0:04 — Quick cuts: child reaching for toy, kids on playground, parent wiping ketchup":
→ All share subject "children at McDonald's" → ONE generation unit "childhood-mcdonalds"
→ visualDescription: "A young child reaching excitedly for a Happy Meal toy at a colorful McDonald's table, warm golden lighting, soft film grain"
→ subShots: [
    { description: "child's hand reaching for toy", startNormalized: 0, endNormalized: 0.33, targetDurationSeconds: 1.3 },
    { description: "kids laughing on playground", startNormalized: 0.33, endNormalized: 0.66, targetDurationSeconds: 1.3 },
    { description: "parent wiping ketchup", startNormalized: 0.66, endNormalized: 1.0, targetDurationSeconds: 1.4 }
  ]
→ sceneType: "montage"

### When to SPLIT into separate generation units:
- DIFFERENT subjects in DIFFERENT locations (runner vs basketball player vs gymnast)
- Dramatically different visual styles within the same script (nostalgic film vs crisp modern)
- Logo/brand reveals (always their own unit)

### When to MERGE into one generation unit:
- Same subject, same location, different camera angles → ONE unit, use sub-shots
- Same setting, related subjects (family members at same table) → ONE unit
- Progressive reveal of same scene (wide → close-up) → ONE unit

Target: ${options.targetDuration ? Math.ceil(options.targetDuration / 8) + '-' + Math.ceil(options.targetDuration / 4) : '4-8'} generation units for a ${options.targetDuration || '30-60'}-second video.

### Scene types:
- "continuous" — one unbroken shot, no cuts needed
- "montage" — rapid cuts from the same clip (MUST have subShots)
- "logo-reveal" — brand/logo moment
- "text-card" — title/end card
- "talking-head" — speaker on camera

### Special cases:
- Title cards / logo reveals → own generation unit, sceneType: "logo-reveal", narration: ""
- Text-on-screen / end cards → own unit, sceneType: "text-card"
- Talking head with B-roll → split: talking-head unit + separate B-roll units

## ASSET TYPE DECISION (CRITICAL — controls cost)
Classify EVERY scene with assetRecommendation. This decides whether we spend $0.35 on AI video or $0.012 on animated storyboard.

A scene is a "hero shot" (assetRecommendation="ai-video") if it meets ANY 2 of these:
- Contains the decisive emotional moment of the video
- Features the product/brand in a specific required composition
- Is the FIRST shot of the video (the hook)
- Is the LAST shot of the video (the lasting impression)
- Requires a specific human action or interaction that stock can't provide
- Is referenced by the voiceover with specific visual language ("watch as...", "imagine...", "look at...")

Maximum hero shots: 30-40% of total scenes. A 7-scene video = 2-3 hero shots, NOT 7.

Everything else:
- Generic establishing/ambient/b-roll → "stock" (will search free stock libraries)
- Quick montage cuts <2s, flashback, background → "animated-still" (Ken Burns on storyboard image)
- Data/stats scenes, abstract concepts, SaaS demos → "graphics-only" (motion graphics template)
- logo-reveal / text-card scenes → "animated-still" (no video gen needed)

COST IMPACT: One stunning AI hero shot + animated storyboard for the rest = professional result at 70% less cost.

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

## SFX EXTRACTION (CRITICAL — must split from audioDescription)
The Audio section often mixes music, narration, and SFX. You MUST split them:
- Text after "SFX:" or "Sound:" → editDirections.sfxCue (strip the label prefix)
- Music mood, background audio → audioDescription
- Spoken words → narration

Example: "**Audio:** SFX: Chalk dust puff, fabric rustle, light sharp click. Subtle ambient gym hum, faint rhythmic breathing."
→ sfxCue: "chalk dust puff, fabric rustle, light sharp click"
→ audioDescription: "subtle ambient gym hum, faint rhythmic breathing"

Example: "**Audio:** SFX: Exaggerated whoosh for jump, subtle crowd roar. Warm, comforting background music."
→ sfxCue: "exaggerated whoosh, subtle crowd roar"
→ audioDescription: "warm, comforting background music"

If no SFX mentioned → sfxCue: null (not empty string)

## EDIT DIRECTIONS MAPPING
### Transitions (map script cues to exact IDs):
VISUAL: DISSOLVE/"dissolve", FADE TO BLACK/"dip-to-black", FADE TO WHITE/"dip-to-white", FLASH/"flash", BLUR/"blur-transition", WIPE LEFT/"wipe-left", WIPE RIGHT/"wipe-right", SLIDE UP/"slide-up", SLIDE DOWN/"slide-down", ZOOM IN/"zoom-punch", ZOOM OUT/"zoom-out", WHIP PAN/"whip-pan", GLITCH/"glitch", FILM BURN/"film-burn", IRIS WIPE/"iris-wipe", SOFT CUT/"soft-cut"
EDITORIAL: CUT TO/"hard-cut", SMASH CUT/"smash-cut", MATCH CUT/"match-cut", JUMP CUT/"jump-cut", CUT ON ACTION/"cut-on-action"
DEFAULT: Any unlisted or ambiguous → "hard-cut"
Durations: dissolve=500, dip-to-black=600, flash=270, hard-cut=0, zoom-punch=270, blur-transition=600

### Pacing: "quick cuts"/"fast", "slow"/"slow", "build/escalating"/"building", default/"medium"

## META CONTENT — IGNORE FOR SCENES
Skip: Project overviews, creative briefs, emotional targets (header), genre/style descriptions, reference tracks, style guides, platform notes, production notes, color grade (global), sound design (global). These are metadata, NOT scenes.

CRITICAL: Return null for individual editDirections FIELDS not explicitly in the script. Do NOT invent field values.
BUT: Every scene MUST have an editDirections object (even if all fields inside are null). Never omit the editDirections object entirely.
${options.aspectRatio ? `ASPECT RATIO: ${options.aspectRatio}. Adjust composition and framing accordingly.` : ''}

## STYLE GUIDE EXTRACTION
- characterDescriptions: For recurring subjects (2+ scenes), create exhaustive visual description for consistency. Empty object if none.
- colorPalette: 3-8 specific named colors from visual descriptions (e.g., "cobalt blue", not "blue").
- environmentNotes: 1-3 sentences summarizing the dominant visual world.

SCRIPT:
${scriptText.substring(0, 24000)}
${scriptText.length > 24000 ? '\n[NOTICE: Script truncated at 24,000 characters. Process only content above. Add final scene with title "SCRIPT_TRUNCATED".]' : ''}`,
  });

  // ─── Post-processing validation ────────────────────────────────
  // The LLM sometimes breaks rules despite explicit instructions.
  // These fixes catch the most common violations.

  if (object.scenes) {
    const globalPacing = object.globalEditDirections?.pacing?.toLowerCase() || '';

    for (const scene of object.scenes) {
      // FIX: Clean "null" strings — LLM outputs the STRING "null" instead of actual null
      if (scene.editDirections) {
        for (const [key, val] of Object.entries(scene.editDirections)) {
          if (val === 'null' || val === 'undefined' || val === 'none' || val === 'N/A') {
            (scene.editDirections as any)[key] = undefined;
          }
        }
      }

      // FIX: Strip banned words from visualDescription
      if (scene.visualDescription) {
        scene.visualDescription = scene.visualDescription
          .replace(/\b(a )?montage of /gi, '')
          .replace(/\b(collage|diptych|triptych|split screen|grid layout|multiple panels|storyboard sequence)\b/gi, '')
          .replace(/\b(then|next|afterward|transitions to|cuts to|followed by)\b/gi, ',')
          .replace(/\s{2,}/g, ' ')
          .replace(/^[,\s]+/, '')
          .trim();
      }

      // FIX: Don't propagate global pacing to individual scenes
      // If every scene has the same pacing as global, the LLM is propagating
      if (scene.editDirections?.pacing && globalPacing) {
        const scenePacing = scene.editDirections.pacing.toLowerCase();
        // If scene pacing matches global pacing, it was probably propagated — remove it
        // Exception: keep it if the scene's narration/visual explicitly mentions pacing
        const sceneText = `${scene.narration || ''} ${scene.visualDescription || ''}`.toLowerCase();
        const hasPacingCue = /quick cut|slow reveal|building|rapid|fast[- ]paced|slow[- ]mo/i.test(sceneText);
        if (scenePacing === globalPacing.replace(/[- ]paced/g, '').replace('dynamic', 'fast') && !hasPacingCue) {
          scene.editDirections.pacing = undefined;
        }
      }

      // FIX: Extract SFX from audioDescription when sfxCue is missing
      // The LLM sometimes puts SFX cues in audioDescription without splitting
      if (!scene.editDirections?.sfxCue && scene.audioDescription) {
        const sfxMatch = scene.audioDescription.match(/(?:SFX|Sound|sound effect)[:\s]+([^.]+)/i);
        if (sfxMatch) {
          if (!scene.editDirections) scene.editDirections = {} as any;
          scene.editDirections.sfxCue = sfxMatch[1].trim();
        }
        // Also check for obvious SFX words even without the label
        if (!scene.editDirections?.sfxCue) {
          const sfxWords = scene.audioDescription.match(/\b(whoosh|crash|slam|click|pop|sizzle|crunch|buzz|chime|thud|splash|drip|crackle|rustle|shatter|bang|ring|beep|honk|chirp|roar)\b/gi);
          if (sfxWords && sfxWords.length >= 1) {
            if (!scene.editDirections) scene.editDirections = {} as any;
            // Extract the sentence containing SFX words
            const sentences = scene.audioDescription.split(/[.!]/);
            const sfxSentences = sentences.filter(s => sfxWords.some(w => s.toLowerCase().includes(w.toLowerCase())));
            if (sfxSentences.length > 0) {
              scene.editDirections.sfxCue = sfxSentences.map(s => s.trim()).join(', ');
            }
          }
        }
      }
    }
  }

  // ─── Post-process: auto-fill assetRecommendation if missing ──────────
  // Gemini sometimes ignores new schema fields. Apply the KB's AS-001/AS-002 rules
  // deterministically: hero shots (first, last, emotional peak) get ai-video,
  // montage sub-shots <2s get animated-still, logo/text-card get animated-still.
  if (object.scenes) {
    const totalScenes = object.scenes.length;
    const maxHeroShots = Math.max(2, Math.ceil(totalScenes * 0.35)); // 30-35% hero shots
    let heroCount = 0;

    for (const scene of object.scenes) {
      if ((scene as any).assetRecommendation) continue; // LLM already classified it

      const sceneType = (scene as any).sceneType || 'continuous';
      const idx = scene.sceneIndex;
      const narration = (scene.narration || '').toLowerCase();

      // Rule: logo-reveal and text-card never need AI video
      if (sceneType === 'logo-reveal' || sceneType === 'text-card') {
        (scene as any).assetRecommendation = 'animated-still';
        continue;
      }

      // Rule: first scene (hook) and last non-logo scene are hero shots
      const isFirst = idx === 0;
      const isLast = idx === totalScenes - 1 || (idx === totalScenes - 2 && (object.scenes[totalScenes - 1] as any).sceneType === 'logo-reveal');

      // Rule: voiceover with specific visual language = hero
      const hasVisualLanguage = /watch as|imagine|look at|see how|picture this/i.test(narration);

      // Rule: emotional peak (dramatic/inspirational mood) = hero candidate
      const isEmotionalPeak = scene.mood === 'dramatic' || scene.mood === 'inspirational';

      // Montage scenes with short sub-shots → animated-still (Ken Burns)
      const subShots = (scene as any).subShots || [];
      const hasShortSubShots = subShots.length > 0 && subShots.every((s: any) => s.targetDurationSeconds <= 2);

      if (hasShortSubShots && !isFirst && !isLast) {
        (scene as any).assetRecommendation = 'animated-still';
      } else if ((isFirst || isLast || hasVisualLanguage || isEmotionalPeak) && heroCount < maxHeroShots) {
        (scene as any).assetRecommendation = 'ai-video';
        heroCount++;
      } else if (heroCount < maxHeroShots && sceneType === 'continuous') {
        // Continuous scenes are good hero candidates
        (scene as any).assetRecommendation = 'ai-video';
        heroCount++;
      } else {
        (scene as any).assetRecommendation = 'animated-still';
      }

      console.log(`[SceneParser] Asset classification: scene ${idx} "${scene.title}" → ${(scene as any).assetRecommendation} (hero=${heroCount}/${maxHeroShots})`);
    }
  }

  // ─── Post-process: extract transitions from raw script ──────────
  // The LLM often outputs empty editDirections.transition even when the
  // script explicitly says "Transition: Hard cut to next scene" or "DISSOLVE TO".
  // Scan the raw script for transition cues near each scene boundary.
  if (object.scenes && scriptText) {
    const transitionPatterns: Array<{ regex: RegExp; type: string; durationMs: number }> = [
      { regex: /(?:hard\s*cut|cut\s*to|straight\s*cut)/i, type: 'hard-cut', durationMs: 0 },
      { regex: /(?:dissolve|cross[- ]?dissolve|fast\s*dissolve)/i, type: 'dissolve', durationMs: 500 },
      { regex: /(?:fade\s*(?:to\s*)?black|dip\s*to\s*black)/i, type: 'dip-to-black', durationMs: 600 },
      { regex: /(?:fade\s*(?:to\s*)?white|dip\s*to\s*white|flash)/i, type: 'dip-to-white', durationMs: 400 },
      { regex: /(?:wipe|swipe)/i, type: 'wipe-left', durationMs: 500 },
      { regex: /(?:zoom\s*(?:in|punch))/i, type: 'zoom-punch', durationMs: 270 },
      { regex: /(?:whip\s*pan)/i, type: 'whip-pan', durationMs: 300 },
      { regex: /(?:match\s*cut)/i, type: 'match-cut', durationMs: 0 },
      { regex: /(?:jump\s*cut)/i, type: 'jump-cut', durationMs: 0 },
      { regex: /(?:smash\s*cut)/i, type: 'smash-cut', durationMs: 0 },
    ];

    // Find transition mentions in the raw script near scene boundaries
    const scriptLower = scriptText.toLowerCase();
    for (const scene of object.scenes) {
      if (scene.editDirections?.transition) continue; // Already has transition

      // Search for transition keywords near this scene's narration text
      const narrationIdx = scene.narration ? scriptLower.indexOf(scene.narration.toLowerCase().substring(0, 30)) : -1;
      // Search in a window around the narration position (±200 chars)
      const searchStart = Math.max(0, narrationIdx - 200);
      const searchEnd = Math.min(scriptText.length, narrationIdx + 200);
      const searchWindow = narrationIdx >= 0
        ? scriptText.substring(searchStart, searchEnd)
        : '';

      // Also check the scene's title in the raw script
      const titleIdx = scene.title ? scriptLower.indexOf(scene.title.toLowerCase().substring(0, 20)) : -1;
      const titleWindow = titleIdx >= 0
        ? scriptText.substring(Math.max(0, titleIdx - 200), Math.min(scriptText.length, titleIdx + 300))
        : '';

      const combinedWindow = `${searchWindow} ${titleWindow}`;

      for (const pattern of transitionPatterns) {
        if (pattern.regex.test(combinedWindow)) {
          if (!scene.editDirections) scene.editDirections = {} as any;
          scene.editDirections.transition = { type: pattern.type, durationMs: pattern.durationMs };
          console.log(`[SceneParser] Post-process: scene ${scene.sceneIndex} transition=${pattern.type} (from raw script)`);
          break; // Use first match
        }
      }
    }
  }

  // ─── Post-process: correct scene durations for target total ────
  // The LLM sometimes produces durations that sum to much more than the target.
  // A 30s reel with 7 scenes should have ~4-5s per scene, not 9-12s.
  if (object.scenes && object.scenes.length > 0) {
    const totalDuration = object.scenes.reduce((sum: number, s: any) => sum + (s.durationSeconds || 5), 0);
    // Extract target duration from script metadata if available
    const targetMatch = scriptText.match(/(\d+)[- ]?(?:second|sec|s)\s+(?:reel|video|clip|short)/i);
    const targetDuration = targetMatch ? parseInt(targetMatch[1]) : null;

    if (targetDuration && totalDuration > targetDuration * 1.5) {
      // Scenes are too long — proportionally shrink to fit target
      const scaleFactor = targetDuration / totalDuration;
      console.log(`[SceneParser] Post-process: durations total ${totalDuration}s but target is ${targetDuration}s — scaling by ${scaleFactor.toFixed(2)}`);
      for (const scene of object.scenes) {
        const original = scene.durationSeconds || 5;
        scene.durationSeconds = Math.max(3, Math.round(original * scaleFactor));
      }
      // Verify new total
      const newTotal = object.scenes.reduce((sum: number, s: any) => sum + (s.durationSeconds || 5), 0);
      object.totalDurationSeconds = newTotal;
      console.log(`[SceneParser] Post-process: adjusted durations total ${newTotal}s`);
    }
  }

  // ─── Post-process: detect montage scenes via dedicated Gemini call ─────
  // The main parser LLM consistently merges multi-shot visual descriptions into
  // single sentences, making regex-based detection unreliable. Instead, we make a
  // SEPARATE fast Gemini call that reads the RAW SCRIPT and identifies which scenes
  // have multiple distinct shots that need independent video generation.
  //
  // This is more reliable than regex because the LLM understands context:
  // "Quick cuts: A child reaching. Kids laughing. Parent wiping." → 3 shots
  // "A family walking towards McDonald's." → 1 shot (no decomposition)
  //
  // Cost: ~$0.001 (Gemini Flash-Lite, ~500 tokens)
  if (object.scenes && scriptText && object.scenes.some((s: any) => !s.subShots || s.subShots.length === 0)) {
    try {
      const MontageDetectionSchema = z.object({
        montageScenes: z.array(z.object({
          sceneIndex: z.number(),
          shots: z.array(z.object({
            description: z.string().describe('ONE distinct visual moment — single subject, single action, single framing'),
            targetDurationSeconds: z.number().describe('How long this shot should last (1-3 seconds for rapid cuts)'),
          })),
        })).describe('Only include scenes that have 3+ DISTINCT shots with DIFFERENT subjects. Do NOT include scenes with one continuous subject.'),
      });

      const montageModel = google('gemini-2.5-flash-lite');

      const { object: montageResult } = await generateObject({
        model: montageModel,
        schema: MontageDetectionSchema,
        temperature: 0.1,
        prompt: `Read this script and identify scenes that describe MULTIPLE DISTINCT visual shots (3+) that would each need a SEPARATE AI video clip.

RULES:
- Only flag scenes where the VISUAL section lists 3+ DIFFERENT subjects/actions
- "Quick cuts: A child reaching. Kids laughing. Parent wiping." → 3 shots (3 different actions)
- "Teenagers sharing fries in a car at night." → 1 shot (one continuous moment, do NOT decompose)
- "Close-up on a fry, then a bite of a Big Mac, then arches through window." → 3 shots (3 different subjects)
- "A family sharing a meal, a grandparent smiling." → 1-2 subjects in same setting, do NOT decompose unless they are truly different scenes
- Each shot description must be a COMPLETE visual prompt for AI image/video generation

PARSED SCENES (with their narration for context):
${object.scenes.map((s: any) => `Scene ${s.sceneIndex}: "${s.title}" — Narration: "${s.narration}"`).join('\n')}

RAW SCRIPT:
${scriptText.substring(0, 8000)}`,
      });

      // Apply montage decomposition from Gemini result
      for (const montage of montageResult.montageScenes || []) {
        const scene = object.scenes.find((s: any) => s.sceneIndex === montage.sceneIndex);
        if (!scene || (scene.subShots && scene.subShots.length > 0)) continue;
        if (montage.shots.length < 3) continue; // Safety: only decompose 3+ shots

        scene.sceneType = 'montage';
        scene.subShots = montage.shots.map((shot: any, idx: number) => ({
          description: shot.description,
          startNormalized: idx / montage.shots.length,
          endNormalized: (idx + 1) / montage.shots.length,
          targetDurationSeconds: shot.targetDurationSeconds || Math.max(1.5, (scene.durationSeconds || 5) / montage.shots.length),
          independentGeneration: true,
          visualDescription: shot.description,
          videoMotionPrompt: scene.videoMotionPrompt || '',
        }));

        console.log(`[SceneParser] Montage Gemini: scene ${scene.sceneIndex} decomposed into ${scene.subShots.length} sub-shots`);
      }
    } catch (montageErr: any) {
      console.warn(`[SceneParser] Montage detection Gemini call failed (non-fatal): ${montageErr.message}`);
      // Non-fatal — scenes will be treated as single continuous shots
    }
  }

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
  const model = google('gemini-2.5-flash');

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
  const model = google('gemini-2.5-flash');

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
