# ThinkForge Simple Flow: Script/Post To Final Document

Date: 2026-06-17

Purpose: document the new ThinkForge direction clearly, without mixing it with the older multi-agent pipeline. The desired core flow is simple:

```text
IdeationAgent -> user selects/starts brief -> direct PostWriterAgent OR ScriptWriterAgent -> ThinkForge document
```

The old ContractAgent -> OutlineAgent -> AuthorAgent chain still exists in code for legacy/fallback/blueprint paths, but it should not be treated as the north-star ThinkForge generation flow.

## 1. Product Flow

```mermaid
flowchart TD
  A[User prompt or project brief] --> B{Need ideas?}
  B -->|yes| C[IdeasAgent]
  C --> D[4 idea cards]
  D --> E[User selects idea / creates session]
  B -->|no| E
  E --> F[POST /api/services/thinkforge/session]
  F --> G[ThinkForge session + optional script-stage Editron project]
  G --> H[POST /api/services/thinkforge/chat]
  H --> I[processChat]
  I --> J[Load session, script, chat history, BrandDNA, DataBank facts]
  J --> K[classifyIntent / draft, edit, research, chat]
  K -->|draft| L{detectContentPath}
  L -->|post| M[PostWriterAgent]
  L -->|script| N[ScriptWriterAgent]
  M --> O[Flat writer JSON]
  N --> O
  O --> P[content -> Markdown parser -> ThinkForgeBlock[]]
  P --> Q[ThinkForgeBlock[] -> Tiptap richText JSON]
  Q --> R[applyCommand ReplaceDocument]
  R --> S[Mongo Script document]
  S --> T[SSE script_update]
  T --> U[ScriptEditor renders final document]
```

## 2. Core File Map

### UI Entry Points

| Surface | File | Role |
|---|---|---|
| Main ThinkForge workspace | `components/dashboard/ThinkForge/StoryboardingMode.tsx` | Hosts scripting/storyboarding experience. |
| Chat shell | `components/dashboard/ThinkForge/ChatPanel.tsx` | Sends prompts to chat endpoint and consumes SSE. |
| Rich document editor | `components/dashboard/ThinkForge/ScriptEditor.tsx` | Renders Tiptap document, converts to/from ThinkForge blocks at boundaries, saves edits. |
| Idea UI | `components/dashboard/ThinkForge/IdeationMode.tsx`, `IdeaGrid.tsx`, `IdeaSelection.tsx` | Shows generated idea cards and selected idea flow. |
| Document list/tabs | `DocumentTabs.tsx`, `ScriptHistoryPanel.tsx`, `LibraryPanel.tsx` | Lets user switch saved documents/scripts. |
| Export UI | `components/dashboard/ThinkForge/export/*` | Clickatron/Editron handoff surfaces. |

### API Routes

| Route | File | Role |
|---|---|---|
| Create/load session | `app/api/services/thinkforge/session/route.ts` | Creates/loads session, loads script/chat/preferences, creates a lightweight script-stage Editron project for new sessions. |
| Generate ideas | `app/api/services/thinkforge/ideas/route.ts` | Calls `IdeasAgent`, returns 4 idea cards. |
| Chat/generate/edit | `app/api/services/thinkforge/chat/route.ts` | Auth, credits, request parsing, then streams `processChat()`. |
| Save document | `app/api/services/thinkforge/script/save/route.ts` | Saves `content`, `blocks`, and `richText` through command service. |
| Read current script | `app/api/services/thinkforge/script/current/route.ts` | Returns active/current script. |
| Read specific script | `app/api/services/thinkforge/script/get/route.ts` | Returns one script by `scriptId`. |
| Blocks API | `app/api/services/thinkforge/script/blocks/route.ts` | Reads/saves block-oriented document state. |
| Edit selected blocks | `app/api/services/thinkforge/script/edit-blocks/route.ts` | AI-assisted block edit path. |
| Export to Editron | `app/api/services/thinkforge/script/export-for-editron/route.ts` | Converts ThinkForge blocks/plain text/CIR into Editron scenes. |
| Clickatron context | `app/api/services/thinkforge/clickatron-context/route.ts` | Builds Clickatron handoff context from saved script metadata/blocks. |

### Backend Services And Agents

