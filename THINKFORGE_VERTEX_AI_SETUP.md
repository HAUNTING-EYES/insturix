# ThinkForge AI Authentication Setup Guide

## Overview

ThinkForge uses Google Generative AI with API key authentication via the `@ai-sdk/google` package. This provides a simple and reliable way to access Gemini models.

## Prerequisites

1. **Google Cloud Project** - Create or use an existing GCP project
2. **Generative AI API enabled** - Enable the API in your GCP console
3. **API Key** - Create an API key for authentication

## Quick Setup

### 1. Get Your API Key

**Option A: Using Google AI Studio (Recommended for Development)**
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key

**Option B: Using Google Cloud Console**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" > "Credentials"
3. Click "Create Credentials" > "API key"
4. Copy the key

### 2. Set Environment Variable

Add to your `.env.local` file (or deployment environment):

```env
# Any of these will work (checked in this order)
GEMINI_API_KEY=your-api-key-here
# or
GOOGLE_API_KEY=your-api-key-here
# or
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
```

### 3. Enable the API

If you haven't already, enable the Generative Language API:

```bash
gcloud services enable generativelanguage.googleapis.com
```

## Environment Variables Reference

| Variable | Priority | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | 1st | API key for Google Generative AI |
| `GOOGLE_API_KEY` | 2nd | API key for Google Generative AI |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 3rd | API key for Google Generative AI |

## Verification

### Test Locally

```bash
# 1. Set your API key
export GEMINI_API_KEY=your-api-key-here

# 2. Run the dev server
npm run dev

# 3. Test the ideas endpoint (in another terminal)
curl -X POST http://localhost:3000/api/services/thinkforge/ideas \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Generate ideas for a cooking video"}'
```

You should see in the console:
```
[ThinkForge] Using Google Generative AI with API key
```

## Agent Architecture

All ThinkForge agents use the unified model factory:

- **`lib/thinkforge/agents/model-factory.ts`** - Unified model creation with API key authentication
- **`lib/thinkforge/agents/ideas-agent.ts`** - Generates content ideas
- **`lib/thinkforge/agents/chat-agent.ts`** - Handles chat responses  
- **`lib/thinkforge/agents/script-draft-agent.ts`** - Generates script drafts
- **`lib/thinkforge/agents/script-refinement-agent.ts`** - Refines script drafts

Each agent calls `createThinkForgeModel()` which automatically handles authentication.

## Troubleshooting

### "No Google AI API key found"

Set one of the supported environment variables:
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

### "Invalid API Key"

- Check that the API key is valid in [Google AI Studio](https://aistudio.google.com/apikey)
- Ensure the Generative Language API is enabled
- Try creating a new API key

### "Quota exceeded"

- Check your [API quotas](https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas)
- Consider upgrading to a paid plan
- Implement rate limiting in your application

### "Model not found"

- Ensure you're using a valid model name (e.g., `gemini-2.0-flash`)
- Check [Google AI documentation](https://ai.google.dev/models) for available models

## Production Deployment

### Vercel

Add the environment variable in Vercel dashboard:
- Go to Project Settings > Environment Variables
- Add `GEMINI_API_KEY` with your API key value

### Cloud Run

```bash
gcloud run deploy your-service \
  --set-env-vars GEMINI_API_KEY=your-api-key-here
```

### Other Platforms

Set the `GEMINI_API_KEY` environment variable according to your platform's documentation.

## Vertex AI (Advanced)

For production deployments requiring Vertex AI with service account authentication:

1. **Cloud Run with ADC**: Deploy to Cloud Run where Application Default Credentials are automatically available
2. **Native SDK**: Use `@google/genai` directly for Vertex AI-specific features
3. **Custom Integration**: Implement a custom model wrapper using the Google Auth Library

Note: The current implementation uses the simpler API key approach which works well for most use cases.

## Costs

Google Generative AI (Gemini) pricing:
- **Gemini 2.0 Flash**: Free tier available, then usage-based pricing
- Check [Google AI pricing](https://ai.google.dev/pricing) for current rates

## References

- [Google AI Studio](https://aistudio.google.com/)
- [Vercel AI SDK - Google Provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai)
- [Google AI Documentation](https://ai.google.dev/docs)
- [Gemini API Reference](https://ai.google.dev/api)
