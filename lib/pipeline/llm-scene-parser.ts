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
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { FILTER_PRESET_IDS } from '@/lib/editron/data/filter-presets';

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
  filterPresetId: z.enum(FILTER_PRESET_IDS).optional().describe(
    `Color grade for this scene, mapped to preset ID. Only set if the script explicitly describes a color mood for this specific scene. Options (source: lib/editron/data/filter-presets.ts): ${FILTER_PRESET_IDS.join(', ')}. null if not mentioned.`,
  ),
  pacing: z.enum(['fast', 'medium', 'slow', 'building', 'beat-synced']).optional().describe('Pacing for THIS specific scene. ONLY set if the script explicitly describes pacing for this scene (e.g. "quick cuts", "slow reveal", "building tension"). Do NOT propagate global pacing to individual scenes — the global pacing field handles that. null if this scene has no explicit pacing instruction.'),
  sfxCue: z.string().optional().describe('Specific sound effect cue beyond general audio. Only set if the script explicitly describes an SFX moment (e.g. "whoosh", "heartbeat", "glass shatter"). null if not mentioned.'),
  motionGraphicCue: z.string().optional().describe('Legacy free-form motion graphic description. For exact on-screen text, use onScreenText instead. null if not mentioned.'),
  onScreenText: z.array(z.string()).optional().describe('Structured array of on-screen text strings extracted VERBATIM from the script\'s "On-Screen Text:" / "Text:" / "(Appears briefly:)" sections. Each entry is ONE distinct visible text line. Preserve EXACT wording including punctuation, hashtags, emoji, and quotes.\n\nStructural pattern (placeholders in <angle brackets> — DO NOT copy the brackets, replace them with the actual script text):\n- Script says `On-Screen Text: "<line A>"` → ["<line A>"]\n- Multiple parenthetical flashes in one scene: `(Appears briefly: "<flash 1>") (Appears briefly: "<flash 2>") (Appears briefly: "<flash 3>")` → ["<flash 1>", "<flash 2>", "<flash 3>"] (one entry per distinct flash)\n- Closing scene tagline + CTA: `On-Screen Text: "<tagline>"` and `On-Screen Text: "<CTA or hashtag line>"` → ["<tagline>", "<CTA or hashtag line>"]\n\nCRITICAL: Do NOT re-word, shorten, merge, or INVENT text. Every string you emit MUST appear character-for-character in the script. Hallucinations are stripped by a downstream validator, so inventing text just wastes your tokens. Return empty array [] or omit if the script has no on-screen text for this scene.'),
  cameraRig: z.string().optional().describe('Camera movement/rig notes from the script (e.g. "steadicam", "dolly", "crane shot"). Preserved for reference. null if not mentioned.'),
}).describe('Editing directions for this scene. Return null for any field NOT explicitly present in the script — do NOT invent directions.');

const SubShotSchema = z.object({
  description: z.string().describe('What this sub-shot shows — short visual summary extracted VERBATIM from the script shot line. Shape: "CAMERA_FRAMING of SUBJECT performing ACTION in SETTING". Do not paraphrase or substitute content from any example — read what the user\'s Shot N line literally describes.'),
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
  visualDescription: z.string().describe('Static image prompt: ONE primary subject, ONE setting, ONE frozen moment. This generates a SINGLE photograph.\n\nShape rule (abstract — these examples use placeholder tokens, NEVER copy them to output):\nBAD shape: "SUBJECT doing ACTION_1, then SUBJECT doing ACTION_2, then SUBJECT doing ACTION_3" — 3 moments in one string produces a collage artifact.\nGOOD shape: "SUBJECT doing ACTION in SETTING, LIGHTING_DESCRIPTION, CAMERA_FRAMING" — one frozen moment, one camera position.\n\nFill in SUBJECT, ACTION, SETTING, LIGHTING_DESCRIPTION, CAMERA_FRAMING with the EXACT subject/action/setting the user\'s script names. Pick the HERO moment from the script. Other visual beats become separate scenes or sub-shots. Do not substitute content from these placeholders.'),
  videoMotionPrompt: z.string().describe('Video animation prompt: how this still frame comes to life. Camera movement (dolly, pan, orbit), subject micro-motion, atmospheric effects (particles, light shifts, fabric movement). Keep subtle and cinematic.'),
  audioDescription: z.string().describe('DEPRECATED — kept for backward compat. Write to musicDescription + sfxDescription instead. If you must use this field, put ONLY music/mood info here.'),
  musicDescription: z.string().describe('Music/BGM mood and style for this scene. ONLY music — no sound effects, no ambient sounds.\n\nOutput shape (placeholders — DO NOT copy, fill from script): "GENRE_OR_INSTRUMENTATION, MOOD_DESCRIPTOR, ENERGY_CURVE". Read the user\'s script Music/Audio line and condense it into this shape using the user\'s literal words. Empty string if the script has no music direction.'),
  sfxDescription: z.string().describe('Sound effects and ambient audio for this scene. Three categories:\n- Ambient bed: room tone, outdoor air, restaurant buzz, traffic hum\n- Spot SFX: cup clink, door close, footstep, paper rustle\n- Feature SFX: whoosh, impact hit, dramatic stinger, glass shatter\nDo NOT include music/BGM here — that goes in musicDescription. Empty string if no SFX direction in script.'),
  durationSeconds: z.number().describe('Total duration this generation unit occupies in the final video (sum of all sub-shot durations if sub-shots exist). Use the script timestamps or narration length to determine duration. Each scene = one AI video generation call (~$0.35), so group related visual beats as sub-shots within ONE scene rather than creating many tiny separate scenes.'),
  mood: z.enum(['energetic', 'calm', 'serious', 'playful', 'mysterious', 'dramatic', 'inspirational', 'neutral']).describe('Scene mood based on actual content: energetic=action/montage/high-energy, calm=gentle/reflective/slow moments, serious=corporate/formal/grave, playful=fun/light/humorous, mysterious=suspense/unknown/moody, dramatic=emotional-peak/conflict/revelation, inspirational=uplifting/triumph/brand-aspiration, neutral=informational/transitional. Vary based on what happens in each scene — do NOT assign the same mood to every scene.'),
  imageQualityTokens: z.string().describe('Style-appropriate quality descriptors for the image. E.g. for cinematic: "35mm film grain, shallow depth of field, anamorphic lens". For anime: "cel-shaded, clean linework, vibrant saturation". Tailor to the art style.'),
  videoQualityTokens: z.string().describe('Style-appropriate quality descriptors for the video. E.g. for cinematic: "smooth cinematic footage, film grain, professional color grade". For anime: "fluid animation, consistent character model, clean frames". Tailor to the art style.'),
  editDirections: SceneEditDirectionsSchema.optional().describe('Editing directions extracted from the script. ONLY populate fields that are explicitly mentioned in the script text. Return null/omit for anything not stated.'),

  // Generation unit + sub-shots
  generationUnitId: z.string().describe('Group ID for scenes generated from the SAME video clip. Scenes with the same generationUnitId share one AI video generation call. Use a short descriptive ID like "playground", "car-night", "food-closeup". Each unique ID = one $0.35 video gen call.'),
  primaryVisualForUnit: z.boolean().describe('true if this scene is the PRIMARY visual for its generation unit (the one that gets generated). false if this scene reuses/cuts from another scene\'s generated video.'),
  subShots: z.array(SubShotSchema).optional().describe('If the script describes multiple quick cuts within this scene\'s time window (format: "Quick cuts: BEAT_A, BEAT_B, BEAT_C"), define sub-shots here.\n\nDIFFERENT subjects across beats: set independentGeneration=true on each sub-shot with its own visualDescription extracted verbatim from that beat. Each generates a separate AI video clip (separate cost).\n\nSAME subject across beats (same thing in different framings): leave independentGeneration=false. Sub-shots cut from one generated clip. Parent visualDescription describes the subject; sub-shots mark cut timings.\n\nLeave empty/omit for continuous scenes.'),
  sceneType: z.enum(['continuous', 'montage', 'logo-reveal', 'text-card', 'talking-head']).describe('Scene type: "continuous" = one unbroken shot, "montage" = rapid cuts (may have sub-shots with independent generation), "logo-reveal" = brand/logo moment, "text-card" = title/end card, "talking-head" = speaker on camera'),
  assetRecommendation: z.enum(['ai-video', 'stock', 'animated-still', 'graphics-only']).describe(`Almost always "ai-video". Only use "graphics-only" for data/chart/infographic scenes. The system handles stock and animated-still automatically — you should not set those.`),
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
  narrativeArc: z.enum([
    // ── Classical & Long-Form Structures (§1.2) ──────────────────────────────
    // Works at any length but needs enough time to hit all beats.
    'three-act',           // Setup → Confrontation → Resolution. Universal default for product/brand ads.
    'five-act',            // Freytag's Pyramid. Use for 2-5 min content; too many beats for <60s.
    'hero-journey',        // Ordinary world → disruption → transformation → return. Testimonials, founder stories.
    'story-circle',        // Dan Harmon's 8 beats. Episodic/series content — each piece feels complete but connected.
    'kishotenketsu',       // 起承転結: intro → development → twist → reconciliation. No conflict. Lifestyle/food/family brands.
    'save-the-cat',        // Blake Snyder's 15 beats. Long-form brand films ≥2 min. Too dense for <2 min.
    'pixar-spine',         // "Once upon a time… until one day… because of that… until finally…". Origin/change narratives.
    'rasa',                // Indian classical aesthetic flavor. Organizes content around one of 9 emotional rasas. Indian-audience content.
    // ── Short-Form Native Structures (§1.2) ──────────────────────────────────
    // Designed for sub-60s social content. Work at any length.
    'hook-value-cta',      // Attention grab → deliver value → call to action. Default for social media ads.
    'problem-agitate-solve', // Name the pain → intensify → offer solution. Direct-response, SaaS, health.
    'before-after',        // Dissatisfied state → transformation moment → satisfied state. Fitness, beauty, renovation.
    'myth-truth',          // Common belief → shatter it → replace with truth. Educational, contrarian positioning.
    'countdown-ranking',   // #N down to #1. Retention-boosting; viewer stays for #1. Listicles, "top X" content.
    'day-in-the-life',     // Morning → activities → evening. Influencer, brand culture, behind-the-scenes.
    'testimonial-arc',     // Who I am → my problem → found solution → result → recommendation. Customer stories.
    'versus-comparison',   // Option A → Option B → optional verdict. Product comparisons, competitive positioning.
    'challenge-attempt',   // Set challenge → attempt(s) → outcome. Social challenges, product stress tests.
    'what-if',             // Pose question → explore possibility → reveal implication. Thought leadership, innovation.
    'loop',                // End leads back to beginning — designed for replay. Short-form social optimized for algorithm.
    'reveal-unboxing',     // Conceal → build anticipation → reveal → reaction. Product launches, unboxing, mystery.
    'micro-narrative-stack', // 3-5s micro-stories stacked until theme emerges. Testimonial compilations, community content.
    // ── Non-Linear Structures (§1.2) ─────────────────────────────────────────
    'in-medias-res',       // Start at climax → flashback to beginning → catch up → resolve. High-stakes, action.
    'circular',            // Starts and ends with same image/moment — changed meaning. Brand films, emotional storytelling.
    'fragmented-mosaic',   // Disconnected pieces assemble into meaning. Art-house brand films, music videos, mood pieces.
    'rashomon',            // Same event from 2+ viewpoints. Multi-segment brand campaigns, "many voices" content.
    'parallel-narrative',  // Two stories told simultaneously, converging at the end. "Two worlds collide" brand stories.
  ]).optional().describe(
    'Narrative structure this script follows, detected from its shape and content. ' +
    'Use §1.3 selection criteria — pick the structure whose definition best matches the script:\n' +
    '• Content type: product/explainer → hook-value-cta | problem-agitate-solve; ' +
    'transformation → before-after | hero-journey; episodic/series → story-circle; ' +
    'comparison → versus-comparison; unboxing/reveal → reveal-unboxing; testimonial → testimonial-arc\n' +
    '• Duration: five-act and save-the-cat require 2+ min (too many beats for shorter content). ' +
    'hook-value-cta, before-after, kishotenketsu work at any length.\n' +
    '• Brand voice: warm/lifestyle/harmony brands → kishotenketsu | day-in-the-life | rasa; ' +
    'disruptive/tech/problem-framing brands → myth-truth | problem-agitate-solve\n' +
    '• Cultural context: Indian audience → rasa; East Asian audience → kishotenketsu; ' +
    'Western default → three-act | hero-journey\n' +
    '• Platform: TikTok/Reels → hook-value-cta | loop | countdown-ranking; ' +
    'YouTube → story-circle | pixar-spine; LinkedIn → what-if | testimonial-arc\n' +
    'null if the structure is genuinely mixed or not identifiable from the script.',
  ),
}).describe('Global editing directions for the entire video. ONLY populate from explicit script/production notes content.');

