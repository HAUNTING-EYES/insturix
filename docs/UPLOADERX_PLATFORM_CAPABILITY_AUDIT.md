# UploaderX Platform Capability Audit

Date: 2026-06-15
Worktree: `main` (`Front-End-main`)
Scope: Phase 5 status refresh after UploaderX scheduling, test restoration, and type-baseline cleanup.

## Status Legend

- **Verified by official docs**: Confirmed against primary platform documentation during this audit.
- **Observed in code**: Confirmed in the current UploaderX implementation.
- **Needs Meta verification**: Meta docs were not reliably accessible from this session; verify from a logged-in Meta developer account before implementation.
- **UI-only / not wired**: A control exists in UI or docs, but the publish path does not pass or honor it.
- **Blocked by capability map**: Control exists but is intentionally disabled until route/API support exists.

## Terms

- **Upload hook**: `hooks/useUploaderXUpload.ts`. This is the client-side bridge that sends publish payloads to `/api/services/uploaderx/*`.
- **Dead UI**: UI that looks functional but has no effect on publishing because its value is never sent, persisted, or used by the backend route.
- **Ad hoc payloads**: Each platform function sends its own loose JSON shape instead of using one shared typed publishing contract.

## Current Code Map

Primary UI:

- `components/dashboard/UploaderX/ClientWrapper.tsx`
- `components/dashboard/UploaderX/UploadForm.tsx`
- `components/dashboard/UploaderX/VideoManager.tsx`
- `components/dashboard/UploaderX/PlatformEditor.tsx`

Client publish bridge:

- `hooks/useUploaderXUpload.ts`

Platform routes:

- `app/api/services/uploaderx/youtube/route.ts`
- `app/api/services/uploaderx/instagram/route.ts`
- `app/api/services/uploaderx/facebook/route.ts`
- `app/api/services/uploaderx/twitter/route.ts`
- `app/api/services/uploaderx/linkedin/route.ts`

Storage and metadata:

- `app/api/services/uploaderx/r2/sign/route.ts`
- `app/api/services/uploaderx/gcs/track-upload/route.ts`
- `app/api/services/uploaderx/videos/[uuid]/route.ts`
- `schemas/uploaderx-video.ts`

## Source-Backed Platform Matrix

### YouTube

Official source status: **Verified by official docs**

Sources:

- https://developers.google.com/youtube/v3/docs/videos/insert
- https://developers.google.com/youtube/v3/docs/thumbnails/set

Official API capabilities relevant to publishing:

- `videos.insert` uploads a video and can set metadata.
- Mutable insert fields include `snippet.title`, `snippet.description`, `snippet.tags[]`, `snippet.categoryId`, `snippet.defaultLanguage`, `localizations`, `status.embeddable`, `status.license`, `status.privacyStatus`, `status.publicStatsViewable`, `status.publishAt`, `status.selfDeclaredMadeForKids`, `status.containsSyntheticMedia`, and `recordingDetails.recordingDate`.
- `notifySubscribers` is a query parameter on `videos.insert`.
- `thumbnails.set` uploads and sets a custom video thumbnail for a `videoId`.
- YouTube notes that unverified API projects created after 2020-07-28 may have uploads restricted to private viewing until audit.

Observed in current code:

- `useUploaderXUpload.uploadToYouTube()` sends `gcsPath`, `filename`, `videoUuid`, `title`, `description`, `privacyStatus`, `categoryId`, `thumbnailPublicUrl`, and `publishAt`.
- `youtube/route.ts` reads persisted tags from video metadata and sends `snippet.tags`.
- `youtube/route.ts` reads request or persisted category and sends `snippet.categoryId`.
- `youtube/route.ts` sends `status.privacyStatus`.
- `youtube/route.ts` schedules uploads by forcing `status.privacyStatus` to `private` and sending `status.publishAt`.
- `youtube/route.ts` calls `thumbnails.set` when a valid thumbnail URL is supplied.
- `youtube/route.ts` appends `#Shorts` when metadata says `videoType === "short"`.

Gaps:

- Missing `notifySubscribers`.
- Missing made-for-kids and synthetic-media disclosure.
- Missing default language/localizations.
- Missing recording date.
- Missing license, embeddable, and public stats visibility controls.

