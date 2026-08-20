/**
 * Clickatron fill/edit SYSTEM PROMPTS — the two base dialect contracts, kept in a neutral
 * leaf file that depends on nothing.
 *
 * Why they live here (not in clickatron-models.ts): the fill-prompt compiler needs these
 * strings, and the model registry needs the compiler. If the prompts stayed in the registry,
 * compiler→registry + registry→compiler would form a circular import (one side reads the
 * other before it's initialized → a silently-empty prompt). Both files now import these from
 * this leaf, so every arrow points one way. See fill-prompt-compiler.ts.
 */

export const GENERATIVE_FILL_SYSTEM_PROMPT =
  'Edit only the masked area. Preserve unmasked pixels, composition, lighting, style, and aspect ratio. Blend naturally; no instruction text.';

export const IMAGE_TO_IMAGE_SYSTEM_PROMPT =
  'Apply only the requested edit. Preserve unrequested subject, composition, framing, lighting, style, and aspect ratio. No instruction text.';
