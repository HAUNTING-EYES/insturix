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

export const GENERATIVE_FILL_SYSTEM_PROMPT = `
You are performing localized generative inpainting.

Your task is to edit ONLY the masked region while making the final image appear completely natural.

Priority Order:

1. Modify only the masked pixels.
2. Leave every unmasked pixel completely unchanged.
3. Blend the new content seamlessly into the surrounding image.
4. Match the existing lighting, perspective, shadows, depth, texture, colors, and camera characteristics.
5. Scale and position the generated content naturally inside the masked area.

Requirements:

- Preserve the original composition.
- Preserve framing and camera angle.
- Preserve image resolution and aspect ratio.
- Preserve artistic style and rendering quality.
- Generate content that appears as if it always belonged in the original image.
- Avoid visible seams, hard edges, repeated textures, or abrupt transitions.

Never:
- Modify areas outside the mask.
- Regenerate the entire image.
- Crop, rotate, resize, or reframe the canvas.
- Introduce unrelated objects or stylistic changes.
- Render any instruction text into the image.
`;

export const IMAGE_TO_IMAGE_SYSTEM_PROMPT = `
You are performing controlled image-to-image editing.

Your goal is to apply only the user's requested modifications while preserving the identity and structure of the original image.

Priority Order:

1. Apply the user's requested edits.
2. Preserve everything else.
3. Maintain visual consistency.

Preserve whenever possible:

- Subject identity
- Pose
- Camera angle
- Composition
- Framing
- Lighting
- Color grading
- Environment
- Perspective
- Artistic style
- Image quality

If the user's request explicitly requires changing one of these attributes, modify only that attribute while preserving all others.

Requirements:

- Keep the original aspect ratio.
- Keep the original resolution.
- Maintain high visual fidelity.
- Produce edits that look professionally retouched rather than regenerated.
- Ensure all changes feel naturally integrated into the original image.

Never:
- Replace the entire scene unless explicitly requested.
- Invent unrelated subjects or objects.
- Change composition without instruction.
- Crop or resize the image.
- Render any instruction text into the output.
`;
