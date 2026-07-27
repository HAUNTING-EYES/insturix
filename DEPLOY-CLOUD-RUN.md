# Deploy the SaaS Explainer render worker to Google Cloud Run

The studio (on Vercel) enqueues a render job in Mongo. This worker picks it up, runs the Claude craft loop
(local headless Chromium) and the Lambda render, and writes the MP4 URL back. It can't run on Vercel (needs a
persistent browser for minutes), so it runs here.

**Shape:** a **Cloud Run Job** (run-to-completion) triggered by **Cloud Scheduler** every minute. Each run drains
the queue (`EXPLAINER_WORKER_ONCE=1`) and exits → scales to zero, pay-per-run. No always-on cost.

> Status: this is deployment scaffolding — the Dockerfile + commands are written but **not built/deployed/tested
> from here** (needs your GCP). Expect the first `builds submit` to want one or two tweaks (usually an apt lib or
> a Chromium flag). Everything the worker itself does is already proven; this is only the packaging + trigger.

---

## 0. Prereqs
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com
REGION=us-central1   # pick one close to your Mongo/Lambda
```

## 1. Build + push the image (Cloud Build — no local Docker needed)
```bash
gcloud builds submit \
  --tag $REGION-docker.pkg.dev/YOUR_PROJECT_ID/editron/explainer-worker:latest \
  --file Dockerfile.explainer-worker .
```
(Create the Artifact Registry repo once if needed: `gcloud artifacts repositories create editron --repository-format=docker --location=$REGION`.)

## 2. Put the secrets in Secret Manager (recommended over plain env)
The worker needs — copy the SAME values from your `.env.local`:
- `MONGODB_URI`, `EDITRON_MONGODB_DB_NAME` (or `MONGODB_DB_NAME`)
- `ANTHROPIC_API_KEY`  (the craft agent)
- your Remotion **Lambda** vars: `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_AWS_REGION`, and the Lambda function/serve-url vars you already use for Editron renders

It does **not** need Gemini or R2 (those are the Vercel side).

```bash
printf '%s' 'YOUR_VALUE' | gcloud secrets create MONGODB_URI --data-file=-   # repeat per secret
```

## 3. Create the Cloud Run Job
```bash
gcloud run jobs create explainer-worker \
  --image $REGION-docker.pkg.dev/YOUR_PROJECT_ID/editron/explainer-worker:latest \
  --region $REGION \
  --cpu 2 --memory 4Gi \
  --task-timeout 1800 \
  --max-retries 1 \
  --set-secrets MONGODB_URI=MONGODB_URI:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,REMOTION_AWS_ACCESS_KEY_ID=REMOTION_AWS_ACCESS_KEY_ID:latest,REMOTION_AWS_SECRET_ACCESS_KEY=REMOTION_AWS_SECRET_ACCESS_KEY:latest \
  --set-env-vars EDITRON_MONGODB_DB_NAME=editron_prev,REMOTION_AWS_REGION=us-east-1
```
(2 vCPU / 4 GB matches the pricing estimate; bump to 4/8 if renders OOM. `task-timeout 1800` = 30 min ceiling per run.)

## 4. Trigger it every minute (Cloud Scheduler)
```bash
gcloud scheduler jobs create http explainer-worker-tick \
  --location $REGION --schedule "* * * * *" \
  --uri "https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/explainer-worker:run" \
  --http-method POST \
  --oauth-service-account-email YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com
```
Every tick: if the queue is empty the job exits in ~2s (≈ free); if there are jobs it renders them, then exits.

**Faster option (no 1-min wait):** instead of/alongside Scheduler, have the `/finalize` route fire the same
`jobs/explainer-worker:run` call after it enqueues, so a render starts immediately. Scheduler then just backstops
retries. (That needs a GCP service-account token in the Vercel function — do it later if the minute delay bugs you.)

## 5. Test
```bash
gcloud run jobs execute explainer-worker --region $REGION
gcloud run jobs executions list --job explainer-worker --region $REGION   # watch it
```
Then make a real one in the studio and confirm the job's logs show `claimed … → done`, and the studio result
screen shows the MP4.

---

**Local / Railway alternative:** the same worker runs as an always-on daemon with just
`set -a; . .env.local; set +a; npx tsx scripts/explainer-worker.ts` (no `EXPLAINER_WORKER_ONCE`). Cloud Run Job
mode is the pay-per-run path; the daemon is the always-on path.
