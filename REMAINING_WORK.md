# Remaining Work — UI/UX Redesign Branch

Last updated: May 10, 2026

---

## PHASE 1: Backend Wiring (execute now)

### 1a. Pipeline Stage — Clickatron thumbnails
Wire `updateProjectMetadata(projectId, { pipelineStage: "thumbnails" })` in Clickatron's generation route.

### 1b. Pipeline Stage — complete status
Wire `"complete"` stage. Logic: after publish if all steps done.

### 1c. Brand Field
Allow users to set `brand` at project creation (ThinkForge → Editron handoff or manual).

### 1d. Project Status Derivation
- Failed video batch → `"needs-attention"`
- All steps complete + published → `"complete"`
- Otherwise → `"active"`

### 1e. Blog Submission Backend
- Upload/paste article content
- Admin review queue
- Publish approval flow

### 1f. Old Placeholder Pages Cleanup
Delete archived pages: `/about/team`, `/insturix-creatives-agency`, individual product placeholders, `/donate`, `/sponsor`, `/contribute`.

### 1g. Dashboard Test Variants Cleanup
Delete `/dashboard/test/[1-8]` test pages.

---

## PHASE 2: Dashboard Redesigns (after Phase 1)

| Product | Path | Status |
|---|---|---|
| Clickatron | `/dashboard/clickatron` | Needs redesign |
| Socialize | `/dashboard/socialize` | Needs redesign (Gold overhaul PR merged, needs further work) |
| UploaderX | `/dashboard/uploaderx` | Needs redesign |
| Musitron | `/dashboard/musitron` | Needs redesign |
| Org | `/dashboard/org` | Needs redesign |
| Credits | `/dashboard/billing` | Needs redesign |

---

## DONE (this session)

- ✅ Hero preview swap (PreviewVisualInsturix)
- ✅ Sidebar logo font (matches SiteNavbar LogoBrand)
- ✅ Admin button (SiteNavbar + dashboard sidebar)
- ✅ Loading screen (logo image pulse)
- ✅ Font consistency (Alyzitron ChatPanel, ThinkForge ScriptEditor)
- ✅ AWS SDK build error (sorted by user)
- ✅ Pipeline stages: edit, analyze, publish
- ✅ Quality score writeback
- ✅ Dashboard attention zone
- ✅ Dashboard shipped section
