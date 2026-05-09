# Remaining Work — UI/UX Redesign Branch

Last updated: May 9, 2026

---

## 1. Build Error (BLOCKING)

**AWS SDK version conflict** — not caused by UI/UX changes.

```
Module not found: Package path ./config is not exported from @smithy/core
```

**Source:** `app/api/services/alyzitron/r2/multipart/sign-part/route.ts`
**Fix:** Update `@aws-sdk/s3-request-presigner` and `@smithy/core` packages to compatible versions, or run `pnpm install` to regenerate lockfile.

---

## 2. Dashboard Backend (per-service updates)

The project model now has `brand`, `pipelineStage`, `qualityScore`, `projectStatus` fields. Each service needs to WRITE these fields when it processes a project.

### 2a. Pipeline Stage Updates

Each service should call `projectService.updateProject(projectId, { pipelineStage: "stage" })` when it starts processing.

| Service | File | When to update | Stage value |
|---|---|---|---|
| ThinkForge | `lib/thinkforge/` (script creation) | When script generation starts | `"script"` |
| Editron | `lib/editron/services/` (video production) | When editing/production starts | `"edit"` |
| Alyzitron | `lib/alyzitron/` (analysis) | When analysis starts | `"analyze"` |
| Clickatron | `lib/clickatron/` (thumbnails) | When thumbnail generation starts | `"thumbnails"` |
| UploaderX | `lib/services/` (publishing) | When publish starts | `"publish"` |
| Any | After all steps done | When project is fully shipped | `"complete"` |

### 2b. Quality Score Writeback

**File:** `app/api/services/alyzitron/analyze/route.ts` (or wherever the analysis result is saved)
**Action:** After scoring, write back to project:
```typescript
await projectService.updateProject(projectId, { qualityScore: score });
```

### 2c. Brand Field

**When:** At project creation or when user sets a brand/client.
**Where:** The project creation flow (ThinkForge → Editron handoff, or manual project creation).
**Action:** Allow users to set `brand` when creating or editing a project. This could be a dropdown or text input in the project settings.

### 2d. Project Status

**When:** Automatically derived from pipeline state.
**Logic:**
- Any failed video batch → `"needs-attention"`
- All steps complete + published → `"complete"`  
- Otherwise → `"active"`
**Where:** Could be computed at query time or updated by each service.

---

## 3. Dashboard Attention Zone

Currently shows empty state. Needs an API endpoint.

**Endpoint:** `GET /api/dashboard/attention` (new)
**Returns:** Array of items needing user action.
**Data sources:**
1. `pipeline_video_batches` where `status: "failed"` — failed video generation
2. `pipeline_video_jobs` where `status: "failed"` — individual job failures
3. Future: revision requests (needs new collection/field)
4. Future: approval timeouts (needs new field with timestamp)

---

## 4. Dashboard Shipped Section

Currently shows empty state. Needs UploaderX data.

**Endpoint:** `GET /api/services/uploaderx/videos` (already exists)
**Action:** Call this from DashboardHome to show recently published content.
**Fields needed:** project name, platforms published to, publish date, view counts.

---

## 5. Hero Preview → Main Homepage

The Insturix hero test at `/hero-test` shows visual frames during the edit phase (logo, editor mockup, feature pills, testimonial, end card). 

**Action:** Integrate `PreviewVisualInsturix` into the main `landing-page-a.tsx` as the Preview component for the edit phase. Replace the current blank preview with the visual frames.

**Files:**
- Source: `components/landing-a/preview-visual.tsx` (the Insturix version)
- Target: `components/landing-a/landing-page-a.tsx` (import and use during edit phase)

---

## 6. Homepage Mobile

The homepage editor demo doesn't work well on phones. The preview area is now taller (min-height 50vh) which helps, but the scroll-driven editor concept is fundamentally desktop.

**Options:**
- Keep current (acceptable — preview fills space, toasts work)
- Build a simplified mobile-only version (was rejected as Option B)
- Further CSS tweaks to the existing layout

---

## 7. Clerk Auth on Preview Deployments

Preview deployments get 401 on all API calls because Clerk sessions are domain-specific. The middleware `auth.protect()` is re-enabled.

**Fix options:**
- Add preview deployment URLs to Clerk's allowed origins
- Or accept that preview = no auth features (dashboard won't load data)
- On main domain after merge: should work fine

---

## 8. Blog Submission Backend

The blog page has a "Write for us" CTA linking to `/contactus`. A proper submission system needs:
- Upload/paste article content
- Review queue for admins
- Publish approval flow
- Auto-generate blog JSON files from approved submissions

---

## 9. Agency/Brand Dashboard Differentiation

The "Two paths. Same engine." section on homepage shows "For brand teams" and "For agencies." Currently both link to `/contactus`. Future: separate dashboard layouts for agency vs brand users.

---

## 10. Pages Still Using Old Components

These pages are archived (noindex) but still exist with old code:
- `/about/team` — placeholder
- `/insturix-creatives-agency` — placeholder
- Individual product pages (`/products/thinkforge`, etc.) — placeholders
- `/donate`, `/sponsor`, `/contribute` — placeholders (replaced by `/support-us`)

---

## 11. Dashboard Test Variants (cleanup)

8 test variants at `/dashboard/test/[1-8]` — kept for reference during dashboard development. Can be deleted after final dashboard design is chosen.

---

## 12. Design Bible Location

Currently at `D:\google downloads\Front-End-main\DESIGN_BIBLE.md` (project root, outside worktree). Consider:
- Moving into the repo for version control
- Or keeping in memory files for Claude sessions