| File | Role |
|---|---|
| `lib/thinkforge/services/chat-service.ts` | Main orchestrator. Loads state/context, classifies intent, routes draft generation to direct writer agents, streams SSE, saves result. |
| `lib/thinkforge/agents/ideas-agent.ts` | Single ideation agent. Produces exactly 4 structured ideas. |
| `lib/thinkforge/agents/post-writer-agent.ts` | Direct post/social/article writer. Produces final text plus Clickatron visual prompts. |
| `lib/thinkforge/agents/script-writer-agent.ts` | Direct video/script writer. Produces final script plus scene visual metadata. |
| `lib/thinkforge/agents/prompt-utils.ts` | Detects role/platform/content path. Key router: `detectContentPath()`. |
| `lib/thinkforge/context/fetchContextSources.ts` | Pulls BrandDNA, project facts, global facts, and interaction patterns. |
| `lib/thinkforge/context/assembleContext.ts` | Builds compact context for agents. |
| `lib/thinkforge/services/command-service.ts` | Applies `ReplaceDocument`, `UpdateBlock`, `InsertBlock`, `DeleteBlock`. |
| `lib/thinkforge/services/db.ts` | Mongo persistence for sessions, scripts, chat, preferences, BrandDNA/DataBank. |
| `lib/thinkforge/normalization/markdown-parser.ts` | Converts markdown output into `ThinkForgeBlock[]`. |
| `lib/thinkforge/mappers/thinkforge-to-tiptap.ts` | Converts `ThinkForgeBlock[]` to Tiptap JSON for editor rendering. |
| `lib/thinkforge/mappers/tiptap-to-thinkforge.ts` | Converts editor state back to `ThinkForgeBlock[]` for save/export. |
| `lib/thinkforge/agents/script-refinement-agent.ts` | Selection/block-level edit agent. Used for edits, not first draft generation. |

## 3. Simple Generation Sequence

### Step 1: Optional Ideation

Endpoint:

```text
POST /api/services/thinkforge/ideas
```

Implementation:

```text
app/api/services/thinkforge/ideas/route.ts
  -> fetchContextSources()
  -> formatSystemBrief()
  -> createIdeasAgent()
  -> IdeasAgent.generateIdeas()
```

Output schema:

```ts
type IdeasResponse = {
  ideas: Array<{
    id: string;
    idea: string;      // max 120 chars in zod
    purpose: string;
    style: string;
    format: string;
    platform: string;
    tone: 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue';
  }>; // exactly 4
};
```

Important behavior:

- The agent prompt is creative.
- Code enforces platform alignment after generation.
- If a prompt says LinkedIn/blog/newsletter/post, text platforms win.
- If a prompt says video/reel/TikTok/YouTube, video platforms win.
- If both match, post intent wins for cases like "post for a video editing tool".

### Step 2: Session Creation

Endpoint:

```text
POST /api/services/thinkforge/session
```

Implementation:

```text
session/route.ts
  -> db.getOrCreateSession()
  -> optionally projectService.createScriptStageProject()
  -> db.getScript()
  -> db.getChatHistory()
  -> db.getUserPreferences()
```

Session response shape:

```ts
type SessionResponse = {
  sessionId: string;
  userId: string;
  orgId?: string;
  createdByName?: string;
  projectMeta: Record<string, unknown>;
  preferences: unknown;
  script: null | {
    title: string;
    content: string;
    blocks: ThinkForgeBlock[];
  };
  activeGeneration: GenerationState | null;
  chat: Array<{
    role: 'user' | 'assistant';
    content: string;
    createdAt: string | Date;
  }>;
};
```

### Step 3: Chat/Draft Request

Endpoint:

```text
POST /api/services/thinkforge/chat
```

Route responsibilities:

```text
chat/route.ts
  -> Clerk auth
  -> parse prompt/session/script/project/selection/generationId/threadId
  -> require sessionId
  -> migrate/check/deduct credits
  -> processChat()
  -> return text/event-stream
```

`processChat()` responsibilities:

```text
processChat(request)
  -> load session
  -> load current script
  -> validate existing ThinkForgeBlock[]
  -> load chat history, preferences, retrieved context in parallel
  -> build systemBrief from BrandDNA/DataBank/interactions
  -> classify intent
  -> if draft: create or reuse scriptId
  -> detectContentPath(prompt, session.metadata.format)
  -> run PostWriterAgent or ScriptWriterAgent
  -> parse content into ThinkForgeBlock[]
  -> convert blocks into Tiptap richText JSON
  -> applyCommand(ReplaceDocument)
  -> emit script_update
  -> emit done
```

### Step 4: Path Router

Current router:

```ts
detectContentPath(userPrompt, docType): 'post' | 'script'
```

Post path triggers when:

- `docType` is `post` or `article`
- prompt mentions LinkedIn post, Twitter/X post, Instagram caption, Facebook post, social media post, blog post, article, newsletter, email campaign/copy, carousel post

Everything else defaults to:

```text
script
```

### Step 5A: Post Writer Path

Agent:

```text
lib/thinkforge/agents/post-writer-agent.ts
```

Input:

```ts
type PostWriterInput = AgentInput & {
  contentSignalProfile?: ThinkForgeContentSignalProfile;
};
```

