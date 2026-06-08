---
name: Search before assuming — TRIBE v2 incident
description: User was furious when I assumed TRIBE v2 was a project doc name instead of searching the web to find it's Meta's Trimodal Brain Encoder model. R10N violation.
type: feedback
originSessionId: 8169aa5e-3ba3-4807-9fea-d5cb2afaac37
---
NEVER assume what a technology/model/tool is. ALWAYS search the web first when the user mentions a model/tech name you're not 100% certain about.

**Why:** User mentioned "TRIBE v2 (meta thing)" THREE times. I assumed it was the project's `TRIBE_HUMAN_INTEGRATION_PLAN.md` document. It's actually Meta's Trimodal Brain Encoder — a foundation model combining V-JEPA 2 + Wav2Vec-BERT + LLaMA 3.2 that predicts human brain responses. I built two separate services instead of one unified TRIBE v2 service. User was rightfully furious.

**How to apply:**
- When user mentions a model/tech name → WebSearch FIRST, read SECOND, code THIRD
- "meta thing" = the user is telling you it's FROM Meta the company. SEARCH FOR IT.
- Don't conflate project document names with external technology names
- R10N (No Assumptions) applies to technology identification, not just code behavior
- If unsure what something is → ASK or SEARCH, never proceed with assumptions
