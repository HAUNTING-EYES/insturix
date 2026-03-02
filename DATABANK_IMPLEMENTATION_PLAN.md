# Implementation Plan: ThinkForge Databank (Triple-Tier Memory)

This plan outlines the steps to transform the current session-based storage into the **Triple-Tier Memory** architecture defined in the design guide.

---

## Phase 1: Infrastructure & Schema Unification
Fundamental changes to how data is modeled and where it is stored.

### [Component Name] Backend Service Layer / Database
#### [MODIFY] [db.ts](file:///d:/insturix/prod/Front-End/lib/thinkforge/services/db.ts)
- **Unify Artifacts:** Update `DataBankSchema` to a generic `ArtifactSchema` that can handle `Source`, `Generated`, and `Working` types.
- **Brand DNA:** Update `ProjectSchema` to include a structured `brandDNA` field:
  ```typescript
  brandDNA: {
    tone: string[];
    audience: string;
    forbiddenWords: string[];
    styleGuide?: string;
  }
  ```
- **Vector Integration:** Add hooks for a Vector Store (e.g., Pinecone/MongoDB Atlas Vector Search) to implement the **Semantic Layer**.
- **Double-Write logic:** Ensure every artifact write triggers an embedding generation and vector store update.

---

## Phase 2: Ingestion & "The Refinery"
Adding intelligence to the data entry process.

### [Component Name] Ingestion Pipeline
#### [NEW] [refinery-agent.ts](file:///d:/insturix/prod/Front-End/lib/thinkforge/agents/refinery-agent.ts)
- Create a specialized agent to:
  1. **Scrape:** Enhance URL extraction to include visual metadata.
  2. **Chunk:** Break content into "Atomic Ideas".
  3. **Tag:** Auto-assign entities (Product, Benefit, Competitor).
#### [MODIFY] [ChatPanel.tsx](file:///d:/insturix/prod/Front-End/components/dashboard/ThinkForge/ChatPanel.tsx)
- Route raw ingestion through the new Refinery Agent instead of direct database saves.

---

## Phase 3: Retrieval & Context Injection
Turning stored data into actionable AI context.

### [Component Name] Context Assembly
#### [MODIFY] [assembleContext.ts](file:///d:/insturix/prod/Front-End/lib/thinkforge/context/assembleContext.ts)
- **Hybrid Search:** Implement logic to query both MongoDB (Keyword) and the Vector Store (Semantic).
- **Vault Access:** Allow cross-session retrieval if requested by the user.
- **Sidecar Push:** Add an event-stream type for "Suggested Context" to populate the UI side panels automatically.

---

## Phase 4: Relational Layer & "Time Machine"
Mapping the connections and history of the project.

### [Component Name] Event Log & Versioning
#### [MODIFY] [event-log.ts](file:///d:/insturix/prod/Front-End/lib/thinkforge/services/event-log.ts)
- Update logging to distinguish between user actions and **AI Internal Reasoning** (Thoughts).
- Implement the **Time Machine** logic to reconstruct the editor state at any point in the interaction log.
- **Graph Mapping:** Add a `relationships` collection to track links like `InspiredBy` or `RefinedFrom`.

---

## Verification Plan

### Automated Tests
1. **Schema Validation:** Run `pnpm test` (or equivalent) to ensure new `BrandDNA` and `Artifact` schemas don't break existing session loading.
2. **Refinery Unit Test:** Create a mock URL brief and verify that the `refinery-agent` correctly chunks it into at least 3 atomic ideas.
3. **Vector Search Check:** Perform a semantic query (e.g., searching for "high-end tech" when the brief is about "premium circuitry") and verify the correct artifact is returned.

### Manual Verification
1. **The "Starvis" Test:** Paste a link to a Sony Starvis sensor product. Verify that during script writing, a list of "Technical Specs" automatically appears in the Sidecar or Chat side-panel.
2. **Vault Search:** Create a note in "Project A," switch to "Project B," and ask the AI: "What did I find in the other project about X?". Verify the AI can retrieve the data.
