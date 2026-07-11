/**
 * Motion Director — turns an AvatarRenderRecipe into a fal OmniHuman v1.5 prompt
 * that actually directs the performance (gesture, camera, mood), instead of the
 * bare scene text the pipeline used to send.
 *
 * Root cause this fixes (confirmed by live A/B render 2026-07-06): OmniHuman v1.5
 * is prompt-directable, but `buildOmniHumanStage` shipped `recipe.creative.prompt`
 * raw — dropping the gestureStyle/cameraPresence/personaTone the recipe already
 * computes. Blank prompt → the subject stands frozen. A directed prompt → gesture,
 * push-in, life.
 *
 * OmniHuman reads the prompt left-to-right in this order (fal's own prompt guide):
 *   [Camera movement] + [Emotion/mood] + [Speaking state] + [Specific actions] + [Scene]
 *
 * The direction is natural language derived from recipe tokens — never frame
 * numbers or pixel offsets. Per-use-case presets fill any slot the avatar's
 * performancePack leaves empty, so no render ever ships promptless again.
 */

import type {
  AvatarExpressiveness,
  AvatarRenderRecipe,
  AvatarRenderUseCase,
} from './avatar-render-recipe';

interface MotionPreset {
  camera: string;
  mood: string;
  actions: string;
}

// Defaults used ONLY when the avatar's performancePack leaves a slot empty.
const USE_CASE_PRESETS: Record<AvatarRenderUseCase, MotionPreset> = {
  speech_delivery: {
    camera: 'Camera holds a steady medium shot with a slow, subtle push-in.',
    mood: 'Warm, confident and composed — relaxed shoulders, bright engaged eyes, an easy natural smile.',
    actions: 'Gestures naturally with open hands to emphasise points, occasional nods, small weight shifts. Grounded, present, never stiff.',
  },
  explainer_host: {
    camera: 'Camera stays on a steady medium shot with a gentle push-in on key points.',
    mood: 'Clear, friendly and authoritative — approachable expert energy.',
    actions: 'Uses purposeful hand gestures to structure the explanation, marks out points, leans in slightly to stress ideas.',
  },
  social_presenter: {
    camera: 'Loose, gently handheld framing with light energy.',
    mood: 'Upbeat, personable and expressive — high warmth, direct eye contact.',
    actions: 'Lively animated hand gestures, expressive eyebrows, natural head movement, an occasional lean toward the camera.',
  },
  product_shoot: {
    camera: 'Camera holds a stable medium shot, optionally a slow arc around the subject.',
    mood: 'Focused and inviting — presenting with quiet confidence.',
    actions: 'Presents and gestures toward the product, hands interacting with it naturally, guiding the viewer’s attention.',
  },
  ad_actor: {
    camera: 'Dynamic framing with a confident push-in on the delivery.',
    mood: 'Expressive and persuasive — committed, energetic screen presence.',
    actions: 'Natural acting beats — expressive gestures, deliberate movement, delivering the line with intent.',
  },
  generic_clip: {
    camera: 'Camera holds a steady, natural framing.',
    mood: 'Natural, relaxed and lifelike presence.',
    actions: 'Subtle natural motion — small gestures and shifts appropriate to the moment.',
  },
};

const EXPRESSIVENESS_MODIFIER: Record<AvatarExpressiveness, string> = {
  calm: 'Keep the overall energy calm and restrained — minimal, deliberate motion.',
  natural: 'Keep the overall energy natural and lifelike — alive throughout, never frozen, never exaggerated.',
  animated: 'Keep the overall energy lively and animated — expressive, dynamic motion throughout.',
};

/**
 * Compose the OmniHuman prompt for a recipe. Pure and deterministic: identical
 * recipes yield identical prompts (important for reproducible renders).
 */
export function composeOmniHumanPrompt(recipe: AvatarRenderRecipe): string {
  const preset = USE_CASE_PRESETS[recipe.useCase] ?? USE_CASE_PRESETS.generic_clip;
  const creative = recipe.creative;

  const camera = firstNonEmpty(creative.cameraPresence, preset.camera);
  const mood = composeMood(creative.personaTone, creative.personaRole, preset.mood);
  const speakingState = composeSpeakingState(recipe);
  const actions = composeActions(recipe, preset);
  const expressiveness = EXPRESSIVENESS_MODIFIER[creative.expressiveness ?? 'natural'];
  const scene = optionalTrim(creative.prompt);

  return [camera, mood, speakingState, actions, expressiveness, scene]
    .map(ensureSentence)
    .filter(isNonEmpty)
    .join(' ');
}

/**
 * Compose the prompt for a lane-B body-motion (Kling i2v) shot. Unlike the talking-head
 * prompt, this one commits to a FULL-BODY WIDE framing and real locomotion — because
 * i2v animates whatever framing it's told, and a "medium shot / speak to camera" prompt
 * (or a face crop) yields a talking-head closeup, defeating the whole point of lane B.
 * No lip-sync line: i2v is silent, the mouth is added by the relip step downstream.
 */
export function composeBodyMotionPrompt(recipe: AvatarRenderRecipe): string {
  const creative = recipe.creative;
  const preset = USE_CASE_PRESETS[recipe.useCase] ?? USE_CASE_PRESETS.generic_clip;
  const framing = 'Full-body wide shot — the entire person is visible head to toe with room to move in the frame.';
  const mood = composeMood(creative.personaTone, creative.personaRole, preset.mood);
  const motion = firstNonEmpty(
    creative.gestureStyle,
    'The person moves through the scene with real locomotion — walking, turning, natural steps and weight shifts, full-body hand gestures.',
  );
  const expressiveness = EXPRESSIVENESS_MODIFIER[creative.expressiveness ?? 'natural'];
  const scene = optionalTrim(creative.prompt);
  return [framing, mood, motion, expressiveness, scene]
    .map(ensureSentence)
    .filter(isNonEmpty)
    .join(' ');
}

function composeMood(tone: string | undefined, role: string | undefined, fallback: string): string {
  const bits: string[] = [];
  if (isNonEmpty(tone)) bits.push(tone.trim());
  if (isNonEmpty(role)) bits.push(`${role.trim()} presence`);
  if (bits.length === 0) return fallback;
  // Keep a physical-liveness cue even when the avatar supplies terse tone words.
  return `${bits.join(', ')} — engaged, present, bright eyes.`;
}

function composeSpeakingState(recipe: AvatarRenderRecipe): string {
  const speaks =
    recipe.audio.mode !== 'silent' ||
    isNonEmpty(recipe.audio.voiceoverText) ||
    isNonEmpty(recipe.creative.script);
  return speaks
    ? 'Speaking directly to the camera with accurate lip-sync and unhurried natural pauses.'
    : 'Not speaking — calm idle presence with lifelike breathing and micro-movements.';
}

function composeActions(recipe: AvatarRenderRecipe, preset: MotionPreset): string {
  const base = firstNonEmpty(recipe.creative.gestureStyle, preset.actions);
  if (recipe.useCase === 'product_shoot' && isNonEmpty(recipe.creative.productInteraction)) {
    return `${ensureSentence(base)} ${ensureSentence(recipe.creative.productInteraction)}`.trim();
  }
  return base;
}

function firstNonEmpty(primary: string | undefined, fallback: string): string {
  return isNonEmpty(primary) ? primary.trim() : fallback;
}

function ensureSentence(value: string | undefined): string {
  const trimmed = optionalTrim(value);
  if (!trimmed) return '';
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function optionalTrim(value: string | undefined): string | undefined {
  if (!isNonEmpty(value)) return undefined;
  return value.trim();
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
