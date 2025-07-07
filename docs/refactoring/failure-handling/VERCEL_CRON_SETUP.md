# Guide: Setting Up the Vercel Cron Job for Timeouts

## 1. Overview

To proactively handle tasks that get stuck in a `queued` or `processing` state, we will use a Vercel Cron Job. This feature allows us to trigger a specific API endpoint on a regular schedule. This guide explains how to configure it.

## 2. The Cron Job Endpoint

The designated endpoint for this job is:
`GET /api/cron/check-task-timeouts`

This endpoint contains the logic to find and fail timed-out tasks for all services.

## 3. Security

Vercel Cron Jobs are protected by a secret token. When Vercel calls our endpoint, it will include an `Authorization` header with a bearer token. Our endpoint code must validate this token to ensure that only Vercel can trigger it.

This requires a `CRON_SECRET` environment variable to be set in our Vercel project.

**Action:**
1.  Generate a strong, random string (e.g., using a password manager or `openssl rand -base64 32`).
2.  In your Vercel project settings, go to **Settings > Environment Variables**.
3.  Add a new variable named `CRON_SECRET` and paste the generated string as its value. Make sure to add it for all environments (Production, Preview, Development).

## 4. Configuration

The cron job is configured in the `vercel.json` file at the root of the project.

**Action:**
1.  Open or create the `vercel.json` file.
2.  Add the following `crons` configuration.

```json
{
  "crons": [
    {
      "path": "/api/cron/check-task-timeouts",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Schedule Explanation

The `schedule` value is a standard cron expression.

-   `*/5 * * * *` means "run at every 5th minute."

This is a sensible default. It ensures that stuck tasks are processed within a reasonable timeframe without putting excessive load on the system.

## 5. Deployment

Once you have:
1.  Added the `CRON_SECRET` to your Vercel environment variables.
2.  Added the configuration to `vercel.json`.

...simply deploy your project to Vercel. The cron job will be automatically registered and will start running on the defined schedule.

You can monitor the execution of your cron jobs in the Vercel dashboard under the **Logs** tab, filtering for Cron Job invocations.