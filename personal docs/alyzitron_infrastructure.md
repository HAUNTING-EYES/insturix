# Alyzitron: Infrastructure & Media Pipeline

Alyzitron is a high-performance **Omni-Media Analysis Engine** designed to process video, audio, and images. It utilizes a distributed architecture with Upstash QStash, Google Cloud Storage (GCS), Deepgram, and Vertex AI (Gemini).

---

## 1. High-Level Flow (The "Happy Path")

1.  **Ingestion (Frontend)**: User provides a YouTube link or uploads a file.
2.  **API Gateway (`/analyze`)**: Validates the source, checks credits, creates a MongoDB entry, and pushes a task to **Upstash QStash**.
3.  **Background Processing (`/processor`)**:
    *   **Downloader**: If it's a YouTube/Social link, `yt-dlp` downloads it to GCS.
    *   **Transcription**: Deepgram processes the audio from GCS (with speaker diarization).
    *   **Analysis**: Gemini 1.5 Pro/Flash analyzes the media contextually.
4.  **Result Sync**: Results are saved to MongoDB and the frontend polls for completion.

---

## 2. File Responsibilities ("Kaun Kya Kar Raha Hai")

### 📂 `lib/alyzitron/` (The Core Engine)
-   **`index.ts`**: Central export point for all server-side logic.
-   **`dbUtils.ts`**: MongoDB helper functions for handling transcriptions and chat sessions.
-   **`transcription/downloader.ts`**: **THE DOWNLOADER**. This is where `yt-dlp` lives. It handles YouTube, Instagram, and X (Twitter) links.
-   **`transcription/deepgram.ts`**: Handles logic for Deepgram Nova-2. It fetches buffers from GCS and returns structured speaker segments.
-   **`chat/chatEngine.ts`**: The LangChain wrapper for Gemini. Manages the conversation flow.
-   **`chat/contextManager.ts`**: Handles token limits and automatic summarization of long chats.
-   **`chat/systemPrompt.ts`**: Generates the "Brain" of the AI, injecting video analysis + transcript context.

### 📂 `app/api/services/alyzitron/` (The API Layer)
-   **`analyze/route.ts`**: The "Gatekeeper". Handles validation, billing, and queuing via QStash.
-   **`processor/route.ts`**: The "Worker". This is the brain of the pipeline that coordinates `downloader`, `deepgram`, and `vertexAi`.
-   **`utils/gcs.ts`**: Management for Google Cloud Storage (Signed URLs, bucket uploads).
-   **`utils/mongodb.ts`**: Low-level DB connections and collection definitions.

---

## 3. `yt-dlp` Integration Details

`yt-dlp` is used in `lib/alyzitron/transcription/downloader.ts` to ensure we can pull media from almost any platform reliably.

-   **Why `yt-dlp`?**: Replaced `ytdl-core` because it's much more robust and updated frequently to bypass platform changes.
-   **Where is it used?**: In the `ingestMediaToGCS` function.
-   **Logic**:
    *   For **YouTube**: It extracts audio as **MP3** to save processing costs and time.
    *   For **Other Platforms (Insta/X)**: It downloads the full media and identifies if it's a video or image.
    *   **GCS Upload**: After downloading to `/tmp/`, it immediately uploads to GCS and deletes the local file.

---

## 4. Transcription & Chat Pipeline

### Deepgram (Audio Brain)
-   **Model**: `nova-2` (fastest and most accurate).
-   **Features**: `diarize: true` (Multi-speaker detection), `smart_format: true`.
-   **Output**: Structured segments like `[00:15] Speaker 1: "Hello world"`.

### Gemini (Analysis Brain)
-   **Model**: `gemini-1.5-flash` or `gemini-1.5-pro`.
-   **Context**: It receives both the raw video signals (multimodal) and the structured Gemini transcript to provide extremely accurate answers.

---

## 5. Technical Stack Summary

| Component | Technology |
| :--- | :--- |
| **Queue** | Upstash QStash (Serverless Queue) |
| **Storage** | Google Cloud Storage (GCS) |
| **DB** | MongoDB (Analysis, Transcripts, Chat) |
| **Downloader** | `yt-dlp` via `yt-dlp-exec` |
| **Transcription** | Deepgram SDK |
| **AI Analysis** | Google Vertex AI (Gemini 1.5) |
| **LLM Framework**| LangChain |