Recommended Phase:

- Remaining YouTube parity should focus on compliance/advanced controls: notify subscribers, made-for-kids, synthetic media, language/localizations, recording date, license, embeddable, and public stats visibility.

### X / Twitter

Official source status: **Verified by official docs**

Sources:

- https://docs.x.com/x-api/posts/create-post
- https://docs.x.com/x-api/media/introduction

Official API capabilities relevant to publishing:

- `POST /2/tweets` can create or edit a post.
- Body fields include `text`, `media`, `poll`, `reply`, `reply_settings`, `quote_tweet_id`, `community_id`, `geo`, `made_with_ai`, `paid_partnership`, `nullcast`, `for_super_followers_only`, `direct_message_deep_link`, `card_uri`, and `share_with_followers`.
- Quote posting is documented with an Enterprise-plan caveat.
- Media objects can be attached by uploading media first and passing media IDs to the post creation endpoint.
- Media docs list upload size limits: image 5 MB, GIF 15 MB, video 512 MB when using `media_category=amplify_video`.

Observed in current code:

- `twitter/auth/route.ts` requests `tweet.read`, `tweet.write`, `users.read`, `offline.access`, and `media.write`.
- `twitter/route.ts` builds a single `tweetText` from title and description.
- `twitter/route.ts` truncates text to 280 characters.
- `twitter/route.ts` uploads a single media asset when `gcsPath` exists.
- `twitter/route.ts` posts `text` and `media.media_ids`.

Gaps:

- No poll support.
- No reply/thread support.
- No quote post support.
- No reply settings.
- No community post support.
- No geo/place support.
- No `made_with_ai` flag.
- No paid partnership flag.
- No nullcast or subscriber-only support.
- No multiple media UX/contract.
- No media metadata or alt-text flow identified in current code.

Recommended Phase:

- Implement after YouTube. Add richer post payload support while keeping Enterprise-gated features disabled unless the account/app plan supports them.

### LinkedIn

Official source status: **Verified by official docs**

Source:

- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-05

Official API capabilities relevant to publishing:

- Current LinkedIn Posts API creates and retrieves organic and sponsored posts.
- Content types listed by LinkedIn include text-only, images, videos, documents, articles, carousels, multi-image, polls, and celebration posts, with organic/sponsored availability varying by type.
- Permissions include `w_member_social` and `w_organization_social`; organization posting requires appropriate page roles.
- Current endpoint examples use `POST https://api.linkedin.com/rest/posts`.
- Posts support distribution fields, `visibility`, `lifecycleState`, and `isReshareDisabledByAuthor`.
- Docs include reshare creation.
- Docs include targeted organic organization posts through `distribution.targetEntities`.
- Docs include dark posts / direct sponsored content patterns.

Observed in current code:

- `linkedin/route.ts` uses the older `https://api.linkedin.com/v2/assets?action=registerUpload` and `https://api.linkedin.com/v2/ugcPosts` flow.
- Current code supports personal and organization author URNs.
- Current code supports text-only posts when no media is supplied.
- Current code detects media type as video, image, or document based on content type/file extension.
- Current code stores personal or organization LinkedIn result metadata on the video.

Gaps:

- Not using current `/rest/posts` API.
- No article post support.
- No multi-image support.
- No poll support.
- No reshare support.
- No targeted organization post support.
- No dark/sponsored post support.
- No `isReshareDisabledByAuthor` control.
- Organization picker is thin: UI chooses personal/organization, but richer organization selection and targeting are not first-class.

Recommended Phase:

- Modernize after YouTube/X contract work. This should be treated as an API migration, not a tiny route edit.

### Instagram

Official source status: **Partially verified by official docs for scheduling; needs logged-in Meta verification for richer fields**

Attempted sources:

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
- https://developers.facebook.com/docs/instagram-api/reference/ig-user/media_publish

Result:

- Meta developer pages were not reliably accessible from this session. Do not implement new Instagram fields until a logged-in Meta developer account verifies exact current endpoint parameters, account-type requirements, app-review permissions, and limitations.

Observed in current code:

