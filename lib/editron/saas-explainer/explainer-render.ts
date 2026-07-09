/**
 * SaaS Explainer — Lambda render service (U3 / U5 "Render" exit).
 *
 * Renders a set of BESPOKE crafted scenes (the agent-craft output) into a finished MP4 on the SAME Lambda
 * function Editron already uses. Because the scenes are bespoke CODE (not data for the pinned TestComponent
 * site), the explainer gets its own render path: write this video's scenes into the explainer Remotion project,
 * deploy a PER-VIDEO site, then renderMediaOnLambda the `Gen-Film` composition against that fresh serveUrl.
 *
 * Proven end-to-end 2026-07-10: deploySite -> render on `remotion-render-4-0-398-...` -> MP4, ~$0.044/render.
 *
 * RUNTIME: Node worker only (uses fs + @remotion/bundler via deploySite). NOT an edge/serverless request path —
 * deploySite bundles the on-disk project and needs a writable checkout. Enqueue this from the finalize route
 * (Phase 2) the same way chapter renders are enqueued; do not call it inline in a Vercel edge function.
 *
 * Matches chapter-renderer.ts conventions: setAWSCredentials(), h264, privacy public, getRenderProgress polling,
 * REMOTION_LAMBDA_FUNCTION_NAME / REMOTION_AWS_REGION env.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  deploySite,
  getOrCreateBucket,
  renderMediaOnLambda,
  getRenderProgress,
  type AwsRegion,
} from '@remotion/lambda';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';

/** One bespoke scene produced by the craft loop. `index` maps to `scene-<index>.tsx` in the gen dir. */
export interface ExplainerScene {
  index: number;
  /** Full .tsx contents; must export `const GlmScene: React.FC<{brand: Brand}>`. */
  code: string;
}

export interface RenderExplainerInput {
  /** Stable per-video id; used for the S3 site name so concurrent videos don't collide. */
  videoId: string;
  /** The accepted crafted scenes. */
  scenes: ExplainerScene[];
  /** manifest.ts contents (GEN_SCENES / GEN_META) that `Gen-Film` reads — agent-craft emits this verbatim. */
  manifest: string;
  /** Optional 0..1 progress callback for the finalize UI. */
  onProgress?: (progress: number) => void;
}

export interface RenderExplainerResult {
  url: string;
  renderId: string;
  bucketName: string;
  costUsd: number | null;
}

const COMPOSITION_ID = 'Gen-Film';

/** Absolute path to the explainer Remotion project (its `src/lambda-entry.ts` is the deploy entry). */
function explainerDir(): string {
  return process.env.EXPLAINER_REMOTION_DIR ?? path.join(process.cwd(), 'explainer-remotion');
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`explainer-render: ${name} is not set (needs Editron's deployed Remotion Lambda config).`);
  return v;
}

/** Write this video's scenes + manifest into the explainer project's gen dir, ready for deploySite to bundle. */
function writeGenFiles(dir: string, scenes: ExplainerScene[], manifest: string): void {
  const genDir = path.join(dir, 'src', 'bricks', 'gen');
  if (!existsSync(genDir)) mkdirSync(genDir, { recursive: true });
  for (const s of scenes) {
    writeFileSync(path.join(genDir, `scene-${s.index}.tsx`), s.code);
  }
  writeFileSync(path.join(genDir, 'manifest.ts'), manifest);
}

/**
 * Deploy a per-video site containing these scenes and render `Gen-Film` on Lambda. Resolves to the MP4 URL.
 * Throws (fail loud) on missing config or a fatal Lambda error — the caller/worker records the failure.
 */
export async function renderExplainerFilm(input: RenderExplainerInput): Promise<RenderExplainerResult> {
  const { videoId, scenes, manifest, onProgress } = input;
  if (!scenes.length) throw new Error('explainer-render: no scenes to render.');

  const region = (process.env.REMOTION_AWS_REGION ?? 'us-east-1') as AwsRegion;
  const functionName = requireEnv('REMOTION_LAMBDA_FUNCTION_NAME');
  const dir = explainerDir();
  const entryPoint = path.join(dir, 'src', 'lambda-entry.ts');
  const siteName = `explainer-${videoId.replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`;

  if (!existsSync(entryPoint)) {
    throw new Error(`explainer-render: entry not found at ${entryPoint} (is EXPLAINER_REMOTION_DIR correct?).`);
  }

  await setAWSCredentials();
  writeGenFiles(dir, scenes, manifest);

  const { bucketName } = await getOrCreateBucket({ region });

  const { serveUrl } = await deploySite({ region, bucketName, entryPoint, siteName });

  const { renderId } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: COMPOSITION_ID,
    codec: 'h264',
    privacy: 'public',
    downloadBehavior: { type: 'download', fileName: `${siteName}.mp4` },
  });

  for (;;) {
    const p = await getRenderProgress({ renderId, bucketName, functionName, region });
    if (p.fatalErrorEncountered) {
      throw new Error(`explainer-render: Lambda render failed — ${p.errors?.[0]?.message ?? 'unknown error'}`);
    }
    if (p.done) {
      if (!p.outputFile) throw new Error('explainer-render: render finished without an output file.');
      return { url: p.outputFile, renderId, bucketName, costUsd: p.costs?.accruedSoFar ?? null };
    }
    onProgress?.(p.overallProgress ?? 0);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
