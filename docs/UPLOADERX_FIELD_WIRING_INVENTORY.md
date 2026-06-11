# UploaderX Field Wiring Inventory

Date: 2026-06-10
Worktree: `main` (`Front-End-main`)
Phase: 1A
Scope: documentation-only inventory. No runtime behavior changed.

## Purpose

This file maps UploaderX UI fields to the client upload hook, platform API routes, stored metadata, and known publish behavior. It exists so Phase 1 cleanup does not remove fields that are staged, persisted, or used by a legacy flow.

## Classification

- **wired**: value reaches a platform publish route and affects publish behavior.
- **stored**: value is stored in `UploaderXVideo.metadata`, but does not necessarily reach a platform publish route.
- **stored-read**: value is stored and later read by at least one route.
- **UI-only**: value exists in UI state or a component, but is not serialized to the publish hook/route.
- **legacy-flow**: field is used only in an older or parallel flow.
- **duplicate-risk**: code path is duplicated or has overlapping behavior that should not be deleted without tests.
- **blocked**: platform/API behavior requires separate verification before implementation.

## Active Publish Paths

### Cockpit publish path

Primary file:

- `components/dashboard/UploaderX/ClientWrapper.tsx`

Bridge:

- `hooks/useUploaderXUpload.ts`

Route targets:

- `/api/services/uploaderx/youtube`
- `/api/services/uploaderx/facebook`
- `/api/services/uploaderx/instagram`
- `/api/services/uploaderx/twitter`
- `/api/services/uploaderx/linkedin`

This path is the newest cockpit-style flow. It has the richest UI fields but only serializes a subset of them to the publish hook.

### UploadForm publish path

Primary file:

- `components/dashboard/UploaderX/UploadForm.tsx`

Bridge:

- `hooks/useUploaderXUpload.ts`

This path contains an older upload form and parallel platform upload logic. It duplicates Facebook, Instagram, Twitter, and LinkedIn upload blocks. Treat as **duplicate-risk** until usage is confirmed from page composition and tests.

### VideoManager quick-action path

Primary file:

- `components/dashboard/UploaderX/VideoManager.tsx`

Route targets:

- Direct `fetch()` calls to platform routes.

This path bypasses `useUploaderXUpload.ts` for platform publish calls and has its own account/page/organization prompts. It often sends less metadata than `ClientWrapper`.

### PlatformEditor metadata path

Primary files:

- `components/dashboard/UploaderX/PlatformEditor.tsx`
- `components/dashboard/UploaderX/VideoManager.tsx`
- `app/api/services/uploaderx/videos/[uuid]/route.ts`

This path saves platform-specific metadata into the video document. Some route code later reads parts of that metadata, but the active `ClientWrapper` publish flow does not use most `PlatformEditor` fields directly.

## Global Upload Metadata

| UI Field | Source | Hook Payload | Storage | Route Read | Publish Effect | Class | Notes |
|---|---|---|---|---|---|---|---|
| `metaTitle` / `defaultTitle` | `ClientWrapper`, `UploadForm`, `PlatformEditor` | sent as `title` or stored in upload metadata | `metadata.title`; sometimes per-platform title | YouTube, Facebook, Instagram, X, LinkedIn routes can read `metadata.title` | yes | **wired / stored-read** | Active publish passes title directly; routes also fall back to stored metadata. |
| `metaDescription` / `defaultDescription` | `ClientWrapper`, `UploadForm`, `PlatformEditor` | sent as `description` or stored in upload metadata | `metadata.description`; sometimes per-platform description | YouTube, Facebook, Instagram, X, LinkedIn routes can read `metadata.description` | yes | **wired / stored-read** | Platform meaning differs: YouTube description, IG caption component, X tweet text component, LinkedIn commentary. |
| `metaTags` / `defaultTags` | `ClientWrapper`, `UploadForm`, `PlatformEditor` | stored during upload metadata | `metadata.tags`; `metadata.youtube.tags` via editor | YouTube reads tags from stored metadata | YouTube only | **stored-read** | Tags are not sent directly to `uploadToYouTube()`; YouTube route reads DB metadata. |
| `metaPrivacy` / `privacyStatus` | `ClientWrapper`, `UploadForm`, `PlatformEditor` | sent to YouTube; stored during upload metadata | `metadata.privacyStatus`; `metadata.youtube.privacyStatus` | YouTube route reads and sends `status.privacyStatus` | YouTube only | **wired / stored-read** | Not meaningful for Facebook Page video, Instagram, X, or LinkedIn as currently wired. |
| `metaVideoType` / `activeType` | `ClientWrapper`, `UploadForm` | stored during upload metadata | `metadata.videoType` | YouTube route reads `videoType === "short"` | YouTube title/description gets `#Shorts` | **stored-read** | Also used client-side in `ClientWrapper` and `UploadForm` to append `#Shorts`. |
| `metaThumbnail` / `thumbnailFile` | `ClientWrapper`, `UploadForm`, `PlatformEditor.thumbnail` | not sent to publish hook | not stored by active cockpit upload | none found | none | **UI-only** | Button and file input exist, but no upload, storage, or platform thumbnail call is wired. |
| `metaSchedule` | `ClientWrapper`; `PlatformEditor.youtube.scheduledTime`; `PlatformEditor.facebook.scheduledTime` | not sent to publish hook | only via PlatformEditor save, if user uses that modal | none found | none | **UI-only / stored** | Active publish ignores it. YouTube/Facebook schedule behavior should be implemented later with platform checks. |

