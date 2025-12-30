# ThinkForge AI Authentication Setup Guide

## Overview

ThinkForge uses Google Generative AI with API key authentication. For production deployments on Cloud Run with Vertex AI, use service account credentials via Application Default Credentials (ADC).

## Prerequisites

1. **Google Cloud Project** - Create or use an existing GCP project
2. **Generative AI API enabled** - Enable the API in your GCP console
3. **API Key** (for development) or **Service Account** (for production)

## Development Setup (Local)

### 1. Get Your API Key

**Option A: Using Google Cloud Console**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "API keys" in the credentials section
3. Create a new API key
4. Copy the key

**Option B: Using `gcloud` CLI**
```bash
# Install Google Cloud SDK if not already installed
brew install google-cloud-sdk  # macOS
# or download from https://cloud.google.com/sdk/docs/install

# Create API key via gcloud
gcloud services enable generativeai.googleapis.com
```

### 2. Set Environment Variables

Create a `.env.local` file in your `Front-End` directory:

```env
# Google Generative AI API Key
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
```

### 3. (Optional) Set Up ADC for Vertex AI

If you want to use Vertex AI with Application Default Credentials:

```bash
gcloud auth application-default login
```

This stores credentials at:
- **macOS/Linux**: `~/.config/gcloud/application_default_credentials.json`
- **Windows**: `%APPDATA%\gcloud\application_default_credentials.json`

## Production Setup (Cloud Run / GCP)

### 1. Create a Service Account

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Create service account
gcloud iam service-accounts create thinkforge-api \
  --display-name="ThinkForge API"

# Get the service account email
gcloud iam service-accounts list --format='value(email)' \
  --filter="displayName:thinkforge-api"
```

### 2. Grant Vertex AI Permissions

```bash
# Grant Vertex AI User role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:thinkforge-api@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### 3. Deploy to Cloud Run

Cloud Run automatically uses the service account's credentials when deployed.

**Set environment variables in Cloud Run:**

```bash
gcloud run deploy thinkforge-api \
  --service-account=thinkforge-api@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID \
  --set-env-vars GOOGLE_CLOUD_REGION=us-central1
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | - | Your Google Generative AI API key |
| `GOOGLE_CLOUD_PROJECT_ID` | No | - | GCP project ID (for Cloud Run deployment) |
| `GOOGLE_CLOUD_REGION` | No | `us-central1` | GCP region (for Cloud Run deployment) |

## Verification

### Test Locally

```bash
# 1. Set your API key
export GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here

# 2. Run the dev server
npm run dev

# 3. Test the ideas endpoint (in another terminal)
curl -X POST http://localhost:3000/api/services/thinkforge/ideas \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Generate ideas for a cooking video"}'
```

You should see a response with 4 generated ideas.

### Test with Authentication

If using Clerk authentication:

```bash
# Get a Clerk token
CLERK_TOKEN=$(curl -X POST https://api.clerk.com/v1/sign_ins \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@example.com", "password": "password"}')

# Use token in request
curl -X POST http://localhost:3000/api/services/thinkforge/ideas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -d '{"prompt": "Generate ideas for a cooking video"}'
```

## Troubleshooting

### "GOOGLE_GENERATIVE_AI_API_KEY is missing"
- Add `GOOGLE_GENERATIVE_AI_API_KEY` to `.env.local` (development)
- Add `GOOGLE_GENERATIVE_AI_API_KEY` as an environment variable in Cloud Run
- Get your API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

### "Error generating ideas: Error [AI_LoadAPIKeyError]"
- Ensure `GOOGLE_GENERATIVE_AI_API_KEY` is set correctly
- Check that the API key is valid and not revoked
- Verify the Generative AI API is enabled in your GCP project

### "Generative AI API not enabled"
```bash
gcloud services enable generativeai.googleapis.com
```

### "Invalid API Key"
- Log in to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Delete the old key and create a new one
- Update `.env.local` with the new key
- Restart the dev server

### "Quota exceeded"
- Check your [API quotas](https://console.cloud.google.com/iam-admin/quotas)
- You may need to upgrade to a paid plan
- Contact Google Cloud Support for quota increase

## Agent Updates

All AI agents now use Vertex AI with ADC:

- **`lib/thinkforge/agents/ideas-agent.ts`** - Generates content ideas
- **`lib/thinkforge/agents/chat-agent.ts`** - Handles chat responses  
- **`lib/thinkforge/agents/script-draft-agent.ts`** - Generates script drafts

Each uses the same `createVertexAIModel()` helper to initialize the model with proper authentication.

## Costs

Vertex AI pricing:
- **Input tokens**: $0.075 per 1M tokens
- **Output tokens**: $0.3 per 1M tokens
- **Free tier**: 300K input tokens + 100K output tokens monthly

Monitor usage:
```bash
gcloud billing accounts list
gcloud compute billing-accounts describe BILLING_ACCOUNT_ID
```

## References

- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Gemini API](https://cloud.google.com/vertex-ai/generative-ai/docs/gemini)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Vercel Google Cloud Integration](https://vercel.com/docs/concepts/integrations/google-cloud)