Prompt context includes:

- project summary
- raw user prompt
- BrandDNA/system brief
- project DataBank facts
- global DataBank facts
- platform rules from `PLATFORM_CONFIGS`

Output schema:

```ts
type PostWriterResult = {
  content: string;
  contentAnalysis: {
    tone: string;
    vibe: string;
    theme: string;
    qualityScore: number; // 0-100
    violations: string[];
  };
  clickatron: {
    singleImagePrompt?: string;
    carouselPrompts?: string[];
  };
  metadata: {
    platform: string;
    charCount: number;
  };
};
```

Downstream transformation:

```text
PostWriterResult.content
  -> parseMarkdownToBlocks()
  -> validateThinkForgeBlocks()
  -> thinkForgeBlocksToTiptapJSON()
  -> ReplaceDocument save
```

Default title:

```text
`${platform} Post`
```

### Step 5B: Script Writer Path

Agent:

```text
lib/thinkforge/agents/script-writer-agent.ts
```

Input:

```ts
type ScriptWriterInput = AgentInput & {
  contentSignalProfile?: ThinkForgeContentSignalProfile;
};
```

Prompt context includes:

- project summary
- raw user prompt
- BrandDNA/system brief
- project DataBank facts
- global DataBank facts
- script writing rules

Output schema:

```ts
type ScriptWriterResult = {
  content: string; // markdown script with scenes
  contentAnalysis: {
    hooks: string[];
    theme: string;
    emphasisPoints: string[];
    qualityScore: number; // 0-100
  };
  visualMetadata: {
    motionInfo: string;
    scenePrompts: string[];
  };
  metadata: {
    estimatedTimeSeconds: number;
    platform: string;
  };
};
```

Downstream transformation:

```text
ScriptWriterResult.content
  -> parseMarkdownToBlocks()
  -> validateThinkForgeBlocks()
  -> thinkForgeBlocksToTiptapJSON()
  -> ReplaceDocument save
```

Default title:

```text
Video Script
```

## 4. Final Document Schema

The final saved unit is a `Script` document in `lib/thinkforge/services/db.ts`. The name is historical; it now stores scripts, posts, articles, and other ThinkForge documents.

```ts
type Script = {
  _id: string;
  sessionId: string;
  scriptId?: string;
  title: string;
  content: string;
  blocks?: ThinkForgeBlock[];
  richText?: Record<string, any>; // Tiptap JSON AST
  metadata?: Record<string, any>;
  version?: number;
  documentType?: string;
  parentScriptId?: string;
  forkReason?: string;
  createdFromIntent?: string;
  createdAt: Date;
  updatedAt: Date;
};
```

`ThinkForgeBlock` schema:

```ts
type ThinkForgeBlockKind =
  | 'header'
  | 'action'
  | 'why'
  | 'example'
  | 'paragraph'
  | 'scene'
  | 'editorial';

type ThinkForgeBlock = {
  id: string;
  kind: ThinkForgeBlockKind;
  content: RichTextAST;
  blockHash?: string;
  meta?: {
    role?: string;
    goal?: string;
    level?: number;
  };
  exportMeta?: ThinkForgeBlockExportMeta;
  scene?: {
    visualDescription: string;
    subjects: Array<{
      name: string;
      category: 'person' | 'product' | 'location' | 'object' | 'brand' | 'other';
    }>;
    duration?: number;
    durationExplicit?: boolean;
    mood?: string;
    onScreenText?: string[];
    sfxDescription?: string;
    musicDescription?: string;
  };
  editorial?: {
    editorialType:
      | 'emotional_target'
      | 'instrumentation'
      | 'production_note'
      | 'style_guide'
      | 'color_palette'
      | 'pacing_note'
      | 'custom';
  };
};
```

Rich text schema:

```ts
type RichTextNode =
  | {
      type: 'text';
      text: string;
      styles?: Record<string, boolean>;
    }
  | {
      type: 'link';
      href: string;
      content: RichTextNode[];
    };

type RichTextAST = RichTextNode[];
```

## 5. SSE Events Used By Chat

The chat endpoint returns `text/event-stream`.

Important event types:

| Event | Payload | Purpose |
|---|---|---|
| `intent` | `{ intent, confidence, scope }` | Tells UI whether the request is draft/edit/research/chat. |
| `token` | `{ content }` | Chat text/progress copy. |
| `thinking` | `{ content }` | Optional reasoning bullets. Currently skipped for post path to reduce latency. |
| `progress` | `{ progress, message }` | Generation progress bar/status. |
| `script_created` | `{ scriptId, title, documentType }` | New document tab/script created. |
| `script_update` | `{ script, metadata }` | Main document update consumed by editor. |
| `error` | `{ error, ... }` | Recoverable stream error. |
| `done` | `{ sessionId }` | Stream completion. |