- `instagram/auth/route.ts` uses Instagram Login flow and requests `instagram_business_basic` and `instagram_business_content_publish`.
- `instagram/route.ts` uses `https://graph.instagram.com/v21.0/me/media` and `/me/media_publish`.
- Current code supports publishing an image or a Reel based on content type.
- Current code sends `image_url` or `video_url`, `media_type=REELS` for video, `caption`, and `access_token`.
- Current code polls Reel container status before publish.
- Current code returns an existing media record instead of updating an already-published caption.

UI / code mismatch:

- `igCaption` is wired as description/caption input.
- `igLocation` exists in `ClientWrapper.tsx`, but it is not sent to `uploadToInstagram()`.
- `PlatformEditor.tsx` has Instagram `location` and `altText`, but the active publish payload does not pass those fields.

Needs verification:

- Feed vs Reel vs Story support under the current Instagram Login flow.
- Carousel support.
- Cover image / thumbnail controls.
- Location support.
- User tags, collaborator tags, product tags, or accessibility/alt-text support.
- Scheduling availability, if any, for the chosen API flow.

Recommended Phase:

- Do not expand until Meta docs are verified from a logged-in developer context.

### Facebook

Official source status: **Needs Meta verification**

Attempted source:

- https://developers.facebook.com/docs/graph-api/reference/page/videos/

Result:

- Meta developer pages were not reliably accessible for the full field set during the original audit. Scheduling fields were later verified against Meta docs and wired. Do not implement additional Facebook fields until a logged-in Meta developer account verifies exact current endpoint parameters, permission requirements, app-review status, and Page limitations.

Observed in current code:

- `facebook/auth/route.ts` requests `pages_manage_posts`, `pages_read_engagement`, and `pages_show_list`.
- `facebook/route.ts` posts videos to a selected Page.
- Current code supports title and description.
- Current code supports simple upload for smaller files and resumable upload for larger files.
- Current code can update title/description for an already-posted Facebook video if a video ID exists.
- Current code supports scheduling new Page videos and Page Reels.
- Scheduled Page videos send `published=false` and `scheduled_publish_time`.
- Scheduled Reels send `video_state=SCHEDULED` and `scheduled_publish_time`.
- Scheduled Facebook posts store `metadata.facebook.publishState = "scheduled"` and do not emit `video_published` learning events at schedule time.

UI / code mismatch:

- `fbMessage` is passed as the `description` argument, not as a separate post message field.
- `fbPrivacy` exists in `ClientWrapper.tsx`, but it is disabled by the capability map and not sent to `uploadToFacebook()`.
- `PlatformEditor.tsx` has Facebook `message`, `privacy`, and `scheduledTime`; schedule is route-read, privacy remains blocked.
- Thumbnail UI exists globally, but no Facebook thumbnail/cover flow is wired.

Needs verification:

- Thumbnail/cover controls for Page video upload.
- Distinction between feed post message and video description/title.
- Supported privacy controls for Page publishing.
- Photo/link/feed post support beyond Page video upload.

Recommended Phase:

- Keep scheduling support. Defer remaining Meta-rich fields until Meta docs are verified. The current route is heavily centered on Page video/Reel upload and should not be generalized blindly.

## Cross-Platform Findings

### Current Supported Surface

The implementation currently works more like a multi-destination uploader than a platform-native publisher:

- Shared asset upload to R2/GCS-style storage.
- Per-platform auth status.
- Basic title/description/caption style text.
- YouTube privacy, tags, category, schedule, and thumbnail through metadata/request payload.
- Instagram image/Reel publish with caption.
- Facebook Page video/Reel upload with title/description and scheduling for new posts.
- X text plus single media upload.
- LinkedIn text/media personal or organization post.

### Main Gaps

- No shared typed publishing contract.
- Several UI controls are blocked by capability map until route/API support exists.
- `PlatformEditor.tsx` stores richer platform settings, but the active publish path mostly ignores them.
- `ClientWrapper.tsx`, `UploadForm.tsx`, and `VideoManager.tsx` contain overlapping publish flows.
- Meta platform capabilities cannot be safely expanded without fresh Meta-doc verification.
- LinkedIn route uses an older API path while official docs now point to `/rest/posts`.

## Phase 1 Investigation Notes

