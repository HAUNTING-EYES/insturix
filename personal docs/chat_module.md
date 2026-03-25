# Alyzitron Chat Module Documentation

Broadly, the Alyzitron Chat Module provides an interactive AI interface for users to query and explore video content. It leverages a combination of Deepgram for transcription and Google Gemini for intelligent analysis.

---

## 🛠 Tech Stack

### Frontend
- **Framework:** Next.js (App Router), React
- **Styling:** Tailwind CSS
- **Icons:** `lucide-react`
- **UI Components:** Radix UI (`ScrollArea`, `Separator`, `Tooltip`)
- **State Management:** React `useState`, `useEffect`, `useRef`, and `useCallback`
- **Communication:** Fetch API with Server-Sent Events (SSE) for streaming responses

### Backend
- **Framework:** Next.js API Routes
- **Database:** MongoDB (storing chat sessions and transcription results)
- **LLM Orchestration:** LangChain
- **AI Models:** 
  - **Gemini 2.5 Flash** (via `@langchain/google-genai`) for chat turns and summarization.
  - **Deepgram Nova-2** for high-accuracy, low-latency transcription.

### Audio & Utilities
- **Transcription:** Deepgram SDK
- **YouTube Extraction:** `@distube/ytdl-core`
- **Cloud Storage:** Google Cloud Storage (GCS) with Signed URLs for private file access

---

## 🏗 Component Architecture (Frontend)

### `ChatPanel.tsx`
The primary UI container for the chat interface. It handles the lifecycle of a chat session.
- **`initSession()`**: Triggered when the panel opens. Calls `/api/services/alyzitron/chat-session` to find/create a session and retrieve history. It also receives the initial transcription status.
- **`pollTranscriptionStatus()`**: If transcription is `processing`, it polls `/api/services/alyzitron/transcribe` every 4 seconds until the status changes to `completed` or `error`.
- **`sendMessage(text)`**: Sends a user message to `/api/services/alyzitron/chat`. It handles the SSE stream, updating the message list in real-time as chunks arrive.
- **`stopStreaming()`**: Aborts the current Gemini request using an `AbortController`.
- **`clearChat()`**: Deletes the session history from the database and resets the local UI state.

### Sub-components
- **`ChatMessage.tsx`**: Renders individual user and assistant messages with appropriate styling.
- **`TypingIndicator.tsx`**: Shows a pulsing animation when the assistant is "thinking" or starting to stream.
- **`SuggestedPrompts.tsx`**: Displays clickable prompt cards (e.g., "What are the key moments?") when the chat is empty.
- **`TranscriptionBar`**: A status bar at the top of the chat area showing transcription progress, word count, detected language, and confidence.

---

## 🧠 Backend Logic & Engine

### `chatEngine.ts`
The core logic for processing a single "turn" in the conversation.
- **`runChatTurnStreaming()`**: 
  1. Checks if the conversation history needs summarization.
  2. Builds a comprehensive **System Prompt** including video analysis and the full transcript.
  3. Constructs a **Conversation Window** (Current Summary + Recent Messages).
  4. Calls Gemini with the assembled context and the new user message.
  5. Yields text chunks as they are generated.

### `contextManager.ts`
Manages the "Sliding Window" context to stay within Gemini's token limits efficiently.
- **Budgeting:** Sets a safe conversation window of ~8,000 tokens.
- **`needsSummarization()`**: Checks if the unsummarized message history exceeds 50% of the budget.
- **`summarizeMessages()`**: Uses Gemini to compress older messages into a dense "Rolling Summary." This summary preserves key facts, user interests, and technical data points like timestamps.
- **`buildConversationWindow()`**: Injects the rolling summary as a special "Context" block before the most recent verbatim messages.

### `systemPrompt.ts`
Dynamically constructs the persona and knowledge base for the AI.
- **Persona:** "Intelligent video analysis assistant for Alyzitron."
- **Knowledge Injection:** Merges the video title, AI analysis results (summary, topics, key moments, sentiment), and the speaker-labeled transcript into a structured prompt.
- **Strict Guidelines:** Instructs the model to cite evidence, use timestamps, and strictly avoid hallucinations.

---

## 🎙 Transcription Workflow

Transcription is designed to be asynchronous and robust, supporting various video sources.

### 1. Triggering
When a chat session is initialized (`/api/services/alyzitron/chat-session`), the system checks if a transcript already exists for the `taskId`. If not, it triggers `triggerTranscription` in the background.

### 2. URL Resolution
- **YouTube:** The URL is passed directly.
- **GCS (gs://):** The system generates a transient **Signed URL** so Deepgram can securely access the private file.

### 3. Processing (`deepgram.ts`)
- **YouTube Path:** Uses `@distube/ytdl-core` to download the `highestaudio` stream and pipes it directly to Deepgram's `transcribeFile`.
- **Direct URL Path:** Uses Deepgram's `transcribeUrl` for efficiency.
- **Features Enabled:**
  - **Nova-2 Model:** Optimized for speed and accuracy.
  - **Diarization (`diarize: true`):** Identifies different speakers (Speaker 0, Speaker 1, etc.).
  - **Language Detection:** Auto-detects the spoken language.
  - **Smart Format:** Handles punctuation and numerals for better readability.

### 4. Output Parsing
The raw Deepgram JSON is transformed into a `TranscriptionResult`:
- **Plain Text:** The full continuous transcript.
- **Speaker Segments:** An array of objects containing speaker labels, start/end times (ms), and text.
- **Formatted Transcript:** A specially formatted string for the LLM: `[MM:SS] Speaker X: <text>`. This allows the AI to accurately reference who said what and when.

---

## 💾 Data Persistence (`dbUtils.ts` & Models)
- **`ChatSession`**: Stores `taskId`, `userId`, `messages[]`, `summary` (string), and `summarizedUpToIndex` (to track what's already compressed).
- **`Transcription`**: Stores the full result, status (`processing`, `completed`, `error`), and metadata (word count, duration, detected language).

---
