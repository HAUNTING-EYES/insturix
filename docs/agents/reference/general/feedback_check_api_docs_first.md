---
name: feedback-check-api-docs-first
description: Always check external API documentation before hypothesizing about infrastructure issues
metadata: 
  node_type: memory
  type: feedback
  originSessionId: efd5f40f-7931-48e9-956e-3bdb04ba2ba8
---

Check external API documentation BEFORE guessing about infrastructure (CDN headers, presigned URLs, caching).

**Why:** Grok STT fix took 3 attempts because I assumed the problem was CDN Content-Type headers. First fix (presigned R2 URL) — wrong. Second fix (correct idea, wrong import path) — careless. Third fix (file upload per xAI docs) — correct. If I had searched xAI's docs first, I would have seen that `file` is the official parameter and `url` was undocumented. One attempt instead of three.

**How to apply:** When an external API returns an error:
1. Search/read the API's official documentation FIRST
2. Check their release notes for recent changes
3. THEN form a hypothesis based on what the docs say
4. Do NOT guess about infrastructure (headers, caching, proxies) before reading the docs