Skill: `investigate`

Symptom:

- UploaderX appears to expose richer platform settings than it actually publishes.

Evidence:

- `ClientWrapper.tsx` is 1323 lines.
- `useUploaderXUpload.ts` is 449 lines.
- Existing docs previously described YouTube category/schedule/thumbnail and Facebook schedule as UI-only; current code wires these for supported platforms.
- Active hook payloads only send narrow fields:
  - YouTube: `gcsPath`, `filename`, `videoUuid`, `title`, `description`, `privacyStatus`, `categoryId`, `thumbnailPublicUrl`, `publishAt`
  - Facebook: `gcsPath`, `videoUuid`, `title`, `description`, `pageId`, `postType`, `publishAt`
  - Instagram: `gcsPath`, `videoUuid`, `title`, `description`, `accountId`
  - X: `gcsPath`, `videoUuid`, `title`, `description`
  - LinkedIn: `gcsPath`, `videoUuid`, `title`, `description`, `postType`, `organizationId`
- Recent git history includes multiple UploaderX auth/publish fixes, especially YouTube and Instagram, so broad cleanup can regress fragile integration behavior.

Root cause hypothesis:

- The mismatch is caused by drift between three layers: UI fields, saved metadata shape, and per-platform route payloads. New controls were added without a single capability map or typed publish contract, so some controls became UI-only while routes stayed narrow.

Phase 1 risk:

- Removing "unused" fields mechanically is risky because some fields may be intentionally staged for future parity, some are persisted through `PlatformEditor.tsx`, and some are referenced by docs/tests/older flows.
- Cleanup should start by classifying each field as one of:
  - wired and working
  - persisted but not published
  - UI-only and not persisted
  - docs-only
  - deprecated legacy flow

Phase 1 recommended scope:

- Do not edit platform routes yet.
- Touch at most five files.
- Start with an inventory PR/doc or test-backed field map.
- If code cleanup follows, limit it to:
  - debug logs that leak no needed troubleshooting context
  - duplicate/legacy route references proven unused
  - labels for UI-only controls, or hiding them behind `disabled`/`coming soon`
  - no auth-flow rewrites

## Proposed Execution Order

1. **Phase 1A: Field wiring inventory**
   - Build a table from UI state -> hook payload -> API route -> external API field.
   - No runtime change unless a field is provably misleading.

2. **Phase 1B: Hide or label placebo controls**
   - For controls not wired, either hide them or mark them unavailable.
   - Prefer hiding over implying behavior.

3. **Phase 2: Shared publish contract**
   - Typed payloads and per-platform capability definitions now exist in `lib/uploaderx/platform-capabilities.ts`.
   - Remaining work: expand validation and make all UI paths use the shared contract consistently.

4. **Phase 3: YouTube parity**
   - Category, schedule, and thumbnail are wired.
   - Remaining: notify subscribers, made-for-kids, synthetic media, language, recording date, license, embeddable, and public stats.

5. **Phase 4: X parity**
   - Add optional fields for reply settings, poll, reply/thread, community, geo, AI label, paid partnership, and media metadata.

6. **Phase 5: LinkedIn modernization**
   - Migrate toward current `/rest/posts` API and add richer post types.

7. **Phase 6: Meta parity after verification**
   - Facebook scheduling is wired.
   - Re-check Facebook/Instagram docs from a logged-in Meta developer account, then implement only remaining confirmed fields.

## Verification Notes

Current verification after Phase 5 refresh:

- `npx vitest run tests/uploaderx/video-publish-events.test.ts tests/uploaderx/platform-api-routes.test.ts`: 8 tests passing.
- `node scripts/run-creative-chain-tests.mjs`: 88 tests passing.
- `npx eslint . --quiet`: passing after lint workspace-ignore cleanup.
- Full `tsc` still has unrelated baseline errors, but no UploaderX errors were found after Phase 4A.

Original Phase 0 document was created without changing runtime code.

Required before any implementation phase:

- Re-read every file before editing.
- For files over 500 lines, read in chunks.
- For renames or field removals, search direct references, type references, strings, dynamic imports, re-exports, tests, and mocks.
- Run `npx tsc --noEmit`.
- Run ESLint if configured.
