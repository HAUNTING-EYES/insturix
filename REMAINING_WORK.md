# Remaining Work — UI/UX Redesign Branch

Last updated: May 14, 2026

---

## DONE

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
- ✅ Project status derivation (deriveProjectStatus in project-service.ts)
- ✅ Old placeholder pages cleanup
- ✅ Dashboard test variants cleanup
- ✅ Legal pages
- ✅ Careers page
- ✅ Pricing receipt polish
- ✅ Socialize dashboard redesign (timeline/story layout, StoryArc, spine, sync dots)
- ✅ Socialize public profile redesign (bento grid, platform colors, breathing avatar)
- ✅ Socialize status + accentColor end-to-end
- ✅ UploaderX dashboard redesign
- ✅ Clickatron dashboard redesign

---

## TODO: Dashboard Redesigns

| Product | Path | Status |
|---|---|---|
| Socialize | `/dashboard/socialize` | ✅ DONE |
| Clickatron | `/dashboard/clickatron` | ✅ DONE |
| UploaderX | `/dashboard/uploaderx` | ✅ DONE |
| Musitron | `/dashboard/musitron` | 🔄 Mockups building |
| Org | `/dashboard/org` | 🔄 Mockups building |
| Credits | `/dashboard/billing` | 🔄 Mockups building |

---

## TODO: Backend / Features

### Brand Field
Allow users to set `brand` at project creation (ThinkForge → Editron handoff or manual).

### Blog Submission Backend
- Upload/paste article content
- Admin review queue
- Publish approval flow

### Agency / Business Pages
- Agency page
- Business-specific landing pages

### ThinkForge → Editron Export UI
- Rework the panels shown when exporting a script from ThinkForge to Editron
- Current flow needs UX improvements

### Pipeline Cross-Service Export (Source of Truth)
- One unified pattern for when any service exports to another
- Pipeline UI showing handoff state between services
- Currently ad-hoc per service pair

---

## TODO: Marketing Pages

### Responsive / Mobile Passes
All marketing pages are desktop-only. Need mobile responsive pass.
