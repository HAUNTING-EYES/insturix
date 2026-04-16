# Alyzitron Evolution Goals

## 1. Upgrade YouTube Ingestion with `yt-dlp`
**Goal:** Replace `ytdl-core` with `yt-dlp` for more robust and faster YouTube downloads. Implement a pipeline where downloads are first stored in Google Cloud Storage (GCS) before being processed for analysis.

### Current Implementation:
- **File:** [deepgram.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/lib/alyzitron/transcription/deepgram.ts)
- **Method:** Uses `ytdl-core` (now `@distube/ytdl-core`) to stream audio directly to Deepgram.
- **Workflow:** 
  1. `isYouTubeUrl(url)` checks if it's a YouTube link.
  2. `downloadYouTubeAudio(url)` uses `ytdl(url, { quality: "highestaudio", filter: "audioonly" })`.
  3. The resulting stream is piped directly to `deepgram.listen.prerecorded.transcribeFile`.

### Proposed `yt-dlp` Mental Model (The "Download then Analyze" flow):
Instead of streaming directly from YouTube to Deepgram, we decouple the download from the analysis:
1. **Request:** User provides a YouTube link.
2. **Download (yt-dlp):** Server uses `yt-dlp-exec` to download the best audio/video.
3. **Storage (GCS):** The file is uploaded to Google Cloud Storage (e.g., `gs://insturix-downloads/...`).
4. **Analysis (Alyzitron):** The GCS URL is passed to the analysis engine.
   - **Gemini:** Watches the video directly from GCS via `fileUri`.
   - **Deepgram:** Transcribes from the GCS signed URL instead of the YouTube stream.
**Benefits:** Better reliability (YT-DLP is more stable), persistent files for re-processing, and unified handling for all video sources.

---

## 2. Multi-Source/Multi-Media Compatibility
**Goal:** Expand Alyzitron beyond YouTube videos to handle images, social media posts (Facebook, Instagram, etc.), and direct video uploads.

### Current Implementation:
- **File:** `lib/alyzitron/index.ts` (Entry point)
- **File:** `lib/alyzitron/transcription/deepgram.ts` (Transcriptions)
- **Logic:** Primarily focused on video URLs, specifically optimizing for YouTube via `isYouTubeUrl`.

### Expansion Strategy:
1. **Generic Ingestion Layer:**
   - Detect the content type (Image, Video, Social Post).
   - Use [link-preview/route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/link-preview/route.ts) to scrape metadata and media URLs for Facebook/Instagram/X.
2. **Image Analysis:**
   - **File:** Use Gemini Vision (implemented in [vertexAiService.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/lib/services/vertexAiService.ts)).
   - **Logic:** Send the image buffer or GCS URI to Gemini with a prompt focused on visual understanding instead of video progression.
3. **Social Post Analysis:**
   - Use the text extracted from social posts to feed into the "Context" of the analysis.
   - If a Facebook post has a video, the `yt-dlp` model should handle it, as `yt-dlp` supports hundreds of sites beyond YouTube.

---

## 3. Normal Video Upload Flow (Frontend -> GCS)
**Goal:** Document how manually uploaded videos (not YouTube links) are handled from the UI to the analysis engine.

### 🔄 The Upload & Analysis Flow:

1.  **Request Upload URL (Frontend):**
    - **Action:** User selects a file in the dashboard.
    - **API:** `POST /api/services/alyzitron/gcs/sign`
    - **Logic:** Backend generates a **V4 PUT Signed URL**.
    - **Path:** `user_{userId}/alyzitron-uploads/{timestamp}_{filename}`
    - **File:** [sign/route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/services/alyzitron/gcs/sign/route.ts)

2.  **Direct Upload to GCS (Frontend):**
    - **Action:** UI uses the signed URL to `PUT` the binary file directly to Google Cloud Storage.
    - **Benefit:** Reduces server load as the video doesn't pass through the Next.js backend.

3.  **Trigger Analysis (Frontend):**
    - **API:** `POST /api/services/alyzitron/analyze`
    - **Payload:** `{ video_url: "user_xxx/alyzitron-uploads/...", metadata: { duration: ... } }`
    - **Logic:** 
        - Backend normalizes the path to `gs://{bucket}/{path}`.
        - Deducts credits based on metadata duration.
        - Creates a task and queues it via **QStash**.
    - **File:** [analyze/route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/services/alyzitron/analyze/route.ts)

4.  **Background Processing (Processor):**
    - **API:** `/api/services/alyzitron/processor` (Triggered by QStash)
    - **Logic:** 
        - Picks up the GCS URI.
        - Runs Deepgram transcription (using a temporary signed URL for access).
        - Passes the GCS URI directly to Gemini for visual analysis.
    - **File:** [processor/route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/services/alyzitron/processor/route.ts)

---

## Technical File Map

| Feature | Key Files |
| :--- | :--- |
| **GCS Signed URL Creation** | [sign/route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/services/alyzitron/gcs/sign/route.ts) |
| **Analysis Entry Route** | [analyze/route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/services/alyzitron/analyze/route.ts) |
| **Background Processor** | [processor/route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/services/alyzitron/processor/route.ts) |
| **Transcription Logic** | [deepgram.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/lib/alyzitron/transcription/deepgram.ts) |
| **Gemini AI Service** | [vertexAiService.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/lib/services/vertexAiService.ts) |
| **Social Media Scraper** | [route.ts](file:///home/harsimran-singh/Documents/Insturix/Front-End/app/api/link-preview/route.ts) |