## YouTube Fields

| Field | UI Source | Hook Payload | Route Behavior | Class | Cleanup Guidance |
|---|---|---|---|---|---|
| title | `metaTitle`, `defaultTitle`, `PlatformEditor.title` | `title` | sent as `snippet.title`; fallback from metadata | **wired** | keep |
| description | `metaDescription`, `defaultDescription`, `PlatformEditor.description` | `description` | sent as `snippet.description`; fallback from metadata | **wired** | keep |
| tags | `metaTags`, `defaultTags`, `PlatformEditor.tags` | upload metadata only | route reads metadata and sends `snippet.tags` | **stored-read** | keep, but document route dependency |
| privacy | `metaPrivacy`, `privacyStatus`, `PlatformEditor.youtube.privacyStatus` | `privacyStatus` | sent as `status.privacyStatus` | **wired** | keep |
| category | `ytCategory`, `PlatformEditor.youtube.categoryId` | not sent | route hard-codes `categoryId: "22"` only during update | **UI-only / stored** | do not delete until deciding whether to wire or hide |
| schedule | `metaSchedule`, `PlatformEditor.youtube.scheduledTime` | not sent | no `publishAt` usage | **UI-only / stored** | hide/disable or wire in YouTube parity phase |
| thumbnail | `metaThumbnail`, `thumbnailFile`, `PlatformEditor.thumbnail` | not sent | no `thumbnails.set` usage | **UI-only** | hide/disable or wire in YouTube parity phase |
| short/long | `metaVideoType`, `activeType` | upload metadata | route/client appends `#Shorts` | **stored-read** | keep |

## Instagram Fields

| Field | UI Source | Hook Payload | Route Behavior | Class | Cleanup Guidance |
|---|---|---|---|---|---|
| title | shared title | `title` | used as first part of `fullCaption` | **wired** | keep |
| caption/description | `igCaption` or shared description; `PlatformEditor.instagram.caption` | `description` in active cockpit path | route builds `caption` from title + description or stored metadata | **wired / stored-read** | keep |
| account | prompt/status selection in `VideoManager`, optional hook arg | `accountId` supported in hook but not passed by `ClientWrapper` | selects target account | **partially wired** | replace prompts with real selector later |
| location | `igLocation`, `PlatformEditor.instagram.location` | not sent | no route usage | **UI-only / stored** | hide/disable until Meta verification |
| alt text | `PlatformEditor.instagram.altText` | not sent | no route usage | **stored only** | hide/disable until Meta verification |
| media type | inferred from content type | not user-selected | route sends `media_type=REELS` for video, image otherwise | **wired by inference** | keep, but later expose feed/reel/story only after Meta verification |

## Facebook Fields

| Field | UI Source | Hook Payload | Route Behavior | Class | Cleanup Guidance |
|---|---|---|---|---|---|
| title | shared title | `title` | used as video `title` | **wired** | keep |
| description/message | `fbMessage` or shared description; `PlatformEditor.facebook.message` | `description` | used as video `description` | **wired but semantically blurred** | keep, but rename in contract later |
| page | prompt/status selection in `VideoManager`, optional hook arg | `pageId` supported; `ClientWrapper` does not pass it | selects target Page | **partially wired** | replace prompts with real selector later |
| privacy | `fbPrivacy`, `PlatformEditor.facebook.privacy` | not sent | no route usage | **UI-only / stored** | hide/disable unless Meta confirms valid Page privacy controls |
| schedule | `PlatformEditor.facebook.scheduledTime` | not sent | no route usage | **stored only** | hide/disable until Meta verification |
| thumbnail | global thumbnail UI | not sent | no route usage | **UI-only** | hide/disable until Meta verification |

## X / Twitter Fields

