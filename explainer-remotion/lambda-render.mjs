// lambda-render.mjs — U3: the per-video-deploy → Editron-Lambda render path for the explainer (option A).
//
// WHY per-video deploy: Editron's Lambda renders a SINGLE, commit-PINNED site (REMOTION_LAMBDA_SERVE_URL) of
// the fixed 'TestComponent' composition with data passed as inputProps. But the Craft loop produces BESPOKE
// CODE per video (that's what makes it premium, not a data template). A fixed data-driven site cannot render
// fresh per-video code — so the explainer gets its OWN render path: deploy a fresh site that CONTAINS this
// video's crafted scenes, then render the real 'Gen-Film' composition on Lambda against THAT serveUrl.
// This keeps the bespoke quality AND stays on Lambda (founder's "Lambda only" for the deliverable).
//
// Matches Editron's conventions (lib/editron/services/chapter-renderer.ts): same functionName/region env,
// codec h264, framesPerLambda, privacy public, getRenderProgress polling.
//
// PREREQUISITES (cannot run without these — the standalone box has no AWS):
//   1) npm i @remotion/lambda
//   2) A deployed Remotion Lambda FUNCTION (Editron already has one). Env:
//        REMOTION_LAMBDA_FUNCTION_NAME   (e.g. remotion-render-4-0-x-mem2048mb-disk2048mb-120sec)
//        REMOTION_AWS_REGION             (default us-east-1)
//        AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (or Editron's setAWSCredentials equivalent)
//   3) Crafted scenes already written (run agent-craft.mjs first → src/bricks/gen/*).
//
// RUN:  node scripts/lambda-render.mjs [videoId]
// The Editron port = move this module + the brick kit into the Editron Remotion root, expose 'Gen-Film' as an
// 'ExplainerFilm' composition there, and call this from the saas-explainer finalize step (U5 render exit).

import {deploySite, getOrCreateBucket, renderMediaOnLambda, getRenderProgress} from '@remotion/lambda';

const REGION = process.env.REMOTION_AWS_REGION || 'us-east-1';
const FUNCTION_NAME = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
const ENTRY = 'src/lambda-entry.ts'; // minimal root — registers only Gen-Film (avoids InsturixExplainer's @remotion/transitions dep)
const COMPOSITION = 'Gen-Film'; // the real bespoke-scene film (GenFilm) — NOT the fixed TestComponent
const VIDEO_ID = (process.argv[2] || `v${process.pid}`).replace(/[^a-z0-9-]/gi, '').slice(0, 40);

if (!FUNCTION_NAME) {
  console.error('✗ REMOTION_LAMBDA_FUNCTION_NAME unset. Point it at Editron\'s deployed Remotion Lambda function.');
  process.exit(1);
}

(async () => {
  // 1) bucket (reuse the org's Remotion bucket, or create one).
  console.log(`[lambda] region=${REGION} function=${FUNCTION_NAME}`);
  const {bucketName} = await getOrCreateBucket({region: REGION});
  console.log(`[lambda] bucket=${bucketName}`);

  // 2) DEPLOY a per-video site that CONTAINS this video's crafted scenes. siteName is per-video so concurrent
  //    videos don't clobber each other; Remotion overwrites the same site on re-render of the same video.
  console.log(`[lambda] deploying per-video site explainer-${VIDEO_ID} …`);
  const {serveUrl} = await deploySite({
    region: REGION,
    bucketName,
    entryPoint: ENTRY,
    siteName: `explainer-${VIDEO_ID}`,
  });
  console.log(`[lambda] serveUrl=${serveUrl}`);

  // 3) RENDER the real bespoke film on Lambda (Editron's exact render params).
  const {renderId} = await renderMediaOnLambda({
    region: REGION,
    functionName: FUNCTION_NAME,
    serveUrl,
    composition: COMPOSITION,
    codec: 'h264',
    privacy: 'public',
    // framesPerLambda left default: short explainers chunk fine; Editron pins it only for >3min chapter renders.
    downloadBehavior: {type: 'download', fileName: `explainer-${VIDEO_ID}.mp4`},
  });
  console.log(`[lambda] renderId=${renderId} — rendering…`);

  // 4) POLL to completion (same shape as chapter-renderer's progress loop).
  for (;;) {
    const p = await getRenderProgress({renderId, bucketName, functionName: FUNCTION_NAME, region: REGION});
    if (p.fatalErrorEncountered) {
      console.error(`✗ Lambda render failed: ${p.errors?.[0]?.message || 'unknown'}`);
      process.exit(1);
    }
    if (p.done) {
      console.log(`\n✓ done → ${p.outputFile}`);
      console.log(`  cost ≈ $${p.costs?.accruedSoFar?.toFixed?.(4) ?? '?'} · ${(p.renderMetadata?.totalChunks ?? '?')} chunks`);
      break;
    }
    process.stdout.write(`\r[lambda] ${Math.round((p.overallProgress || 0) * 100)}%   `);
    await new Promise((r) => setTimeout(r, 2000));
  }
})().catch((e) => { console.error(e); process.exit(1); });
