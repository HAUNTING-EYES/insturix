# Remotion Lambda - Production Deployment Checklist

## Pre-requisites (Already Done)
- [x] AWS Lambda function deployed (shared across envs)
- [x] AWS IAM User & Role configured
- [x] Cron job added to `vercel.json`
- [x] Code merged to main branch

---

## Vercel Environment Variables

Add these to **Production** environment in Vercel Dashboard:

```
REMOTION_AWS_ACCESS_KEY_ID=<same as dev>
REMOTION_AWS_SECRET_ACCESS_KEY=<same as dev>
REMOTION_AWS_REGION=us-east-1
REMOTION_LAMBDA_FUNCTION_NAME=remotion-render-4-0-398-mem2048mb-disk2048mb-240sec
REMOTION_LAMBDA_SERVE_URL=<update after deploying prod site bundle>
```

- [ ] Add `REMOTION_AWS_ACCESS_KEY_ID`
- [ ] Add `REMOTION_AWS_SECRET_ACCESS_KEY`
- [ ] Add `REMOTION_AWS_REGION`
- [ ] Add `REMOTION_LAMBDA_FUNCTION_NAME`
- [ ] Add `REMOTION_LAMBDA_SERVE_URL` (after step below)

---

## Deploy Production Site Bundle

```bash
# From project root
pnpm deploy:remotion:prod
```

- [ ] Run deploy command
- [ ] Copy the output Serve URL
- [ ] Update `REMOTION_LAMBDA_SERVE_URL` in Vercel prod env

---

## MongoDB Production Setup

Run in MongoDB Atlas (production database):

```javascript
// Create TTL index for auto-cleanup of old render jobs
db.editron_render_jobs.createIndex(
  { expiresAt: 1 }, 
  { expireAfterSeconds: 0 }
)

// Create indexes for queries
db.editron_render_jobs.createIndex({ userId: 1, status: 1 })
db.editron_render_jobs.createIndex({ projectId: 1, userId: 1, status: 1 })
```

- [ ] Connect to production MongoDB
- [ ] Run TTL index command
- [ ] Run query indexes command

---

## S3 Lifecycle Rule (One-time Setup)

1. Go to AWS S3 Console
2. Select bucket: `remotionlambda-useast1-*`
3. Management → Lifecycle rules → Create rule
4. Settings:
   - Rule name: `cleanup-old-renders`
   - Prefix: `renders/`
   - Expiration: 7 days

- [ ] Create lifecycle rule

---

## Post-Deployment Verification

- [ ] Trigger a test render in production
- [ ] Verify render completes successfully
- [ ] Check MongoDB for new `editron_render_jobs` document
- [ ] Verify video URL is accessible

---

## Rollback Plan

If issues arise:
1. Revert Vercel deployment to previous version
2. Old renders will continue to work (S3 URLs remain valid for 7 days)