const ParseResultSchema = z.object({
  scenes: z.array(SceneSchema).min(1).max(60),
  overallMusicPrompt: z.string().describe('Overall background music style/mood for the entire video. E.g. "cinematic orchestral with building tension" or "upbeat electronic pop with driving beat"'),
  characterDescriptions: z.record(z.string(), z.string()).describe('Character sheet: map of recurring character/subject name → detailed visual description for cross-scene consistency. Only include subjects appearing in 2+ scenes. Empty object if no recurring subjects.'),
  colorPalette: z.array(z.string()).describe('Specific color names used throughout the script\'s visual identity. Extract 3-8 dominant colors from the visual descriptions. Use specific color names, not generic ("cobalt blue" not "blue").'),
  environmentNotes: z.string().describe('Brief description (1-3 sentences) of the overall visual environment and setting across the video. E.g. "Modern minimalist tech office with floor-to-ceiling windows, warm natural lighting, and clean geometric furniture." Summarize the dominant setting/world of the script.'),
  globalEditDirections: GlobalEditDirectionsSchema.optional().describe('Global editing instructions extracted from the script\'s production notes, creative direction, or style guide sections. ONLY populate from explicit content in the script.'),
  // LLM-suggested editing category — used by profile detection to filter before keyword scoring.
  // The LLM reads the FULL script semantically (content type, mood, visual style, audience) and
  // picks the broad category. Detection then only scores profiles within that category, eliminating
  // cross-category false positives (e.g., athletic brand ad wrongly matching "Screen Demo" because
  // the word "screen" appeared in "On-Screen Text"). See pipeline_investigations.md 2026-04-17
  // "Profile detection — F-03 Screen Demo false positive" for the motivating bug.
  suggestedProfileCategory: z.enum([
    'platform-native',    // Platform-optimized: YouTube, Instagram Reels, TikTok, LinkedIn, Facebook
    'industry-vertical',  // Sector-specific: SaaS/Tech, Food, Fashion, Real Estate, Athletic/Sports, Healthcare
    'content-format',     // Structure-defined: Listicle, How-To, Comparison, Case Study, Event Recap
    'cinematic-style',    // Aesthetic-first: Cinematic Premium, Documentary, Bold/High Energy, Retro, Luxury
    'narrative-mode',     // Story-structure: Brand Story, Testimonial, Problem-Solution, Before-After
    'production-mode',    // Footage-type: Talking Head, Screen Recording, Live Event
    'special-purpose',    // Fallback/blend: Universal Clean, Custom Style-Blend
  ]).describe('What BROAD editing category fits this script best. Pick based on the overall content intent, NOT individual keywords.\n\nCategory decision rules (use the category whose definition the script matches, do not pattern-match on brands):\n- "industry-vertical" — script is for a specific industry/sector (sports, automotive, finance, healthcare, food, etc.).\n- "production-mode" — script specifies a distinctive footage TYPE (screen recording, talking head, live event, interview).\n- "platform-native" — script explicitly targets a platform\'s native format (Reels, TikTok, Shorts, Stories).\n- "cinematic-style" — script emphasizes AESTHETIC over content type (premium, documentary, bold/high-energy, retro, luxury).\n- "narrative-mode" — script follows a specific STORY STRUCTURE (testimonial, before-after, problem-solution, brand origin).\n- "special-purpose" — general marketing video with no distinctive category anchor, use as fallback.'),
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
  // OLD: hardcoded 'gemini-2.5-flash'. NEW: configurable via env var LLM_PARSER_MODEL.
  const model = (google as any)(DEFAULT_CONFIG.aiModels.sceneParserModel, { structuredOutputs: true });

  // Timeout: 120s cap. The ParseResultSchema is deeply nested (80+ Zod fields)
  // and structured output on Gemini 2.5 Flash can be slow with complex schemas.
  // 90s was too tight — caused regex fallback on normal scripts.
  // 120s gives breathing room while staying well under Vercel's 300s limit.
  // geminiRetry (Batch 4, Toyota A.gemini.6): transient 429 / 5xx / network
  // errors get up to 3 retries with exponential backoff (1.5s → 3s → 6s → 12s).
  // Daily quota exceeded + 401/403 bail immediately per retryer's classifier.
  const { geminiRetry } = await import('./gemini-retry');
  const { object } = await geminiRetry(() => generateObject({
    model,
    schema: ParseResultSchema,
    temperature: 0.05,
    // 2026-04-17: bumped 120s → 180s after witnessing cold-start timeouts on the
    // new GCP project (insturix-493414). First Gemini call of the day often takes
    // 120-150s (structured output on complex Zod schema). 180s gives headroom while
    // staying well under Vercel's 300s function limit (leaves ~100s for other work).
    // See pipeline_investigations.md "LLM parser cold-start timeouts" for root cause.
    abortSignal: AbortSignal.timeout(180_000),
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
Same subject, same camera setup (one subject doing a continuous action):
→ Keep as one pipeline scene. Pick the most visually striking moment. Other beats inform videoMotionPrompt.

Same subject, different camera setups (one subject shown from multiple framings in sequence):
→ SPLIT — each framing requires its own photograph. Group beats that share the same framing.

Different subjects (distinct people/objects across beats):
→ ALWAYS SPLIT into separate pipeline scenes.

### Handling montage descriptions:

Pattern: "Rapid montage of X details" where X is ONE subject (multiple framings of the same thing):
→ Keep as ONE scene with sceneType="montage"
→ Create sub-shots with independentGeneration=FALSE (cut from same generated clip)
→ The parent visualDescription shows the single subject, sub-shots define cut timings only

Pattern: "Rapid montage of DIFFERENT subjects" (each beat shows a different thing):
→ Keep as ONE scene with sceneType="montage"
→ Create sub-shots with independentGeneration=TRUE on each
→ Each sub-shot gets its own visualDescription + videoMotionPrompt describing ITS specific subject extracted verbatim from the script
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

### Sub-shots for montage sections — TWO distinct modes:

**Mode A — Sub-shots CUT from ONE generated clip** (cheap, 1 video gen cost)
When all sub-shots share the SAME subject in the SAME location with continuous action:
- ONE scene, ONE visualDescription, ONE video gen
- Sub-shots have \`independentGeneration: false\` (or omitted)
- Each sub-shot is just a cut-point marker inside the single generated clip

Example: "close-up of shoe sole → laces tightening → heel lift" (same shoe, same set)
→ ONE scene, ONE clip, 3 sub-shots that reference time ranges in that one clip.

**Mode B — Sub-shots generated INDEPENDENTLY** (expensive, N video gen cost)
When sub-shots show DIFFERENT subjects, DIFFERENT locations, DIFFERENT eras, or DIFFERENT actors:
- ONE scene, but EACH sub-shot has its OWN distinct visualDescription + videoMotionPrompt
- Set \`independentGeneration: true\` on EVERY sub-shot in this mode
- The pipeline will generate a separate storyboard image AND a separate video clip per sub-shot
- Cost = (N × $0.02 image) + (N × $0.35 video). The user pre-approves this in the cost preview.

RULE (abstract — do NOT copy any content from this block, it's a pattern schema):
When the script describes a montage across DIFFERENT eras/times/subjects/locations
(format: "SCENE_BEAT_1 → SCENE_BEAT_2 → SCENE_BEAT_3 → SCENE_BEAT_N"),
output N sub-shots where each sub-shot's visualDescription is the EXACT subject
and setting the user's script names for that beat. Every sub-shot gets
independentGeneration: true. Each beat needs its own reference image because
one image cannot represent N different subjects.

Do NOT collapse the N beats into a single visualDescription.
Do NOT invent beat content — use the subjects the script literally names.
Tokens SCENE_BEAT_* above are placeholders; in real output they are replaced
by the verbatim subjects from the user's script.

### LITERAL SHOT COUNTS (MANDATORY — honor the script's explicit shot numbering)

If the script uses explicit "Shot 1: / Shot 2: / Shot 3:" markers, produce EXACTLY that many sub-shots.
Do NOT collapse Shot 1-3 into one visualDescription. Do NOT add extra sub-shots the script didn't ask for.

RULE (abstract — do NOT copy any content from this block, it's a pattern schema):
Script format: "Scene N: TITLE / Shot 1: SHOT_DESCRIPTION_ONE / Shot 2: SHOT_DESCRIPTION_TWO / Shot 3: SHOT_DESCRIPTION_THREE"
Output: ONE scene with EXACTLY 3 sub-shots (N sub-shots for N shots, no more no less).
        Each sub-shot's visualDescription = SHOT_DESCRIPTION_N extracted verbatim from that shot line.

MODE decision:
- If SHOT_DESCRIPTION_1/2/3 are 3 VISUALLY DISTINCT subjects (different things in different framings)
  → MODE B: all sub-shots get independentGeneration: true + each writes its own visualDescription.
- If SHOT_DESCRIPTION_1/2/3 show the SAME subject from different framings (close-up / medium / wide of one thing)
  → MODE A: one shared clip, sub-shots are time-range markers only.

WRONG patterns:
- Collapsing N shots into one visualDescription — this loses (N-1)/N of the user's intended visuals.
- Adding extra sub-shots the script didn't list — the script's shot count is canonical.

Tokens SHOT_DESCRIPTION_* above are placeholders; real output uses the verbatim
subject each shot line describes.

### ANTI-PATTERN — do NOT duplicate previous scenes' montage content into later scenes

Scripts often follow "Hook → Montage → Resolution" structure. The RESOLUTION scene is usually a UNIFIED present-day scene (one subject, one setting, emotional payoff), NOT another montage.

WRONG example (abstract — the parser has done this before with various scripts):
  Script Scene 3 (resolution): "<unified present-day hero moment the script describes — could be a team gathered around a desk, an athlete crossing a finish line, a family at a dinner table, a user closing an app with satisfaction>"
  Parser output: 5 sub-shots REPEATING Scene 2's montage beats (different eras / different subjects / different locations).
  → This DUPLICATES Scene 2's montage into Scene 3. Scene 3 is supposed to be ONE unified present-day beat.

CORRECT output for that Scene 3:
  ONE scene (or 1-3 sub-shots of the SAME unified moment: wide shot → close-up of hands → reaction), ALL showing the SAME unified present-day subject and setting.
  NO era shifts. NO repeat of Scene 2's shot list.
  sceneType: "continuous" (or "montage" ONLY if the script EXPLICITLY lists different sub-shots within Scene 3).

Rule: each scene's subShots MUST describe DIFFERENT content from OTHER scenes' subShots. If you find yourself repeating Scene 2's shot descriptions in Scene 3's subShots, STOP — Scene 3 is a different scene and needs its own shot list extracted verbatim from the script.

### When to SPLIT into separate generation units:
- DIFFERENT subjects in DIFFERENT locations (any two beats that do not share a subject or a setting).
- Dramatically different visual styles within the same script (e.g., script calls for period-look footage next to crisp modern footage).
- Logo/brand reveals (always their own unit — even if thematically connected to adjacent scenes).

### When to MERGE into one generation unit:
- Same subject, same location, different camera angles → ONE unit, use Mode A sub-shots
- Same setting, related subjects (family members at same table) → ONE unit
- Progressive reveal of same scene (wide → close-up) → ONE unit

Target: ${options.targetDuration ? Math.ceil(options.targetDuration / 8) + '-' + Math.ceil(options.targetDuration / 4) : '4-8'} generation units (scenes) for a ${options.targetDuration || '30-60'}-second video. Each scene = one AI video generation call (~$0.35). Use montage sub-shots to group rapid visual beats within one scene rather than making each beat a separate scene. This saves cost AND produces better montage pacing.

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

## ASSET TYPE
Set assetRecommendation to "ai-video" for all scenes. The only exception: set "graphics-only" if the scene is purely data/charts/infographics with no real-world visuals. The system handles everything else automatically.

## DURATION
If the script provides timestamps → calculate durationSeconds for each pipeline scene.
If narration exists → estimate: ~150 words per minute, add 1-2s buffer.
If no data → default to 5.

## AUDIO EXTRACTION (MUSIC vs SFX — MUST SPLIT)
The script's Audio section often mixes music direction with sound effects. You MUST separate them into two fields:

### musicDescription (for BGM generation):
- Music mood, genre, tempo, instrumentation, energy curve
- Shape only (placeholders — DO NOT copy these strings): "GENRE_OR_INSTRUMENTATION, MOOD_DESCRIPTOR, ENERGY_CURVE". Describe what the user\'s script actually calls for.
- If no music direction in script → musicDescription: ""

### sfxDescription (for sound effects search/generation):
- Ambient beds: room tone, outdoor air, traffic hum, restaurant buzz
- Spot SFX: cup clink, door close, footstep, paper rustle
- Feature SFX: whoosh, impact hit, dramatic stinger, glass shatter
- If no SFX direction in script → sfxDescription: ""

### audioDescription (DEPRECATED — backward compat only):
- Copy musicDescription value here for old consumers that still read it
- Do NOT put SFX in audioDescription

Shape only (placeholders — DO NOT copy, extract the user\'s actual audio):
Input shape: "**Audio:** MUSIC_LINE_FROM_SCRIPT. SFX_LINE_FROM_SCRIPT."
→ musicDescription: MUSIC_LINE_FROM_SCRIPT condensed to mood/genre/instrumentation
→ sfxDescription:   SFX_LINE_FROM_SCRIPT condensed to comma-separated ambient+spot+feature sounds
→ audioDescription: (copy of musicDescription for backward compat)

Fill the placeholders from the user\'s actual Audio section. Do not substitute "synth pad", "acoustic guitar", "keyboard clicks", or any other content token.

## MOTION GRAPHIC CUE EXTRACTION
If the script implies branded / stat / callout elements without giving exact copy:
→ Extract into editDirections.motionGraphicCue using the shape "GRAPHIC_TYPE: GRAPHIC_VALUE" where GRAPHIC_TYPE is one of stat counter / lower third / brand logo reveal / callout / etc. and GRAPHIC_VALUE comes verbatim from the user\'s script. Do not substitute brand names or numbers from other scripts.
If nothing → motionGraphicCue: ""

## ON-SCREEN TEXT EXTRACTION (CRITICAL — preserve exact script copy)
Scripts frequently specify EXACT text that must appear visually on screen. Look for these patterns:
  - "On-Screen Text: <text>" / "Text: <text>"
  - "(Appears briefly: <text>)" / "(Brief flash: <text>)"
  - Lines inside a scene that are explicitly quoted as visible copy (NOT narration)
  - Final "On-Screen Text: @BrandHandle #Hashtag" lines in resolution scenes
  - Multiple on-screen text lines in one scene (e.g. nostalgia ads often have 3+ short text beats in Scene 2)

Extract EACH DISTINCT text line VERBATIM into editDirections.onScreenText as an array of strings.
- Preserve exact wording, punctuation, hashtags, emoji, and capitalization.
- One array entry = one visible text block = one graphic overlay.
- Do NOT merge multi-line text blocks unless they genuinely appear as one visible text element.
- Do NOT rewrite, shorten, or paraphrase. The downstream system will use these strings as literal text on the graphic overlay.

Extraction patterns (these describe the SHAPE of valid output — placeholders in ALL_CAPS_UNDERSCORE are NOT literal text, they mark "insert the exact script text here"):

Pattern 1 — single quoted line:
Script contains: On-Screen Text: "USE_ACTUAL_SCRIPT_LINE_HERE"
→ onScreenText: ["USE_ACTUAL_SCRIPT_LINE_HERE"]

Pattern 2 — multiple parenthetical flashes in one scene:
Script contains (between scene cuts):
  (Appears briefly: "SCRIPT_FLASH_ONE")
  (Appears briefly: "SCRIPT_FLASH_TWO")
  (Appears briefly: "SCRIPT_FLASH_THREE")
→ onScreenText: ["SCRIPT_FLASH_ONE", "SCRIPT_FLASH_TWO", "SCRIPT_FLASH_THREE"]

Pattern 3 — closing-scene tagline + CTA/hashtag:
Script's final scene ends with:
  On-Screen Text: "SCRIPT_TAGLINE_HERE"
  On-Screen Text: "SCRIPT_CTA_OR_HASHTAG_HERE"
→ onScreenText: ["SCRIPT_TAGLINE_HERE", "SCRIPT_CTA_OR_HASHTAG_HERE"]

CRITICAL — DO NOT COPY THE PLACEHOLDERS: the ALL_CAPS strings above are a pattern schema, not literal text. When processing a real script, replace them with the EXACT verbatim text from the script. Never emit strings containing underscores or ALL_CAPS placeholder tokens. Never emit made-up taglines. If the script has no on-screen text for a scene, OMIT the field or return empty array [].

Hallucination guard: every string you emit in onScreenText MUST appear character-for-character somewhere in the script you received. A downstream validator will strip any string that is not present in the raw script — strings you invent will be silently deleted, so invention costs you nothing but accuracy.

ALSO set motionGraphicCue as a brief free-form description (backward compat with older consumers),
but onScreenText is the authoritative source.

## SFX EXTRACTION (uses BOTH sfxDescription AND editDirections.sfxCue)
The Audio section mixes music, narration, and SFX. Split them into three outputs:

1. **musicDescription** — music mood, genre, tempo, instrumentation
2. **sfxDescription** — ambient beds + spot SFX + feature SFX (the FULL SFX soundscape)
3. **editDirections.sfxCue** — the MOST important single SFX moment (for targeted SFX search)
4. **narration** — spoken words only

Shape only (abstract — DO NOT copy any content, extract the user\'s actual audio):
Input shape: "**Audio:** SFX: SFX_LIST. AMBIENT_LAYER. MUSIC_LINE."
→ musicDescription: MUSIC_LINE as genre + mood + energy (music only, no sfx)
→ sfxDescription:   SFX_LIST + AMBIENT_LAYER combined as comma-separated (sfx only, no music)
→ sfxCue:           the single most prominent SFX moment from SFX_LIST (for targeted search)
→ audioDescription: (copy of musicDescription for backward compat)

Every placeholder above must be replaced with the user\'s literal script content. Do not copy placeholder tokens. Do not substitute content from other scripts.

If no SFX in script → sfxDescription: "", sfxCue: null

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
  }), { label: 'llm-scene-parser main', maxRetries: 2 });

  // ─── Post-processing validation ────────────────────────────────
  // The LLM sometimes breaks rules despite explicit instructions.
  // These fixes catch the most common violations.

  if (object.scenes) {
    // Assign sceneIndex (not in Zod schema — LLM doesn't output it, we derive from array position)
    for (let i = 0; i < object.scenes.length; i++) {
      (object.scenes[i] as any).sceneIndex = i;
    }

    // ─── Fix 4: Extract duration from title timestamps ────────────
    // LLM often embeds timing in the scene title: "SCENE 1: THE HOOK (0-5 seconds)"
    // or "Intro (00:00-00:15)". Extract and use as durationSeconds when the LLM
    // gave a suspicious default (5 or 15). Works for any script format.
    for (const scene of object.scenes) {
      const title = scene.title || '';
      // Pattern A: "(X-Y seconds)" or "(X - Y seconds)" or "(Xs-Ys)"
      const secRangeMatch = title.match(/\((\d+)\s*[-–—]\s*(\d+)\s*(?:seconds?|sec|s)\)/i);
      // Pattern B: "(MM:SS-MM:SS)" or "(M:SS - M:SS)"
      const tsRangeMatch = title.match(/\((\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\)/);

      let extractedDuration: number | null = null;
      if (secRangeMatch) {
        const start = parseInt(secRangeMatch[1]);
        const end = parseInt(secRangeMatch[2]);
        if (end > start && end - start <= 120) {
          extractedDuration = end - start;
        }
      } else if (tsRangeMatch) {
        const startSec = parseInt(tsRangeMatch[1]) * 60 + parseInt(tsRangeMatch[2]);
        const endSec = parseInt(tsRangeMatch[3]) * 60 + parseInt(tsRangeMatch[4]);
        if (endSec > startSec && endSec - startSec <= 120) {
          extractedDuration = endSec - startSec;
        }
      }

      if (extractedDuration !== null) {
        const current = scene.durationSeconds || 5;
        // Only override if LLM gave a suspicious default (5 or 15) or if extracted is more accurate
        if (current === 5 || current === 15 || Math.abs(current - extractedDuration) > 3) {
          console.log(`[SceneParser] Fix4: scene ${(scene as any).sceneIndex} duration ${current}s → ${extractedDuration}s (from title timestamp)`);
          scene.durationSeconds = extractedDuration;
        }
        // Rule 8N: the duration came from an explicit timestamp in the script
        // title — flag it so the pacing multiplier downstream will NOT compound
        // on top of the user's stated number. See
        // `edit-direction-applier.ts` pacing loop for the read side.
        (scene as any).durationWasExplicit = true;
      }
    }

    // ─── Fix 3: Clean scene titles ────────────────────────────────
    // LLM outputs titles like "SCENE 1: THE HOOK (0-5 seconds)" or
    // "Scene 3 - Product Reveal" — strip the prefix/suffix for clean display.
    for (const scene of object.scenes) {
      let title = scene.title || '';
      // Strip "SCENE N:" / "Scene N -" / "SCENE N." prefix (any numbering format)
      title = title.replace(/^(?:scene|act|part|segment)\s*\d+\s*[:\-–—.]\s*/i, '');
      // Strip "(X-Y seconds)" / "(MM:SS-MM:SS)" suffix
      title = title.replace(/\s*\(\d+\s*[-–—]\s*\d+\s*(?:seconds?|sec|s)\)\s*$/i, '');
      title = title.replace(/\s*\(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)\s*$/i, '');
      // Strip trailing punctuation artifacts
      title = title.replace(/^[:\-–—\s]+|[:\-–—\s]+$/g, '').trim();

      // If title is now empty or generic ("Introduction", "Conclusion"), generate from visualDescription
      if (!title || /^(introduction|conclusion|opening|closing|outro|intro|end|start|beginning)$/i.test(title)) {
        const visual = scene.visualDescription || '';
        // Take first meaningful phrase (up to 6 words) from visualDescription
        const words = visual.split(/\s+/).filter(w => w.length > 0).slice(0, 6);
        title = words.length > 0 ? words.join(' ') : `Scene ${(scene as any).sceneIndex + 1}`;
      }

      if (title !== scene.title) {
        console.log(`[SceneParser] Fix3: scene ${(scene as any).sceneIndex} title "${scene.title}" → "${title}"`);
        scene.title = title;
      }
    }

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

      // FIX: Multi-subject visual description → single hero moment
      // Image gen models render ALL subjects in one frame → collage.
      // Detect descriptions listing multiple distinct subjects separated by
      // commas/semicolons/periods and keep only the FIRST (hero) moment.
      // Remaining moments can become sub-shots if needed (Fix 2 handles that).
      //
      // Detection heuristic: split on clause boundaries (comma/semicolon/period
      // followed by a new subject indicator like articles or proper nouns).
      // Only triggers when 3+ clauses each describe a separate subject.
      if (scene.visualDescription && !scene.subShots?.length) {
        const desc = scene.visualDescription;

        // Split on strong clause boundaries: ", a ", "; ", ". A ", ", an ", etc.
        // These patterns indicate a NEW subject being introduced.
        const clauseSplitRegex = /(?:[.;]|,)\s+(?:a |an |the |[A-Z][a-z])/g;
        const splitPoints: number[] = [];
        let splitMatch: RegExpExecArray | null;
        clauseSplitRegex.lastIndex = 0;
        while ((splitMatch = clauseSplitRegex.exec(desc)) !== null) {
          splitPoints.push(splitMatch.index);
        }

        // Only act if 2+ split points found (= 3+ clauses = likely multi-subject)
        if (splitPoints.length >= 2) {
          // Extract first clause (the hero moment)
          const heroEnd = splitPoints[0];
          const heroMoment = desc.substring(0, heroEnd).trim().replace(/[,;.]+$/, '').trim();

          // Validate: hero moment should be substantial (>20 chars) and the
          // remaining content should also be substantial (not just a short qualifier)
          const remaining = desc.substring(heroEnd).trim();
          if (heroMoment.length > 20 && remaining.length > 30) {
            console.log(`[SceneParser] Multi-subject fix: scene ${(scene as any).sceneIndex} — truncated from ${desc.length} chars to hero moment (${heroMoment.length} chars). Removed: "${remaining.substring(0, 80)}..."`);
            scene.visualDescription = heroMoment;
          }
        }
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
          if (!scene.editDirections) (scene as any).editDirections = {};
          (scene.editDirections as any).sfxCue = sfxMatch[1].trim();
        }
        // Also check for obvious SFX words even without the label
        if (!scene.editDirections?.sfxCue) {
          const sfxWords = scene.audioDescription.match(/\b(whoosh|crash|slam|click|pop|sizzle|crunch|buzz|chime|thud|splash|drip|crackle|rustle|shatter|bang|ring|beep|honk|chirp|roar)\b/gi);
          if (sfxWords && sfxWords.length >= 1) {
            if (!scene.editDirections) (scene as any).editDirections = {};
            // Extract the sentence containing SFX words
            const sentences = scene.audioDescription.split(/[.!]/);
            const sfxSentences = sentences.filter(s => sfxWords.some(w => s.toLowerCase().includes(w.toLowerCase())));
            if (sfxSentences.length > 0) {
              (scene.editDirections as any).sfxCue = sfxSentences.map(s => s.trim()).join(', ');
            }
          }
        }
      }

      // ─── Fix 1: Validate and clean contaminated narration ────────
      // LLM sometimes dumps visual/camera directions into narration field.
      // A voiceover actor reading "Visual: Shot 1: Extreme close-up of golden
      // fries..." is catastrophic. Detect direction-label contamination and
      // move the content to visualDescription instead.
      //
      // Generic detection: any narration starting with a direction label.
      // Not script-specific — works for any format that uses standard labels.
      if (scene.narration && scene.narration.length > 0) {
        const narration = scene.narration.trim();
        // Direction labels that should NEVER be in voiceover narration
        // Tested against: "Visual:", "Camera:", "Shot 1:", "Close-up:", "Wide shot:",
        // "Medium shot:", "Cut to:", "Angle:", "Pan:", "Track:", "Dolly:", "SFX:",
        // "Audio:", "Music:", "B-roll:", "Insert:", "Montage:", "Transition:"
        const directionLabelRegex = /^(?:visual|camera|shot\s*\d+|close[- ]?up|wide\s*shot|medium\s*shot|cut\s*to|angle|pan|track|dolly|sfx|audio\s*direction|music|b[- ]?roll|insert|montage|transition|ext\.|int\.|action|direction|cue)[:\s]/i;

        if (directionLabelRegex.test(narration)) {
          console.log(`[SceneParser] Fix1: scene ${(scene as any).sceneIndex} narration contaminated with direction labels — moving to visualDescription`);
          // Append to visualDescription if it has content, otherwise replace
          if (scene.visualDescription && scene.visualDescription.length > 10) {
            scene.visualDescription = `${scene.visualDescription}. ${narration}`;
          } else {
            scene.visualDescription = narration;
          }
          scene.narration = '';
        }

        // Also detect narration that's MOSTLY direction content (>50% of sentences
        // start with direction labels) — partial contamination
        if (scene.narration && scene.narration.length > 0) {
          const sentences = scene.narration.split(/[.!?]+/).filter(s => s.trim().length > 5);
          if (sentences.length >= 2) {
            const directionSentences = sentences.filter(s => directionLabelRegex.test(s.trim()));
            if (directionSentences.length > sentences.length * 0.5) {
              console.log(`[SceneParser] Fix1: scene ${(scene as any).sceneIndex} narration partially contaminated (${directionSentences.length}/${sentences.length} sentences are directions) — extracting clean narration`);
              const cleanSentences = sentences.filter(s => !directionLabelRegex.test(s.trim()));
              const dirtyContent = directionSentences.map(s => s.trim()).join('. ');
              scene.narration = cleanSentences.map(s => s.trim()).join('. ');
              if (dirtyContent) {
                scene.visualDescription = scene.visualDescription
                  ? `${scene.visualDescription}. ${dirtyContent}`
                  : dirtyContent;
              }
            }
          }
        }
      }
    }
  }

  // ─── Post-process: auto-fill assetRecommendation if missing ──────────
  // Asset hierarchy (updated 2026-04-02 — stock REMOVED from pipeline default):
  //   1. ALL scenes (main + sub-shots) → ai-video. Businesses pay for quality.
  //   2. Graphics-only (data, stats, SaaS demo) → graphics-only (no video needed).
  //   3. animated-still (Ken Burns) → LAST RESORT only when AI video fails.
  //
  // Stock video is available as a MANUAL option in the editor (searchStockFootage tool)
  // but is NOT auto-inserted by the pipeline.
  if (object.scenes) {
    for (const scene of object.scenes) {
      const visual = (scene.visualDescription || '').toLowerCase();

      // Graphics-only detection: data, charts, stats, SaaS UI, abstract concepts
      if (/\b(chart|graph|diagram|infographic|data visual|stat|dashboard|ui screenshot|screen recording|abstract concept|numbers speak)\b/i.test(visual)) {
        (scene as any).assetRecommendation = 'graphics-only';
        console.log(`[SceneParser] Asset: scene ${(scene as any).sceneIndex} "${scene.title}" → graphics-only (data/chart content)`);
      }

      // Default: all scenes → ai-video
      else if (!(scene as any).assetRecommendation) {
        (scene as any).assetRecommendation = 'ai-video';
      }

      // Sub-shots also default to ai-video (each gets its own AI generation)
      const subShots = (scene as any).subShots || [];
      if (subShots.length > 0) {
        for (const sub of subShots) {
          if (sub.independentGeneration && !sub.assetRecommendation) {
            sub.assetRecommendation = 'ai-video';
          }
        }
      }

      console.log(`[SceneParser] Asset: scene ${(scene as any).sceneIndex} "${scene.title}" → ${(scene as any).assetRecommendation}${subShots.length > 0 ? ` (${subShots.length} sub-shots → ai-video)` : ''}`);
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
          if (!scene.editDirections) (scene as any).editDirections = {};
          (scene as any).editDirections.transition = { type: pattern.type, durationMs: pattern.durationMs };
          console.log(`[SceneParser] Post-process: scene ${(scene as any).sceneIndex} transition=${pattern.type} (from raw script)`);
          break; // Use first match
        }
      }
    }
  }

  // ─── Post-process: force independentGeneration on distinct sub-shots ──
  // Bundle 3 safety net (2026-04-08): flash-lite (and sometimes flash) ignore the
  // Mode B rule — they produce sub-shots with distinct descriptions but leave
  // independentGeneration:false on all of them. Result: all sub-shots cut from one
  // 5s video → 3 videos total for a 13-sub-shot script (the "3 stitched to 11"
  // disaster from proj_r8E_z9WVaBX9).
  //
  // Heuristic: if a scene has >=2 sub-shots AND the sub-shot descriptions are
  // visibly distinct (different primary nouns / locations / time periods), force
  // independentGeneration:true on ALL of them. This guarantees per-sub-shot
  // generation regardless of what the LLM decided.
  //
  // The cost preview already warns the user about independent sub-shot cost, and
  // the user opting into sub-shot decomposition in the first place is an implicit
  // opt-in to the higher cost. Better to over-generate than to produce 3 videos.
  if (object.scenes) {
    for (const scene of object.scenes) {
      const subShots = (scene as any).subShots || [];
      if (subShots.length < 2) continue;

      // Already all independent? Skip.
      const allIndep = subShots.every((s: any) => s.independentGeneration === true);
      if (allIndep) continue;

      // Detect distinct sub-shots: compare description + visualDescription strings
      // If any two share <40% token overlap, they're distinct enough to need their own video
      const normalize = (s: string) =>
        (s || '').toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3 && !/^(the|and|for|with|into|from|that|this|which|where|their|there|shot|scene)$/.test(w));

      const tokenSets = subShots.map((s: any) =>
        new Set(normalize(`${s.description || ''} ${s.visualDescription || ''}`))
      );

      // Compute pairwise Jaccard similarity
      let maxJaccard = 0;
      for (let i = 0; i < tokenSets.length; i++) {
        for (let j = i + 1; j < tokenSets.length; j++) {
          const a = tokenSets[i] as Set<string>;
          const b = tokenSets[j] as Set<string>;
          if (a.size === 0 && b.size === 0) continue;
          const intersection = new Set([...a].filter((x) => b.has(x)));
          const union = new Set([...a, ...b]);
          const jaccard = union.size === 0 ? 0 : intersection.size / union.size;
          if (jaccard > maxJaccard) maxJaccard = jaccard;
        }
      }

      // Determine if sub-shots need independent generation.
      // Per creative doc §1 (Dancyger): "Emotional = hold the shot."
      // Per Murch: Emotion (51%) trumps everything.
      //
      // Same-setting continuity matters: "child reaching at table, parent
      // wiping at table, both laughing at table" should be ONE continuous
      // clip cut into 3 sub-shots — not 3 separate AI videos with
      // potentially inconsistent lighting/faces/backgrounds.
      //
      // Force independent ONLY when:
      //   1. Different era/time markers (1980s vs 1990s vs modern)
      //   2. Low Jaccard AND no shared location — genuinely different places
      //
      // Do NOT force when:
      //   - Sub-shots share location tokens (table, restaurant, room, etc.)
      //     AND have no era markers — same setting, different moments

      const allText = subShots.map((s: any) => `${s.description || ''} ${s.visualDescription || ''}`).join(' ').toLowerCase();
      const eraMarkers = (allText.match(/\b(19[5-9]0s|20[0-2]0s|vintage|retro|modern|present[- ]day|black and white|grainy footage)\b/g) || []);
      const hasMultipleEras = new Set(eraMarkers).size >= 2;

      // Check if sub-shots share location tokens (same-setting indicator)
      const LOCATION_TOKENS = new Set([
        'table', 'restaurant', 'room', 'booth', 'kitchen', 'counter',
        'store', 'office', 'desk', 'couch', 'sofa', 'bed', 'chair',
        'park', 'garden', 'beach', 'street', 'sidewalk', 'playground',
        'stage', 'studio', 'gym', 'field', 'court', 'pool',
        'window', 'door', 'hallway', 'lobby', 'elevator',
      ]);
      // Collect location tokens from each sub-shot
      const subShotLocations = subShots.map((s: any) => {
        const tokens = normalize(`${s.description || ''} ${s.visualDescription || ''}`);
        return new Set(tokens.filter(t => LOCATION_TOKENS.has(t)));
      });
      // Check if ANY location token appears in 2+ sub-shots
      const allLocationTokens = subShotLocations.flatMap((s: Set<string>) => [...s]);
      const locationCounts = new Map<string, number>();
      for (const t of allLocationTokens) locationCounts.set(t, (locationCounts.get(t) || 0) + 1);
      const hasSharedLocation = [...locationCounts.values()].some(count => count >= 2);

      // Decision logic:
      // - Multiple eras → always force independent (era montage)
      // - Low Jaccard + NO shared location → force independent (genuinely different settings)
      // - Low Jaccard + shared location → DON'T force (same place, different moments)
      const shouldForce = hasMultipleEras || (maxJaccard < 0.4 && !hasSharedLocation);

      if (shouldForce) {
        const reason = hasMultipleEras
          ? `multi-era montage (${new Set(eraMarkers).size} distinct eras)`
          : `distinct subjects + no shared location (maxJaccard=${maxJaccard.toFixed(2)})`;
        console.log(`[SceneParser] Post-process: scene ${(scene as any).sceneIndex} "${scene.title}" — FORCING independentGeneration=true on ${subShots.length} sub-shots (${reason})`);
        for (const sub of subShots) {
          sub.independentGeneration = true;
          if (!sub.visualDescription && sub.description) {
            sub.visualDescription = sub.description;
          }
          if (!sub.videoMotionPrompt && (scene as any).videoMotionPrompt) {
            sub.videoMotionPrompt = (scene as any).videoMotionPrompt;
          }
        }
      } else if (maxJaccard < 0.4 && hasSharedLocation) {
        console.log(`[SceneParser] Post-process: scene ${(scene as any).sceneIndex} "${scene.title}" — NOT forcing independentGeneration (shared location: [${[...locationCounts.entries()].filter(([,c]) => c >= 2).map(([t]) => t).join(', ')}], Jaccard=${maxJaccard.toFixed(2)}). Per creative doc: emotional continuity > visual variety.`);
      }
    }
  }

  // ─── Post-process: extract onScreenText from raw script ───────────
  // Bundle 3 safety net (2026-04-08): parser frequently leaves editDirections.onScreenText
  // as null even when the script literally contains "On-Screen Text:" lines. Regex-extract
  // them directly from the raw script as a fallback.
  //
  // Scan the raw script for patterns like:
  //   On-Screen Text: "Quoted text"
  //   On-Screen Text: Unquoted text
  //   Text: "Quoted"
  //   (Brief flash: "Quoted")
  //   (Appears briefly: "Quoted")
  // Associate each extracted text with the nearest scene (by narration match or title match).
  if (object.scenes && scriptText) {
    // Extract all on-screen-text strings from the raw script, in order
    const extractions: Array<{ text: string; scriptPosition: number }> = [];
    const patterns = [
      // Quoted text after label: On-Screen Text: "Remember this?"
      /(?:on[-\s]?screen\s*text|text\s*on\s*screen|text)[:\s]*["\u201C\u2018]([^"\u201D\u2019]+)["\u201D\u2019]/gi,
      // Parenthetical brief text: (Appears briefly: "tagline here")
      /\((?:appears?\s*briefly|brief\s*flash|briefly)[:\s]*["\u201C\u2018]([^"\u201D\u2019]+)["\u201D\u2019]\)/gi,
      // Unquoted text after label: On-Screen Text: Remember this?
      /(?:on[-\s]?screen\s*text|text\s*on\s*screen)[:\s]*([^\n"\u201C\u201D]+?)(?=\n|$)/gi,
      // Fix 5: Markdown bold label: **On-Screen Text:** or **Text Overlay:**
      /\*\*(?:on[-\s]?screen\s*text|text\s*overlay|overlay\s*text|lower\s*third|super|title\s*card)[:\s]*\*\*\s*["\u201C\u2018]?([^"\u201D\u2019\n*]+)["\u201D\u2019]?\s*$/gim,
      // Fix 5: Label on one line, text on next: "On-Screen Text:\n  Remember this feeling?"
      /(?:on[-\s]?screen\s*text|text\s*overlay|overlay\s*text|lower\s*third|super|title\s*card)[:\s]*\n\s*["\u201C\u2018]?([^\n"\u201D\u2019]{3,})["\u201D\u2019]?\s*$/gim,
      // Fix 5: Hashtag/tagline patterns: #HashTag or "Tagline." after "Text:" label
      /(?:text|tagline|hashtag|slogan|cta)[:\s]*["\u201C\u2018]?([#@][^\n"\u201D\u2019]{2,})["\u201D\u2019]?\s*$/gim,
    ];
    for (const pat of patterns) {
      pat.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pat.exec(scriptText)) !== null) {
        const text = match[1].trim().replace(/\s+/g, ' ');
        if (text.length > 2 && text.length < 200) {
          // De-dupe: skip if this exact text already captured
          if (!extractions.some((e) => e.text === text)) {
            extractions.push({ text, scriptPosition: match.index });
          }
        }
      }
    }

    if (extractions.length > 0) {
      console.log(`[SceneParser] Post-process: regex-extracted ${extractions.length} on-screen text strings from raw script`);

      // Find the script position for each scene (by title or narration match)
      const sceneScriptPositions = object.scenes.map((scene: any) => {
        const title = (scene.title || '').toLowerCase().substring(0, 30);
        const narration = (scene.narration || '').toLowerCase().substring(0, 50);
        let pos = -1;
        if (narration.length > 5) pos = scriptText.toLowerCase().indexOf(narration);
        if (pos < 0 && title.length > 5) pos = scriptText.toLowerCase().indexOf(title);
        // Fallback: distribute evenly by scene index
        if (pos < 0) pos = Math.floor((scene.sceneIndex / object.scenes.length) * scriptText.length);
        return pos;
      });

      // Assign each extraction to the nearest scene by script position
      for (const extraction of extractions) {
        let bestSceneIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < object.scenes.length; i++) {
          const scenePos = sceneScriptPositions[i];
          const nextScenePos = i + 1 < object.scenes.length ? sceneScriptPositions[i + 1] : scriptText.length;
          // Extraction belongs to this scene if its position is within [scenePos, nextScenePos)
          if (extraction.scriptPosition >= scenePos && extraction.scriptPosition < nextScenePos) {
            bestSceneIdx = i;
            bestDist = 0;
            break;
          }
          // Otherwise track nearest
          const dist = Math.abs(extraction.scriptPosition - scenePos);
          if (dist < bestDist) {
            bestDist = dist;
            bestSceneIdx = i;
          }
        }

        const scene: any = object.scenes[bestSceneIdx];
        if (!scene.editDirections) scene.editDirections = {};
        if (!Array.isArray(scene.editDirections.onScreenText)) {
          scene.editDirections.onScreenText = [];
        }
        // De-dupe within the scene's onScreenText array
        if (!scene.editDirections.onScreenText.includes(extraction.text)) {
          scene.editDirections.onScreenText.push(extraction.text);
        }
      }

      // Log what landed where
      for (const scene of object.scenes as any[]) {
        const texts = scene.editDirections?.onScreenText;
        if (Array.isArray(texts) && texts.length > 0) {
          console.log(`[SceneParser] Scene ${scene.sceneIndex} onScreenText (regex): [${texts.map((t: string) => `"${t}"`).join(', ')}]`);
        }
      }
    }
  }

  // ─── Post-process: onScreenText hallucination validator ────────────
  //
  // Background (2026-04-20 forensic — proj_-V4uKTjjM2vA):
  // Prior to this pass, the LLM parser prompt was seeded with the March
  // McDonald's A3 test script's on-screen texts as few-shot examples
  // ("Remember this feeling?", "Through the years.", "A taste of
  // childhood, always fresh.", "Share your McDonald's memories.
  // #GoldenArchesOfMemory"). When any user submitted a McDonald's-themed
  // script, the LLM's attention locked onto those examples and copied
  // them verbatim into `editDirections.onScreenText` — even though the
  // user's actual script had different on-screen text (or none at all).
  // Result: shipped videos contained fabricated taglines unrelated to
  // the brief. Prompt genericization (this commit) is layer 1 defense;
  // this validator is layer 2.
  //
  // Rule: every string emitted in onScreenText MUST appear character-
  // for-character (case-insensitive, punctuation-normalized) in the raw
  // script. Any string that doesn't is by definition invented — either
  // by the LLM or by a hypothetical future regex bug — and is stripped
  // loudly. The regex post-processor above (lines 916+) ensures that
  // anything legitimately present in the script IS captured before this
  // validator runs, so stripping an entry cannot lose a true positive.
  //
  // Rule 2N aligned: instead of silently accepting LLM output, validate
  // against ground truth (the user's script) and fail loudly when they
  // disagree.
  if (object.scenes && scriptText) {
    // Normalize once (strip punctuation + collapse whitespace + lowercase)
    // so minor punctuation/casing differences don't trigger false negatives.
    const normalizeForMatch = (s: string): string =>
      s.toLowerCase()
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'") // fancy quotes → straight
        .replace(/[^a-z0-9\s]/gi, ' ')                // punctuation → space
        .replace(/\s+/g, ' ')                         // collapse whitespace
        .trim();
    const scriptNormalized = normalizeForMatch(scriptText);

    let totalStripped = 0;
    const strippedSamples: string[] = [];
    for (const scene of object.scenes as any[]) {
      const texts = scene.editDirections?.onScreenText;
      if (!Array.isArray(texts) || texts.length === 0) continue;

      const survivors = texts.filter((text: any) => {
        if (typeof text !== 'string') return false;
        const normText = normalizeForMatch(text);
        if (normText.length < 3) return false; // too short to be meaningful
        if (scriptNormalized.includes(normText)) return true;
        // Does not appear in script — hallucination, strip.
        totalStripped++;
        if (strippedSamples.length < 5) strippedSamples.push(`scene ${scene.sceneIndex}: "${text}"`);
        return false;
      });

      scene.editDirections.onScreenText = survivors;
      // Clean up empty arrays so downstream doesn't see `[]` as intent
      if (survivors.length === 0 && scene.editDirections) {
        delete scene.editDirections.onScreenText;
      }
    }

    if (totalStripped > 0) {
      console.warn(
        `[SceneParser] onScreenText HALLUCINATION VALIDATOR stripped ${totalStripped} invented text(s). ` +
        `Samples: ${strippedSamples.join(' | ')}. ` +
        `This means the LLM emitted text not present in the user's script — if this fires regularly, ` +
        `check the parser prompt for domain-contamination in few-shot examples.`,
      );
    }
  }

  // ─── Post-process: deterministic transition keyword extraction ─────
  //
  // Background (2026-04-20 forensic — proj_-V4uKTjjM2vA): user's script
  // explicitly said "Rapid cuts" in Scene 1 Camera section, "Dynamic,
  // quick-paced cuts" in Scene 2, "Smooth, slightly slower movement" in
  // Scene 3. LLM's extracted editDirections.transition was undefined for
  // scenes 0 and 2, and "dissolve" for scene 2 (didn't even match the
  // script's own cut intent). The Director then fell back to profile
  // default (D-07 defaultTransition: 'dissolve'), and every scene
  // boundary got dissolve/soft-cut. User wanted rapid cuts, got smooth
  // smears.
  //
  // Root cause (Rule 18N violation): transition-type decisions were
  // probabilistic (LLM judgment) for signals that are explicit in the
  // script text. "QUICK CUT" / "RAPID CUTS" / "HARD CUT" / "DISSOLVE
  // TO" / "FADE TO BLACK" / "SMASH CUT" etc. are keyword-level instructions
  // — no judgment needed. This post-processor does rule-driven extraction
  // over the raw script (per-scene chunk) and sets
  // editDirections.transition deterministically.
  //
  // Scope rule: if the script contains a transition keyword in a scene's
  // chunk, the keyword wins over whatever the LLM emitted. User's
  // explicit words outrank LLM's inference. Logged when we override.
  //
  // Rule alignment:
  //   - Rule 18N: rule-driven over probabilistic for explicit signals.
  //   - Rule 2N: deterministic extraction is not a "fallback" — it's the
  //     primary path for keyword-present scenes; LLM fills gaps only
  //     when the script was vague.
  //   - Rule 15: transition vocabulary grounded in
  //     creative_production_knowledge.md §5 Transition Psychology (hard
  //     cuts for rapid pacing, dissolves for time-passage, dip-to-black
  //     for chapter ends).
  //
  // Pattern order matters — MULTI-WORD specific patterns checked before
  // single-word fallbacks (e.g., "rapid cuts" must match before plain
  // "cut" would). First match wins per scene.
  if (object.scenes && scriptText) {
    // Each pattern maps to a transition.type enum value from
    // SceneEditDirectionsSchema (llm-scene-parser.ts:20-26). Enum drift
    // here would silently fail downstream — if you add a pattern, verify
    // the target is in that enum.
    // PACING keywords describe within-scene editing rhythm ("rapid cuts",
    // "quick cuts", "dynamic cuts"). These set editDirections.pacing, NOT
    // editDirections.transition. A montage with "rapid cuts" between its
    // sub-shots should still dissolve INTO the montage from the previous scene.
    // McDonald's bug (2026-04-21): "QUICK CUT" shot prefixes + "Rapid cuts"
    // camera direction were setting hard-cut on EVERY scene boundary → zero
    // dissolves in a nostalgic brand ad. Rule 19N: a film editor uses "rapid
    // cuts" to describe pacing, not the transition into the scene.
    const PACING_KEYWORDS: Array<{ re: RegExp; pacing: string; label: string }> = [
      { re: /\b(?:rapid|quick|fast)\s+cuts?\b/i,              pacing: 'fast',    label: 'rapid/quick cuts' },
      { re: /\bdynamic(?:,?\s*quick[-\s]?paced)?\s+cuts?\b/i, pacing: 'fast',    label: 'dynamic/quick-paced cuts' },
      { re: /\bslow\s+(?:reveal|movement|push|zoom)\b/i,      pacing: 'slow',    label: 'slow reveal/movement' },
      { re: /\bsmooth(?:,?\s*slightly)?\s+slower\b/i,          pacing: 'slow',    label: 'smooth/slower' },
    ];

    const TRANSITION_KEYWORD_PATTERNS: Array<{ re: RegExp; type: string; durationMs: number; label: string }> = [
      // Actual transition types (between scenes, not within-scene pacing)
      { re: /\bhard\s+cuts?\b/i,                              type: 'hard-cut',      durationMs: 0,   label: 'hard cut' },
      { re: /\bsmash\s+cut\b/i,                               type: 'smash-cut',     durationMs: 0,   label: 'smash cut' },
      { re: /\bmatch\s+cut\b/i,                               type: 'match-cut',     durationMs: 0,   label: 'match cut' },
      { re: /\bjump\s+cut\b/i,                                type: 'jump-cut',      durationMs: 0,   label: 'jump cut' },
      { re: /\bcut\s+on\s+action\b/i,                         type: 'cut-on-action', durationMs: 0,   label: 'cut on action' },
      { re: /\bsoft\s+cuts?\b/i,                              type: 'soft-cut',      durationMs: 200, label: 'soft cut' },
      { re: /\b(?:cross[-\s])?dissolve(?:\s+to)?\b/i,         type: 'dissolve',      durationMs: 500, label: 'dissolve' },
      { re: /\bfade\s+(?:to\s+)?black\b/i,                    type: 'dip-to-black',  durationMs: 600, label: 'fade to black' },
      { re: /\bfade\s+(?:to\s+)?white\b/i,                    type: 'dip-to-white',  durationMs: 600, label: 'fade to white' },
      { re: /\bflash\s+(?:to\s+)?white\b/i,                   type: 'flash',         durationMs: 100, label: 'flash white' },
      { re: /\b(?:punch[-\s]in|rapid\s+zoom\s+in)\b/i,        type: 'zoom-punch',    durationMs: 270, label: 'punch-in / rapid zoom in' },
      { re: /\b(?:pull[-\s]back|rapid\s+zoom\s+out|zoom\s+out\s+quick)\b/i, type: 'zoom-out', durationMs: 300, label: 'pull back / rapid zoom out' },
      { re: /\bwhip\s+(?:pan|cut)\b/i,                        type: 'whip-pan',      durationMs: 300, label: 'whip pan' },
      { re: /\biris\s+(?:wipe|out)\b/i,                       type: 'iris-wipe',     durationMs: 500, label: 'iris wipe' },
      { re: /\bfilm\s+burn\b/i,                               type: 'film-burn',     durationMs: 400, label: 'film burn' },
      { re: /\bblur\s+transition\b/i,                         type: 'blur-transition', durationMs: 300, label: 'blur transition' },
      { re: /\bwipe\s+(?:to\s+)?left\b/i,                     type: 'wipe-left',     durationMs: 500, label: 'wipe left' },
      { re: /\bwipe\s+(?:to\s+)?right\b/i,                    type: 'wipe-right',    durationMs: 500, label: 'wipe right' },
      { re: /\bslide\s+up\b/i,                                type: 'slide-up',      durationMs: 500, label: 'slide up' },
      { re: /\bslide\s+down\b/i,                              type: 'slide-down',    durationMs: 500, label: 'slide down' },
      // Single-word fallbacks — match ONLY if no multi-word pattern above hit.
      { re: /\bcut\s+to\b/i,                                  type: 'hard-cut',      durationMs: 0,   label: 'cut to' },
      { re: /\bwipe\b/i,                                      type: 'wipe-left',     durationMs: 500, label: 'wipe (default direction)' },
      { re: /\bglitch\b/i,                                    type: 'glitch',        durationMs: 200, label: 'glitch' },
      // Note: "fade in" / "fade up" intentionally NOT mapped — there is
      // no enum value for an open-from-black. First scene is an implicit
      // opener; the LLM and Director both treat video start as
      // transition-free. A false match here would produce a mid-video
      // dip-to-black where none is wanted.
    ];

    // Compute per-scene script-chunk boundaries. Same approach as the
    // onScreenText regex post-processor above — locate each scene by title
    // or narration substring, chunk the script between consecutive scenes.
    const sceneScriptPositions = (object.scenes as any[]).map((scene: any) => {
      const title = (scene.title || '').toLowerCase().substring(0, 30);
      const narration = (scene.narration || '').toLowerCase().substring(0, 50);
      let pos = -1;
      if (narration.length > 5) pos = scriptText.toLowerCase().indexOf(narration);
      if (pos < 0 && title.length > 5) pos = scriptText.toLowerCase().indexOf(title);
      if (pos < 0) pos = Math.floor((scene.sceneIndex / object.scenes.length) * scriptText.length);
      return pos;
    });

    let totalMatched = 0;
    let totalOverrode = 0;
    for (let i = 0; i < object.scenes.length; i++) {
      const scene: any = object.scenes[i];
      const scenePos = sceneScriptPositions[i];
      const nextScenePos = i + 1 < object.scenes.length ? sceneScriptPositions[i + 1] : scriptText.length;
      const sceneChunk = scriptText.substring(Math.max(0, scenePos), nextScenePos);

      // ── Pacing extraction (separate from transitions) ──
      // "Rapid cuts" / "quick cuts" / "dynamic cuts" describe within-scene
      // editing rhythm, NOT the transition INTO the scene. Set pacing field.
      if (!scene.editDirections) scene.editDirections = {};
      for (const pk of PACING_KEYWORDS) {
        if (pk.re.test(sceneChunk)) {
          if (!scene.editDirections.pacing || scene.editDirections.pacing === 'medium') {
            scene.editDirections.pacing = pk.pacing;
          }
          break;
        }
      }

      // ── Transition extraction ──
      // Only matches ACTUAL transition types (dissolve, fade to black, etc.)
      // NOT pacing descriptions (rapid cuts, quick cuts — those are above).
      //
      // Also skip "QUICK CUT:" shot prefixes (e.g., "Shot 2: QUICK CUT: ...")
      // — these describe how to enter a specific shot, not a scene transition.
      // We detect this by checking if the match is immediately preceded by
      // "Shot" + number + colon, which is a shot-prefix pattern.
      let match: { type: string; durationMs: number; label: string } | null = null;
      for (const pat of TRANSITION_KEYWORD_PATTERNS) {
        const m = pat.re.exec(sceneChunk);
        if (m) {
          // Check if this is a shot prefix like "Shot 2: QUICK CUT:" — skip
          const beforeMatch = sceneChunk.substring(Math.max(0, m.index - 20), m.index);
          if (/shot\s+\d+\s*:\s*$/i.test(beforeMatch)) continue;
          match = { type: pat.type, durationMs: pat.durationMs, label: pat.label };
          break;
        }
      }

      if (!match) continue;

      if (!scene.editDirections) scene.editDirections = {};

      const existing = scene.editDirections.transition;
      if (existing?.type === match.type) {
        // LLM already matched the user's explicit keyword — no change, no log.
        continue;
      }

      if (existing?.type) {
        // LLM emitted a DIFFERENT transition than what the script says.
        // Override with the keyword match (user's explicit words beat LLM inference).
        console.log(
          `[SceneParser] Transition keyword OVERRIDE: scene ${scene.sceneIndex} ` +
          `LLM emitted "${existing.type}" but script keyword "${match.label}" → using "${match.type}"`,
        );
        totalOverrode++;
      } else {
        console.log(
          `[SceneParser] Transition keyword extracted: scene ${scene.sceneIndex} matched "${match.label}" → type=${match.type}`,
        );
      }

      scene.editDirections.transition = { type: match.type, durationMs: match.durationMs };
      totalMatched++;
    }

    if (totalMatched > 0) {
      console.log(`[SceneParser] Transition keyword extraction: ${totalMatched} scene(s) matched (${totalOverrode} LLM overrides)`);
    }
  }

  // ─── Post-process: correct scene durations for target total ────
  // The LLM frequently produces scenes whose total duration FAR exceeds the
  // script's target. For proj_3WjWqCTVVuJv: "30 sec Reel" → 42s of scenes
  // → 25 sub-shots → 64.7s actual timeline (2x the target).
  //
  // 2026-04-10: tightened threshold from 1.5x to 1.1x. A 30s reel that sums
  // to 33s should already be scaled down. The previous 1.5x threshold let
  // 42s (1.4x) through without correction — which is too lenient.
  // Also added total sub-shot duration calculation (not just scene durations)
  // because a scene with 6 × 3s sub-shots at independentGeneration=true
  // will produce 18s of actual timeline content regardless of the scene's
  // declared durationSeconds.
  if (object.scenes && object.scenes.length > 0) {
    // Calculate EFFECTIVE total: scenes with independent sub-shots use
    // sum(sub.targetDurationSeconds), others use scene.durationSeconds.
    const effectiveTotal = object.scenes.reduce((sum: number, scene: any) => {
      const subs = (scene.subShots || []).filter((s: any) => s.independentGeneration);
      if (subs.length > 0) {
        const subDur = subs.reduce((ss: number, sub: any) => ss + (sub.targetDurationSeconds || 3), 0);
        return sum + subDur;
      }
      return sum + (scene.durationSeconds || 5);
    }, 0);

    // Also read plain scene duration total (for the log)
    const plainTotal = object.scenes.reduce((sum: number, s: any) => sum + (s.durationSeconds || 5), 0);

    // Extract target duration from script metadata if available
    // Patterns: "30 sec reel", "30-second video", "60s short", "Format: 30 sec reel"
    const targetMatch = scriptText.match(/(?:format[:\s]*)?(\d+)[- ]?(?:second|sec|s)\s+(?:reel|video|clip|short|ad)/i);
    const targetDuration = targetMatch ? parseInt(targetMatch[1]) : null;

    console.log(`[SceneParser] Duration check: effectiveTotal=${effectiveTotal}s, plainTotal=${plainTotal}s, targetDuration=${targetDuration || 'unknown'}s, scenes=${object.scenes.length}`);

    if (targetDuration && effectiveTotal > targetDuration * 1.1) {
      // Scenes are too long — proportionally shrink to fit target
      const scaleFactor = targetDuration / effectiveTotal;
      console.log(`[SceneParser] Post-process: effectiveTotal ${effectiveTotal}s exceeds target ${targetDuration}s — scaling by ${scaleFactor.toFixed(2)}`);

      for (const scene of object.scenes) {
        const original = scene.durationSeconds || 5;
        scene.durationSeconds = Math.max(2, Math.round(original * scaleFactor));

        // Also scale sub-shot durations so the effective total matches
        if (scene.subShots) {
          for (const sub of scene.subShots) {
            if (sub.targetDurationSeconds) {
              sub.targetDurationSeconds = Math.max(1.5, Math.round(sub.targetDurationSeconds * scaleFactor * 10) / 10);
            }
          }
        }
      }

      // Verify new total
      const newEffective = object.scenes.reduce((sum: number, scene: any) => {
        const subs = (scene.subShots || []).filter((s: any) => s.independentGeneration);
        if (subs.length > 0) {
          return sum + subs.reduce((ss: number, sub: any) => ss + (sub.targetDurationSeconds || 3), 0);
        }
        return sum + (scene.durationSeconds || 5);
      }, 0);
      console.log(`[SceneParser] Post-process: adjusted effective total ${newEffective}s (from ${effectiveTotal}s)`);
    }

    // ─── Post-process: scale sub-shots UP to fill parent scene duration ──
    // PROBLEM (Nike test 2026-04-14): parser LLM follows SubShotSchema hint
    // "Minimum 3s for AI video quality" literally, producing 5 × 3s = 15s sub-shot
    // total for a 20s scripted scene. Downstream scene-to-editron advances timeline
    // by max(subTotal, sceneDuration) and gap-closing then compresses the 5s empty
    // tail. Result: 20s scripted delivers 15s — Rule 8N violation.
    //
    // FIX: if sum(sub.targetDurationSeconds) < 85% of scene.durationSeconds, scale
    // sub-shots UP proportionally to fill the scene. Mirrors the existing scale-DOWN
    // logic above (which caps runaway LLM output at 1.1x target).
    //
    // MODEL-ACHIEVABILITY (Rule 18N): scaled targets (e.g., 3s → 4s) are honored by
    // Seedance exactly (integer 4-15 grid). Kling {5, 10} and Veo {4, 6, 8} snap to
    // nearest ≥ target; downstream selectBestSegment trims the overshoot via
    // videoStartTime. User-selected model is never changed (see
    // pipeline_investigations.md "Duration fix (CORRECTED)" 2026-04-17).
    //
    // INDEPENDENT SUB-SHOTS ONLY: non-independent sub-shots share one parent video
    // (their durations are cuts of a fixed-length source), so scaling them would
    // exceed the source. Skip those.
    for (const scene of object.scenes as any[]) {
      const sceneDur = scene.durationSeconds || 5;
      const subs = (scene.subShots || []).filter((s: any) => s.independentGeneration);
      if (subs.length === 0) continue;

      const subTotal = subs.reduce((acc: number, s: any) => acc + (s.targetDurationSeconds || 3), 0);
      if (subTotal <= 0) continue;

      // Hysteresis: only scale if under-fill exceeds 15% (symmetric with scale-DOWN 1.1x trigger)
      if (subTotal < sceneDur * 0.85) {
        const scaleUp = sceneDur / subTotal;
        for (const sub of subs) {
          if (sub.targetDurationSeconds) {
            // Round to 1 decimal place for clean numbers downstream
            sub.targetDurationSeconds = Math.round(sub.targetDurationSeconds * scaleUp * 10) / 10;
          }
        }
        const newSubTotal = subs.reduce((acc: number, s: any) => acc + (s.targetDurationSeconds || 3), 0);
        console.log(
          `[SceneParser] Scene ${scene.sceneIndex}: scaled sub-shots UP ${subTotal.toFixed(1)}s → ${newSubTotal.toFixed(1)}s ` +
          `(scene.durationSeconds=${sceneDur}s, ${subs.length} sub-shots, factor=${scaleUp.toFixed(2)})`
        );
      }
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

      const montageModel = google(DEFAULT_CONFIG.aiModels.montageDetectionModel);

      // HOTFIX 2026-04-08: 45s hard cap — montage detection is an optional
      // enhancement; if it hangs we continue with single-shot scenes.
      const { object: montageResult } = await generateObject({
        model: montageModel,
        schema: MontageDetectionSchema,
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(45_000),
        prompt: `Read this script and identify scenes that describe MULTIPLE DISTINCT visual shots (3+) that would each need a SEPARATE AI video clip.

RULES:
- Only flag scenes where the VISUAL section lists 3+ DIFFERENT subjects/actions.
- Shape: "Quick cuts: BEAT_ONE. BEAT_TWO. BEAT_THREE." → 3 shots when each BEAT describes a DIFFERENT subject or action.
- Shape: one continuous action described in a single sentence → 1 shot (do NOT decompose — this is one moment, not a montage).
- Shape: 2-3 related actions within the SAME setting with the SAME subjects → 1 shot (do NOT decompose unless each beat has a distinctly different subject or framing).
- Each shot description must be a COMPLETE visual prompt for AI image/video generation, extracted verbatim from the script's BEAT_N content.
- Do not substitute content from these pattern descriptions — BEAT_N are placeholders, not real shots.

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

        console.log(`[SceneParser] Montage Gemini: scene ${(scene as any).sceneIndex} decomposed into ${scene.subShots.length} sub-shots`);
      }
    } catch (montageErr: any) {
      console.warn(`[SceneParser] Montage detection Gemini call failed (non-fatal): ${montageErr.message}`);
      // Non-fatal — scenes will be treated as single continuous shots
    }
  }

  // ─── Fix 2: Code-based sub-shot fallback from explicit shot markers ───
  // When the montage Gemini call fails OR the main parser ignores explicit
  // "Shot 1: ...", "Shot 2: ..." markers in the script, this regex-based
  // fallback extracts them deterministically. Works for any script format
  // that uses numbered shot markers within a scene.
  //
  // Markers recognized (case-insensitive):
  //   "Shot 1: description", "Shot 2 - description", "Shot 3. description"
  //   "Cut 1: description", "Take 1: description"
  //   Numbered lists within scenes: "1. description", "2. description"
  if (object.scenes && scriptText) {
    // Build a rough mapping of scene → raw script section
    const scriptLower = scriptText.toLowerCase();

    for (const scene of object.scenes as any[]) {
      // Skip if scene already has sub-shots
      if (scene.subShots && scene.subShots.length > 0) continue;

      // Find this scene's section in the raw script
      const titleSnippet = (scene.title || '').toLowerCase().substring(0, 25);
      const narrationSnippet = (scene.narration || '').toLowerCase().substring(0, 40);
      let sectionStart = -1;

      if (narrationSnippet.length > 10) sectionStart = scriptLower.indexOf(narrationSnippet);
      if (sectionStart < 0 && titleSnippet.length > 5) sectionStart = scriptLower.indexOf(titleSnippet);
      if (sectionStart < 0) continue; // Can't locate this scene in the script

      // Extract a window around this scene (up to next scene or 2000 chars)
      const sectionEnd = Math.min(scriptText.length, sectionStart + 2000);
      const section = scriptText.substring(sectionStart, sectionEnd);

      // Look for explicit shot markers: "Shot N:", "Cut N:", numbered lists
      const shotRegex = /(?:shot|cut|take)\s*(\d+)\s*[:\-–—.]\s*([^\n]+)/gi;
      const shots: Array<{ num: number; desc: string }> = [];
      let shotMatch: RegExpExecArray | null;

      shotRegex.lastIndex = 0;
      while ((shotMatch = shotRegex.exec(section)) !== null) {
        const desc = shotMatch[2].trim();
        if (desc.length > 5) {
          shots.push({ num: parseInt(shotMatch[1]), desc });
        }
      }

      // Need at least 2 shots to create sub-shots
      if (shots.length < 2) continue;

      // Sort by shot number
      shots.sort((a, b) => a.num - b.num);

      // Create sub-shots from the extracted markers
      const sceneDuration = scene.durationSeconds || 5;
      const perShotDuration = Math.max(1.5, sceneDuration / shots.length);

      scene.sceneType = 'montage';
      scene.subShots = shots.map((shot, idx) => {
        // Strip camera-direction prefixes from the description to get a clean visual prompt
        let visual = shot.desc
          .replace(/^(?:extreme\s+)?(?:close[- ]?up|wide\s*shot|medium\s*shot|full\s*shot|establishing\s*shot|low[- ]angle|high[- ]angle|aerial|overhead|pov|point[- ]of[- ]view)\s*(?:of|on|[-–—:,])\s*/i, '')
          .trim();
        // Capitalize first letter
        if (visual.length > 0) visual = visual.charAt(0).toUpperCase() + visual.slice(1);

        return {
          description: shot.desc,
          startNormalized: idx / shots.length,
          endNormalized: (idx + 1) / shots.length,
          targetDurationSeconds: perShotDuration,
          independentGeneration: true,
          visualDescription: visual || shot.desc,
          videoMotionPrompt: scene.videoMotionPrompt || '',
        };
      });

      console.log(`[SceneParser] Fix2: scene ${scene.sceneIndex} "${scene.title}" — extracted ${shots.length} sub-shots from explicit shot markers`);
    }
  }

  // ─── Post-process: detect beat-sync signals + extract BPM ────
  // Beat-sync is a TOOL, not a default style (creative_production_knowledge.md
  // content_editing_knowledge.md). It activates ONLY when the script or scene
  // explicitly signals it. Three signal sources (in priority order):
  //   1. Any scene has editDirections.pacing === 'beat-synced' (explicit script pacing)
  //   2. globalEditDirections.pacing === 'beat-synced' (script-level directive)
  //   3. Script text contains beat-sync keywords ("beat-synced", "quick cuts",
  //      "cut on the drop", "edit to the beat", "montage", "hype reel")
  //
  // If activated, downstream finalize synchronously dispatches BGM, detects
  // beats, and passes the beat grid to Director for cut placement. See
  // pipeline_investigations.md "Beat-sync design doc (Option C)" 2026-04-17.
  //
  // BPM extraction (separate concern, may run even without beat-sync active):
  //   regex match /\d{2,3}\s*bpm/i against the raw script. Captures explicit
  //   tempo specifications like "140 BPM driving electronic". Used later by
  //   beat-detection-service even in non-beat-sync mode (future SFX timing).
  const scriptLower = (scriptText || '').toLowerCase();
  const BEAT_SYNC_KEYWORDS = [
    'beat-synced',
    'beat synced',
    'quick cuts',
    'cut on the drop',
    'cut on the beat',
    'edit to the beat',
    'montage',
    'hype reel',
    'rapid cuts',
    'beat drop',
  ];

  const anyScenePacing = (object.scenes as any[]).some(
    (s: any) => s.editDirections?.pacing === 'beat-synced',
  );
  const globalPacing = (object as any).globalEditDirections?.pacing === 'beat-synced';
  const scriptKeywordMatch = BEAT_SYNC_KEYWORDS.some((kw) => scriptLower.includes(kw));

  const beatSyncActive = anyScenePacing || globalPacing || scriptKeywordMatch;

  // Extract BPM regex — broadly useful even outside beat-sync flow
  const bpmMatch = (scriptText || '').match(/(\d{2,3})\s*bpm\b/i);
  const bpm = bpmMatch ? parseInt(bpmMatch[1], 10) : null;
  const bpmValid = bpm !== null && bpm >= 40 && bpm <= 220;

  // Attach to parser result without modifying Zod schema — these are derived signals.
  (object as any).beatSyncActive = beatSyncActive;
  if (bpmValid) (object as any).bpm = bpm;

  if (beatSyncActive) {
    const reasons: string[] = [];
    if (anyScenePacing) reasons.push('scene.editDirections.pacing=beat-synced');
    if (globalPacing) reasons.push('globalEditDirections.pacing=beat-synced');
    if (scriptKeywordMatch) reasons.push('script-keyword');
    console.log(
      `[SceneParser] Beat-sync ACTIVE: reasons=[${reasons.join(', ')}]${bpmValid ? `, bpm=${bpm}` : ''}`
    );
  } else if (bpmValid) {
    console.log(`[SceneParser] BPM extracted (no beat-sync): bpm=${bpm}`);
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

  // 2026-04-09: Try primary model first, fall back to flash-lite if rate-limited.
  // gemini-2.5-flash has been hitting "high demand" 503s from Google AI Studio
  // consistently during testing (log 2026-04-09 15:45:03). Subject extraction
  // is a simple structured task that flash-lite handles fine — unlike the complex
  // parser prompt which needs 2.5-flash for instruction-following quality.
  const modelsToTry = [
    DEFAULT_CONFIG.aiModels.subjectExtractionModel,
    'gemini-3.1-flash-lite-preview', // fallback for rate-limit / capacity
    'gemini-2.5-flash',              // second fallback (different endpoint sometimes has capacity)
  ];
  // De-dupe in case primary is already one of the fallbacks
  const uniqueModels = [...new Set(modelsToTry)];

  let lastError: any;
  for (const modelId of uniqueModels) {
    try {
      const model = google(modelId);
      console.log(`[extractSubjects] Trying model: ${modelId}`);

      const { object } = await generateObject({
        model,
        schema: SubjectExtractionSchema,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(110_000),
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

BAD shape: "A SUBJECT_CATEGORY" with no specifics → generic, could be anything.
GOOD shape (placeholders only — DO NOT copy, describe the user's actual subject from the script):
  Products:   "MATERIAL + COLOR + FORM_FACTOR, KEY_DIMENSIONS, DISTINGUISHING_FEATURE_1, DISTINGUISHING_FEATURE_2, FINISH_OR_TEXTURE"
  Vehicles:   "VEHICLE_TYPE, PAINT_COLOR + FINISH, BODY_SHAPE_DETAIL, LIGHTING_OR_TRIM_DETAIL, WHEEL_OR_GLASS_DETAIL"
  Food:       "FOOD_TYPE, CRUST_OR_SURFACE_DETAIL, INGREDIENT_OR_COLOR_DETAIL, PLATING_OR_SERVING_DETAIL, SETTING"
  Characters: "AGE_RANGE + GENDER, HAIR_DESCRIPTION (color+length+style), SKIN_TONE, FACE_FEATURE, CLOTHING_DETAIL, ACCESSORY_OR_POSTURE, BUILD"

Fill every placeholder token (ALL_CAPS_UNDERSCORE) from what the user's script literally describes about that subject. Do NOT substitute content from these shapes — they are templates, not examples of real subjects.
${options.artStyle ? `\nArt style: ${options.artStyle}. Describe subjects in this visual style.` : ''}

Extract ALL subjects now (heroes + suggestions):`,
      });

      console.log(`[extractSubjects] SUCCESS with model ${modelId}: ${object.subjects.length} subjects`);
      return object;
    } catch (err: any) {
      lastError = err;
      const isRateLimit = /high demand|rate limit|too many requests|429|503|overloaded|capacity/i.test(err.message || '');
      console.warn(`[extractSubjects] Model ${modelId} FAILED (${isRateLimit ? 'RATE-LIMITED' : 'ERROR'}): ${err.message}`);
      if (!isRateLimit) {
        // Non-rate-limit error (auth, schema, etc.) — don't bother trying fallback models
        throw err;
      }
      // Rate-limited → try next model
    }
  }

  // All models exhausted
  throw lastError || new Error('All models failed for subject extraction');
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
  targetModel?: 'kling' | 'veo' | 'seedance';
  /** Cinema hardware language (camera body, lens, focal length, aperture).
   *  Derived from edit profile via getCinemaSettingsForProfile(). */
  cinemaHardware?: string;
  /** Sound effects + ambient bed description from script (creative_production_knowledge §3 Three-Layer Sound Model).
   *  For Seedance models, this is injected into the audio layer of the prompt so the
   *  model generates matching foley/ambient natively. For non-Seedance models, unused. */
  sfxDescription?: string;
  /** True when a separate voiceover will be generated (Kokoro/Deepgram) for this scene.
   *  Used ONLY with targetModel='seedance' to suppress dialogue generation in the video
   *  prompt — prevents per-clip voice identity drift that destroys cross-clip brand voice
   *  consistency. A single Kokoro voice across all scenes > Seedance's per-clip roll-of-the-dice.
   *  See creative_production_knowledge §3 (dialogue layer is identity), §15 (VO priority). */
  suppressDialogue?: boolean;
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
  const model = google(DEFAULT_CONFIG.aiModels.sceneParserModel);

  // Build reference subject context
  const subjectContext = context.referenceSubjects && context.referenceSubjects.length > 0
    ? context.referenceSubjects
        .map((s) => `${s.name} (${s.category}): ${s.visualDescription}`)
        .join('\n')
    : 'No specific reference subjects — describe motion generically for what\'s in the image.';

  // Model-specific tuning guide (research-backed — see docs/ai-video-model-prompting-guide.md)
  // Each model has distinct prompt length, structure, and capability preferences.
  const modelTuning: Record<string, string> = {
    kling: `Kling 2.1/2.6: 2-4 sentences. Use cinematic lens language ("tracking shot", "dolly forward").
Always specify MOTION ENDPOINTS ("then settles back"). Never open-ended drift.
Include cfg_scale-friendly terms: explicit camera direction, one subject, clean physics.
Favor push-in/pull-out/tracking. Keep context to 3-5 elements max. 100-150 words.
IMPORTANT: For image-to-video, describe ONLY motion — never re-describe the image content.`,

    veo: `Veo 3.1: KEEP PROMPT SHORT — 150-300 characters optimal. Above 400 chars DEGRADES quality.
5-element hierarchy: cinematography → setting → subject → action → optional dialogue.
Use professional film terminology ("slow dolly forward", "crane descending", "Dutch angle").
Lighting terms work well: "golden hour backlighting", "volumetric fog rays", "dappled light".
DO NOT overload — one primary action per generation. Target 150-300 characters.`,

    seedance: `Seedance 1.5/2.0: 4-LAYER STRUCTURE (unique to Seedance — follow exactly):
Layer 1: Primary action/subject — core visual element and movement.
Layer 2: Dialogue in double quotes if any — "Spoken line here."
Layer 3: Environmental audio cues — comma-separated ambient sounds (sizzling, wind, traffic).
Layer 4: Visual style and mood — aesthetic, lighting, emotional tone.
Include ambient sound descriptions (this is Seedance's primary differentiator).
Use camera_fixed language for static tripod shots. 100-150 words.`,
  };

  // Seedance dialogue suppression: when a separate TTS (Kokoro) will generate the voiceover,
  // Seedance MUST NOT generate dialogue audio because per-clip voice identity drift destroys
  // cross-clip brand voice consistency. See creative_production_knowledge §3 (dialogue is the
  // identity layer) and §15 (VO priority -12 to -6 dB requires ONE consistent voice across project).
  // Auto-infer: 'seedance' target + narration present + caller didn't override = suppress.
  const effectiveSuppressDialogue =
    context.suppressDialogue ??
    (context.targetModel === 'seedance' && !!context.narration?.trim());

  // When suppressing, replace the Seedance template with an explicit "no dialogue" variant.
  let modelGuide = modelTuning[context.targetModel || ''] || 'Default: slow push-in, minimal motion, one atmospheric detail. 80-120 words.';
  if (context.targetModel === 'seedance' && effectiveSuppressDialogue) {
    modelGuide = `Seedance 1.5/2.0 (DIALOGUE SUPPRESSED — TTS generates voice separately):
Layer 1: Primary action/subject — core visual element and movement.
Layer 2: NON-VERBAL vocalizations ONLY — breaths, grunts, laughs, sighs, gasps. NO spoken words, NO intelligible dialogue, NO narration. Voiceover is generated externally by a consistent TTS model and overlaid in post — Seedance must stay silent on speech to preserve brand voice consistency across clips.
Layer 3: Environmental audio cues — comma-separated ambient sounds${context.sfxDescription ? ` (weave in: ${context.sfxDescription.substring(0, 180)})` : ' (sizzling, wind, traffic, room tone as scene dictates)'}.
Layer 4: Visual style and mood — aesthetic, lighting, emotional tone.
NEGATIVE AUDIO: spoken dialogue, voiceover, narration, intelligible speech, spoken words.
Include ambient sound descriptions (this is Seedance's primary differentiator). Use camera_fixed language for static tripod shots. 100-150 words.`;
  } else if (context.targetModel === 'seedance' && context.sfxDescription) {
    // Seedance with explicit dialogue allowed + sfxDescription: enrich Layer 3 with script SFX
    modelGuide = `${modelTuning.seedance}
Weave these specific ambient/foley sounds into Layer 3: ${context.sfxDescription.substring(0, 200)}`;
  }

  // HOTFIX 2026-04-08: 60s hard cap — called per-scene from video worker
  // (300s total budget). If refinement hangs, worker falls back to buildMotionPrompt()
  // heuristic, which is what the video worker's catch block at line ~113 already expects.
  const { object } = await generateObject({
    model,
    schema: RefinedVideoPromptSchema,
    temperature: 0.2,
    abortSignal: AbortSignal.timeout(60_000),
    prompt: `You are VideoPromptMaster — a prompt engineer for image-to-video AI models.

## TASK
Refine a motion prompt for one scene. The video model receives the starting image + your text. Output ONE prompt describing how the image comes to life.

## SCENE CONTEXT
Starting image shows: ${context.visualDescription.substring(0, 400)}
Initial motion idea: ${context.videoMotionPrompt || 'Not specified — choose most cinematic option'}
${effectiveSuppressDialogue
  ? `Voice cadence reference (TTS handles the actual speech separately — DO NOT generate voice): "${context.narration?.substring(0, 400) || ''}"`
  : `Narration: ${context.narration?.substring(0, 800) || 'Silent'}`
}
Mood: ${context.mood || 'neutral'} | Duration: ${context.durationSeconds}s
${context.cameraDirection ? `Camera direction: ${context.cameraDirection}` : ''}
${context.transitionHint ? `Scene ends with: ${context.transitionHint}` : ''}
${context.previousSceneLastFrame ? 'Continues from previous scene — maintain visual continuity.' : ''}
${context.sfxDescription ? `\n## SOUND DESIGN (creative_production_knowledge §3 Three-Layer Sound Model)\nAmbient + spot SFX for this scene: ${context.sfxDescription.substring(0, 300)}` : ''}
${context.cinemaHardware ? `\n## CINEMA HARDWARE (weave these terms naturally into your prompt)\n${context.cinemaHardware}` : ''}

## KEY SUBJECTS
${subjectContext}

## PROMPT STRUCTURE (follow this order — placeholders DO NOT copy, fill from script)
1. ENVIRONMENT + LIGHTING first. Shape: "LIGHTING_QUALITY + DIRECTION fills SETTING_TYPE interior/exterior"
2. SUBJECT + ACTION. Shape: "SUBJECT performs ACTION in SETTING" — use the script's exact subject and action.
3. CAMERA MOVEMENT — be PRECISE. Shape: "CAMERA_MOVE_VERB + SPEED + TARGET" (e.g. the specific move the script calls for, not the generic word "camera moves").
4. ATMOSPHERIC DETAIL — ONE only. Shape: "ATMOSPHERIC_ELEMENT VERB subtly/gently (fog, steam, dust, light shift, fabric motion — pick one that fits the user\'s setting, do not invent).

## ARTIFACT AVOIDANCE (CRITICAL — these cause visual failures in AI video models)
- NEVER describe hands interacting with small objects in precise grip/manipulation. AI models fail at finger-object articulation. Instead frame the RESULT or wider context of the action — describe what the action accomplishes, not the micro-mechanics of fingers/hands gripping.
- NEVER describe eating mechanics (biting, chewing, swallowing). AI models fail at mouth+food motion. Instead describe the surrounding expression and staging — the moment around the meal, not the moment of consumption.
- NEVER include readable text in the scene. Text overlays are added separately in post.
- ALWAYS specify: "consistent lighting throughout, no exposure changes"
- ALWAYS specify: "temporally consistent, smooth motion, no flickering"
- For people: default to natural relaxed posture with hands at sides or resting on a surface, unless a specific gesture is essential to the script.
- For products/foreground subjects: hero positioned at rule-of-thirds intersection with shallow depth of field.

## COMPOSITION (from cinematography principles)
- Use rule of thirds for subject placement
- Include foreground/background separation (depth)
- Specify lighting direction: "soft diffused light from left" or "warm backlight with rim highlights"
- Appropriate headroom and looking room for people shots

## PHYSICS & REALISM
- Include weight: "heavy door swings slowly" not "door opens"
- Include momentum: "hair settles after turning" not "turns head"
- Natural environmental motion: wind on fabric, steam, reflections in glass

## MODEL-SPECIFIC TUNING
${modelGuide}

## OUTPUT
80-150 words. ONE paragraph. No bullet points. Return in the prompt field.`,
  });

  let finalPrompt = object.prompt;

  // ─── Post-processing: Model-specific length enforcement ──────────
  if (context.targetModel === 'veo') {
    // [Video Gen] Veo length enforcement: 150-300 characters optimal.
    // Quality degrades significantly above 400 chars.
    if (finalPrompt.length > 300) {
      console.log(`[VideoPromptMaster] Veo prompt too long (${finalPrompt.length} chars) — truncating to 300 chars`);
      finalPrompt = finalPrompt.substring(0, 300);
      // Try to end at a clean sentence or word boundary if possible within the 150-300 range
      const lastPeriod = finalPrompt.lastIndexOf('.');
      if (lastPeriod > 150) {
        finalPrompt = finalPrompt.substring(0, lastPeriod + 1);
      } else {
        const lastSpace = finalPrompt.lastIndexOf(' ');
        if (lastSpace > 150) {
          finalPrompt = finalPrompt.substring(0, lastSpace);
        }
      }
    }
  }

  return finalPrompt;
}

/**
 * Check if LLM parsing is available.
 */
export function isLLMParserAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