`script_update.script` shape:

```ts
type ScriptUpdatePayload = {
  script: {
    title: string;
    blocks: ThinkForgeBlock[];
    richText: TiptapJSON;
    content: string;
    version?: number;
    metadata?: Record<string, unknown>;
  };
  metadata: {
    workflow: 'create' | 'refine' | string;
    thoughts?: string;
    duration_ms?: number;
    agent_steps?: unknown[];
    selectionEdit?: {
      editedBlocks: ThinkForgeBlock[];
      originalRange: { from: number; to: number };
      applySurgically: boolean;
    };
  };
};
```

## 6. Edit Flow

The edit flow is separate from first-draft generation.

```text
User selects text/blocks
  -> ChatPanel sends selectionBlocks/selectionBlockIds/selectionRange
  -> processChat classifies edit/hybrid
  -> ScriptRefinementAgent
  -> block patches OR surgical selection replacement
  -> applyCommand ReplaceDocument when full block merge is used
  -> script_update
```

Key files:

- `lib/thinkforge/agents/script-refinement-agent.ts`
- `lib/thinkforge/utils/selection-editing.ts`
- `lib/thinkforge/utils/thinkforge-block-patch.ts`
- `components/dashboard/ThinkForge/ScriptEditor.tsx`

## 7. Export/Handoff Flow

### Clickatron

PostWriter and ScriptWriter now return structured visual metadata (e.g., `singleImagePrompt`, `carouselPrompts`, `scenePrompts`), which is persisted directly into `script.metadata.writerOutput`.

The Clickatron context builder now prioritizes this data:
1. `script.metadata.writerOutput.visualPrompts` (Primary source of truth from flattened architecture)
2. `block.exportMeta.clickatron` (Legacy hidden sidecar compatibility)
3. Visible-content fallback generation (If no prompts exist)

Key files:

- `lib/thinkforge/utils/clickatron-creative-sidecar.ts`
- `lib/thinkforge/schemas/clickatron-creative-contract.ts`
- `lib/thinkforge/clickatron-context.ts` (Handles fallback logic and extraction)
- `app/api/services/thinkforge/clickatron-context/route.ts`
- `components/dashboard/ThinkForge/export/ClickatronHandoffDialog.tsx`
- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`

### Editron

Script export route:

```text
POST /api/services/thinkforge/script/export-for-editron
```

Inputs accepted:

- `blocks: ThinkForgeBlock[]`
- `plainText: string`
- `cir: CIRDocument`

Key file:

```text
app/api/services/thinkforge/script/export-for-editron/route.ts
```

## 8. Legacy Multi-Agent Conflict

These files still exist and are real code, but they are not the desired simple first-draft path:

| Legacy file | Old role |
|---|---|
| `lib/thinkforge/agents/script-draft-agent.ts` | Orchestrates Contract -> Outline -> Author -> quality/stylist repair. |
| `lib/thinkforge/agents/script-contract-agent.ts` | Produces narrative contract. |
| `lib/thinkforge/agents/script-outline-agent.ts` | Produces outline. |
| `lib/thinkforge/agents/script-author-agent.ts` | Streams markdown full draft. |
| `lib/thinkforge/agents/stylist-agent.ts` | Voice quality audit/rewrite. |

Where legacy is still used today:

- Blueprint initialization in `chat-service.ts` still calls `generateScriptDraft()` for each artifact.
- `app/api/services/thinkforge/script/edit/route.ts` calls `generateScriptDraft()` for older script edit/regenerate behavior.
- Tests and older docs may still reference Contract/Outline/Author as the main pipeline.

Doc rule going forward:

```text
For normal user draft generation, document the simple direct writer path.
For blueprint/legacy routes, explicitly label them as legacy or transitional.
```

## 9. Current Gaps To Close

1. `signalTrace` is declared in `chat-service.ts` direct writer generation but is not currently built from the direct writer result.
2. Direct writer visual metadata is logged/returned by the agent but not fully persisted into `script.metadata`.
3. `documentType` for newly created direct writer docs is still rough (`screenplay` in `script_created`, generic titles like `Video Script`).
4. The post/script writer agents accept `contentSignalProfile`, but the direct path does not yet resolve and pass it.
5. Blueprint flow still uses the old multi-agent chain.
6. Existing docs conflict: `pipeline-overview.md` describes the old chain, while `ThinkForge_Flattened_Architecture.md` describes the new direction.

## 10. Recommended Source Of Truth

Use this document for the simplified script/post flow.

Use `pipeline-overview.md` only as legacy history until it is rewritten or renamed.

Use `ThinkForge_Flattened_Architecture.md` as the high-level direction, but this file is the more detailed file map and schema reference.
