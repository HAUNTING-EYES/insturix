/**
 * Remotion composition id — single source of truth for the SERVER-side render paths.
 *
 * MUST equal the composition id registered in the deployed Lambda bundle, i.e. `COMP_NAME` in
 * `components/editron/editor/version-7.0.0/remotion/root.tsx` (currently "TestComponent").
 * If these drift, Remotion fails every render with:
 *   "Could not find composition with ID <x>. Available compositions: TestComponent"
 * — that exact 500 is what the chapter renderer's hardcoded 'EditronComposition' produced.
 *
 * Every `renderMediaOnLambda` call site (chapter-renderer, cloudrun/render, render-queue) imports this,
 * so the three can never silently disagree again.
 */
export const REMOTION_COMPOSITION_ID = 'TestComponent';

/**
 * Frames per renderer Lambda for full-composition renders (chapter, cloudrun, render-queue).
 *
 * Lower = smaller chunks that finish well under the Lambda function timeout, plus more parallelism
 * across the AWS concurrency quota. 100 is derived from production data: on 2GB-memory renderer
 * Lambdas a 200-frame chunk took ~600s (the function ceiling) and overflowed on heavy content
 * ("N chunks missing"); 100 frames ≈ ~300s, half the ceiling. Raise it if you bump the Lambda
 * memory (faster frames); lower it if heavy renders still overflow.
 *
 * NOTE: analysis frame-extraction renders set their own larger value — they're lightweight frame
 * grabs, not full composites.
 */
export const REMOTION_FRAMES_PER_LAMBDA = 100;
