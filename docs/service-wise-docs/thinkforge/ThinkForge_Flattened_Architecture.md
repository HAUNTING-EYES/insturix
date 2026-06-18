# ThinkForge Flattened Architecture

## 1. Overview
The ThinkForge creative pipeline has been fundamentally refactored to eliminate the high-latency multi-agent chain (Contract → Outline → Author). It now uses a streamlined, high-fidelity, two-path generation architecture. By bypassing intermediate agents, the system drastically reduces API calls (down to 1 or 2 per request) and minimizes context fragmentation while maximizing generative output quality.

## 2. Core Components

### Two-Path Direct Generation
Instead of a single universal sequence, content generation diverges immediately based on intent:

1. **PostWriterAgent:** Specialized for short-form social media content (LinkedIn, Twitter, Facebook, Instagram).
   - Ingests full context (Brand DNA, content bible, project state, multi-hop semantic facts).
   - Evaluates platform characteristics dynamically.
   - Generates the final post and complementary visual parameters in a single API call.

2. **ScriptWriterAgent:** Specialized for long-form video script generation.
   - Uses the identical context foundation but focuses on structural scene-by-scene progression.
   - Merges narration and visual direction seamlessly.
   - Employs deep logic mapping directly to video timeline constraints.

### Context Consolidation (`prompt-utils.ts`)
Common generative setups have been centralized into `prompt-utils.ts`:
- **Role Detection (`inferRoleFromContext`):** Determines the persona the LLM should adopt based on the prompt and doc type.
- **Platform Detection (`detectPlatform`):** Automatically maps general requests to specific social networks and loads appropriate `PLATFORM_CONFIGS`.
- **Content Pathing (`detectContentPath`):** Serves as the fundamental router between the Post and Script pipelines.

## 3. The Output Contract
Both agents adhere to a strict, flattened JSON output contract. This guarantees predictability for downstream systems (UI rendering, evaluation, Clickatron generation):

```json
{
  "content": "The actual narrative or post text in markdown...",
  "contentAnalysis": {
    "tone": "Professional",
    "vibe": "Educational",
    "theme": "AI adoption",
    "qualityScore": 95,
    "violations": []
  },
  "clickatron": {
    "singleImagePrompt": "A highly detailed prompt for generating a hero image...",
    "carouselPrompts": [ "Slide 1...", "Slide 2..." ]
  },
  "metadata": {
    "platform": "linkedin",
    "charCount": 1450
  }
}
```

## 4. Orchestration Flow (`chat-service.ts`)
When a user submits a prompt, `chat-service.ts` routes the request:
1. Validates intent.
2. (Optional) Invokes the `ThinkingAgent` to develop a preliminary approach. *Feature Flag: The ThinkingAgent is currently bypassed for `post` paths to reduce latency.*
3. Marshals full context blocks (Session State, Brand DNA, Semantic Facts).
4. Calls either `PostWriterAgent` or `ScriptWriterAgent`.
5. Emits the result via SSE as a synthesized `ThinkForgeBlock` for immediate frontend rendering.

## 5. Success Metrics
- **Latency:** Decreased from ~15-20 seconds to ~5-8 seconds per generation.
- **Quality:** High-fidelity preservation of Brand DNA across the single generation pass.
- **Resilience:** Reduced API dependency points decrease the risk of timeouts and mid-chain failures.
