---
name: brand-auto-extraction
description: TODO — auto-extract brand context from URLs, company names, LinkedIn profiles instead of manual Brand Vault filling
metadata:
  type: project
---

## Brand Auto-Extraction (TODO)

**Why:** Users shouldn't have to manually fill Brand Vault forms to get brand-relevant output. An agency owner making content for 10 clients can't fill a form for each one. The system should accept URLs, company names, LinkedIn profiles and extract brand context automatically.

**How to apply:** This affects the ENTIRE ThinkForge pipeline, not just ideation:
- Ideation: ideas should be brand-specific from a URL alone
- Script generation: voice/tone should match the brand
- Styling: StylistAgent should check against extracted brand voice

**What exists:**
- `PromptPanel.tsx` already has `extractUrls()`, `onUrlSubmit`, `briefResults` — URL extraction infrastructure
- `fetchContextSources.ts` has BrandDNA retrieval pipeline
- `voice-signature.ts` has fingerprint extraction from text samples

**What needs to be built:**
1. Server-side URL scraper — fetch page content, extract brand signals (About page, tone, key terms, audience)
2. Company name → web search → extract context (could use Gemini with web grounding)
3. LinkedIn profile → extract professional context
4. Auto-populate BrandDNA fields from extracted data (or create ephemeral brand context per session)
5. Wire into ALL agents, not just ideation — the brief results should flow to chat-service, script generation, StylistAgent

**Design decision needed:** Should extracted brand context be:
- A) Saved permanently to BrandDNA (persists across sessions for that brand)
- B) Ephemeral per-session context (used once, not saved)
- C) Both — extract ephemerally, offer to save permanently

**Priority:** P1 — directly impacts first-time experience and agency use case
