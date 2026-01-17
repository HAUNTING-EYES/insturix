# Editron AI Chat Agent: High-Level Architecture & Working

The Editron AI Chat Agent is a specialized, state-of-the-art video editing assistant integrated directly into the Editron editor. It allows users to perform complex editing tasks using natural language, leveraging the latest generative AI models and a robust tool-calling framework.

## 1. Core Architecture

The agent is built on a **LangGraph-based** orchestration layer, which provides a structured way to handle conversation flow, tool execution, and state management.

### Custom Adaptation (No LangChain Model Wrapper)
A key architectural decision was to **avoid the standard LangChain `ChatGoogleGenerativeAI` wrapper**. 
- **The Issue**: Intermittent parsing errors in the LangChain-Gemini bridge prevented reliable tool-calling responses.
- **The Solution**: The agent uses the **direct `@google/generative-ai` SDK** for all model invocations.
- **Implementation**: We manually convert LangChain message types (`HumanMessage`, `AIMessage`, etc.) to Gemini's format and programmatically translate Zod schemas into Gemini-compatible function declarations. This ensures 100% reliability and low-latency streaming.

## 2. Intelligence & Model
- **Primary Model**: `gemini-2.0-flash` (optimized for speed and long-context reasoning).
- **Sub-Agents**: Specific tools like `generate_html_scene` use dedicated sub-agent calls with higher temperature settings for increased creativity.

## 3. Tool System & User Experience

The agent interacts with the editor through a suite of specialized tools. Each tool is designed with high transparency and user feedback in mind.

### Smart Tool Classification
Tools are classified into two categories for optimized UX:
1.  **Quick Tools**: Instant operations (e.g., `update_overlay`, `delete_overlay`, `read_project_file`). These use a minimal "pill" UI.
2.  **Generative Tools**: Long-running, creative tasks (e.g., `generate_html_scene`, `generate_html_sticker`). These use an expanded UI with **rotating "fun" messages** (e.g., "Painting with code...", "Adding sparkle...") to maintain user engagement during processing.

### Custom Tracks & Generative Panels
Unlike standard overlays, generative elements (Scenes and Stickers) are treated as **Custom Tracks**.
- **`generate_html_scene`**: Creates full-screen, animated CSS/JS backgrounds, diagrams, or title cards.
- **`generate_html_sticker`**: Creates interactive, animated elements (emojis, badges) with transparent backgrounds.
- **Editing Panels**: For these custom types, dedicated UI panels (`html-scene-panel.tsx`, `stickers-panel.tsx`) were created, allowing users to tweak generated properties after the AI has finished its work.

## 4. Timeline & Physics Engine
To prevent "robotic" placement (where everything overlaps at 0,0), the AI agent uses a **Physics Engine** for smart layout:
- **Auto-Placement**: If the AI doesn't specify a row, the engine automatically finds the best available track.
- **Layering Logic**: Videos and audio are packed at the bottom, while text, stickers, and scenes are stacked on top to ensure visibility.

## 5. Context Awareness & Performance
- **Smart Summarization**: Before every interaction, a dedicated utility (`project-summary.ts`) generates a concise summary of the current project state (overlays, timing, assets) and injects it into the system prompt. This ensures the AI "sees" the project accurately.
- **Batch Parallel Execution**: The agent is capable of triggering multiple tool calls (e.g., creating a scene, adding text, and placing a sticker) in a single turn, significantly improving the speed of complex requests.

## 6. Security & Safety

Safety is baked into the agent at multiple levels:
- **System Prompt Hardening**: Strict instructions to prevent prompt injection and keep the agent focused only on video editing.
- **Message Normalization**: Automatic cleaning of malformed model responses (e.g., converting array-based tool calls to valid JSON strings).
- **Privacy**: The agent is programmed never to reveal internal IDs or raw system prompts to the user.

## 7. Infrastructure: Rate Limiting via KV

To ensure service stability and prevent abuse, the agent implements a robust rate-limiting system:
- **Provider**: Vercel KV / Upstash Redis.
- **Algorithm**: Sliding window rate limit.
- **Policy**: Currently set to **20 requests per minute** per user. 
- **UX**: When a user hits the limit, the API returns a meaningful 429 error, which the frontend displays as a helpful prompt to "wait a moment."

## 8. Development Workflow for New Tools
Every new tool added to the agent must follow these requirements:
- **Zod Schema**: Precise input validation.
- **User-Friendly Mapping**: A corresponding entry in the `TOOL_NAMES` and `TOOL_ICONS` registry in the UI.
- **Sanitized Output**: Tools that generate large amounts of code (like HTML scenes) return a sanitized summary to the main agent's history to avoid bloating the context window.
