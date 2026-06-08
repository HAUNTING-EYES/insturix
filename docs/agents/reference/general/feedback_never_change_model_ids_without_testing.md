---
name: NEVER change model IDs without testing against the actual API
description: Changed gemini-3.1-pro-preview to gemini-3.1-pro. Model doesn't exist. Broke transcript editor in production. 404 on every Gemini call. Cut quality regressed from 42 segments to 89.
type: feedback
originSessionId: 92c054be-754b-4e43-898b-9ece05419afc
---
# RULE: NEVER change a model ID without verifying it exists on the actual API

## What happened (2026-05-15)
Changed `gemini-3.1-pro-preview` → `gemini-3.1-pro` and `gemini-3.1-flash-lite-preview` → `gemini-3.1-flash` across 8 files. Pushed to production.

Result: EVERY Gemini call returned 404 "models/gemini-3.1-pro is not found for API version v1beta". Transcript editor failed silently, fell back to fragment-pipeline. Cut quality went from 42 segments / 9.5 min to 89 segments / 13 min. Editorial intent detector also failed — treated everything as CONTENT.

## The code LITERALLY said not to do this
editron-config.ts line 454: "Verified against Google AI API docs: name is 'gemini-3.1-flash-lite-preview' (NOT 'gemini-3.1-flash')."

I read this line. I ignored it. I assumed the user's shorthand "3.1 flash" meant the exact model ID `gemini-3.1-flash`. It doesn't. The `-preview` suffix is required.

## Rules for model ID changes
1. NEVER change a model ID string without testing it: `genAI.getGenerativeModel({ model: 'new-model' }).generateContent('test')` 
2. If the test returns 404 or "not found" → the model ID is WRONG
3. If you can't test locally (API key issues) → DO NOT deploy the change
4. Read existing comments about model ID format — they exist because someone already verified
5. The `-preview` suffix on 3.1 models is NOT optional. Google has NOT released GA versions without it.
6. When the user says "use 3.1 flash" they mean the MODEL FAMILY, not the exact ID string. ASK for the exact string or verify it yourself.
