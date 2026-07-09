# One real explainer, end-to-end (craft → VO → Lambda render → MP4)

This runs the whole engine for ONE video on your real Lambda function. Sample Insturix inputs are already in
`out/plan.json` + `out/product-model.json`, so you can run immediately. ~10–20 min, ~$0.05 Lambda + craft tokens.

## 1. Deps (one time)
Run from `editron-worktree/explainer-remotion`:

```bash
cd "editron-worktree/explainer-remotion"

# Anthropic SDK for the craft loop (installed LOCALLY here; @remotion/* resolve up to editron's node_modules)
npm i @anthropic-ai/sdk

# VO synth (free, edge-tts) + audio muxing
pip install edge-tts          # or: pip3 install edge-tts
#   ffmpeg + ffprobe must be on PATH (brew install ffmpeg / apt install ffmpeg)
```
The heavy Remotion deps (`@remotion/lambda@4.0.398`, bundler, renderer) + Chromium come from editron — nothing to install.

## 2. Env
```bash
set -a; . ../.env.local; set +a          # AWS creds + REMOTION_LAMBDA_FUNCTION_NAME + REMOTION_AWS_REGION
export ANTHROPIC_API_KEY=sk-ant-...       # your Anthropic key (for the craft loop)
export EXPLAINER_VOICE=en-US-AvaNeural    # optional — pick any id from lib/editron/saas-explainer/vo-voices.ts
                                          #   Ava / Andrew / Emma / Brian / Guy / Jenny / Aria / Sonia / Ryan / Natasha
```

## 3. Run
```bash
node scripts/craft-and-render.mjs demo1
```
You'll see three phases:
- **[1/3] VO + music** — synths Ava (or your chosen voice) per line, fits each scene to its narration.
- **[2/3] CRAFT** — the agent writes bespoke scenes, renders frames, LOOKS, fixes (3 rounds each).
- **[3/3] RENDER** — deploys a per-video site + renders `Gen-Film` (with sound) on Lambda.

Last line: `EXPLAINER_MP4=https://s3...out.mp4` — open it. That's a real explainer, on-brand, **with voiceover + music**.

## Try different voices
Re-run with a different voice — no re-craft needed if you only want to hear the change is wired, but a full
re-run re-fits durations to the new voice:
```bash
EXPLAINER_VOICE=en-US-AndrewNeural node scripts/craft-and-render.mjs demo2
```

## Run it for a REAL scanned brand (instead of the Insturix sample)
Replace the two input files, then run the same command:
- `out/plan.json`  ← `directorContractToPlan(<SaasDirectorContract>, {narrationByIndex})` (lib/editron/saas-explainer/director-to-plan.ts)
- `out/product-model.json` ← `evidencePackToProductModel(<SaasProductEvidencePack>)`
- (optional) drop the brand's real screenshots into `public/product/scan-0.png`, `scan-1.png`, … — the agent
  will recreate/reference them; with none present it recreates the product UI from the model as bespoke code.

## Notes
- Silent-safe: if python/edge-tts/ffmpeg isn't set up, VO prep soft-fails and you still get a (silent) video.
- Single-run state: `out/` + `src/bricks/gen/` + `public/` are per-run; run one video at a time in this dir.
- In production this exact pipeline is what the finalize route enqueues → the explainer-worker runs on a box.