| Field | UI Source | Hook Payload | Route Behavior | Class | Cleanup Guidance |
|---|---|---|---|---|---|
| title | shared title | `title` | part of `tweetText` | **wired** | keep |
| description | shared description | `description` | part of `tweetText` | **wired** | keep |
| media | selected video asset | `gcsPath`, `videoUuid` | uploads one media item and attaches it | **wired** | keep |
| text-only | `UploadForm` title/description when Twitter-only | `title`, `description`; no media | route supports no `gcsPath` text-only post | **legacy-flow wired** | keep until cockpit text-only support is decided |
| poll/reply/quote/community/geo | none | not sent | no route usage | **not represented** | add later only through shared contract |

## LinkedIn Fields

| Field | UI Source | Hook Payload | Route Behavior | Class | Cleanup Guidance |
|---|---|---|---|---|---|
| title/text | shared title | `title` | used as post commentary/title fallback | **wired** | keep |
| description | shared description | `description` | used as commentary/media description | **wired** | keep |
| media | selected asset | `gcsPath`, `videoUuid` | detects image/video/document by content type | **wired** | keep |
| post type | `liPostType`; `VideoManager` prompt | `postType` | chooses person vs organization URN | **wired** | keep |
| organization ID | `VideoManager` prompt; hook supports arg | `organizationId` | selects organization if provided; otherwise default first org | **partially wired** | add real selector; avoid deleting |
| text-only | `UploadForm` title/description when LinkedIn-only | `title`, `description`; no media | route supports no-media post | **legacy-flow wired** | keep until cockpit text-only support is decided |
| article/poll/reshare/multi-image | none | not sent | no route usage | **not represented** | add later during LinkedIn modernization |

## Metadata Editor Fields

`PlatformEditor.tsx` defines richer platform metadata:

- shared: `title`, `description`, `tags`, `isPublic`, `thumbnail`, `category`, `language`
- YouTube: `categoryId`, `privacyStatus`, `scheduledTime`
- Instagram: `caption`, `location`, `altText`
- Facebook: `message`, `privacy`, `scheduledTime`

`VideoManager.tsx` saves this object via `PATCH /api/services/uploaderx/videos/[uuid]`.

The PATCH route merges the submitted metadata into `video.metadata`.

Route-side usage is uneven:

- YouTube reads `metadata.youtube`, `metadata.title`, `metadata.description`, `metadata.tags`, and `metadata.videoType`.
- Instagram reads `metadata.instagram.caption`, `metadata.instagram.description`, `metadata.title`, and `metadata.description`.
- Facebook reads `metadata.facebook.title`, `metadata.facebook.description`, `metadata.title`, and `metadata.description`.
- X reads `metadata.twitter.title`, `metadata.twitter.description`, `metadata.title`, and `metadata.description`.
- LinkedIn quick publish from `VideoManager` reads `video.metadata?.title` and `video.metadata?.description`, but the route does not read stored LinkedIn draft metadata before publishing.

## Cleanup Risk Register

| Risk | Evidence | Recommended Handling |
|---|---|---|
| Placebo controls | `metaThumbnail`, `metaSchedule`, `ytCategory`, `igLocation`, `fbPrivacy` are visible but not serialized by `ClientWrapper` publish. | Hide/disable or wire intentionally. Do not silently leave them as working-looking controls. |
| Duplicate platform upload blocks | `UploadForm.tsx` repeats Facebook/Instagram/Twitter/LinkedIn upload blocks. | Confirm whether `UploadForm` is mounted in production. Then remove duplicates in a separate, tested cleanup. |
| Parallel publish paths | `ClientWrapper`, `UploadForm`, and `VideoManager` can publish through different paths. | Do not delete route args based on one UI path. First consolidate through a shared publish contract. |
| Prompt-based target selection | `VideoManager` uses `prompt()` for Page/account/org selection. | Replace with UI selectors later; do not remove until equivalent selectors exist. |
| Stored-but-unpublished fields | `PlatformEditor` saves fields that active publish paths ignore. | Either wire through shared contract or label them unsupported. |
| Meta feature uncertainty | Facebook/Instagram official docs were not verified in Phase 0. | Treat Meta-rich fields as blocked until logged-in docs verification. |

## Phase 1B Candidate Actions

Safe candidates after this inventory:

1. Add visible unavailable/coming-soon state for thumbnail, schedule, Instagram location, Facebook privacy, and YouTube category in `ClientWrapper`.
2. Add a comment or doc link near `UploadForm` duplicate platform blocks before deleting anything.
3. Create a typed publish payload interface without changing runtime behavior.
4. Add route-level validation errors for unsupported fields only after the UI stops pretending they work.

Unsafe candidates right now:

1. Deleting `PlatformEditor` fields just because active cockpit publish ignores them.
2. Removing `UploadForm` without confirming page composition and usage.
3. Removing `pageId`, `accountId`, or `organizationId` support because `ClientWrapper` does not pass them.
4. Expanding Facebook/Instagram fields without Meta docs verification.
