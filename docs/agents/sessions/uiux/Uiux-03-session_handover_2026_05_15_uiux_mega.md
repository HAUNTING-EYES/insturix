---
name: Session Handover 2026-05-15 (UI/UX Mega Session)
description: Longest session ever. 6 dashboards shipped, export decomposed, 12 mockups, 107 plan refs fixed, Film Strip concept chosen. Export dialog still needs visual polish. Critical rules established.
type: project
originSessionId: d72a2bcb-7e10-464e-b42e-c0d56a550793
---
# Session Handover — 2026-05-15 (UI/UX Mega Session)

## CRITICAL: User Rules Established This Session

### Rule A: No Stubs, No Hallucinated Constants, No Unverified Logic
- NEVER put stub code, placeholder logic, or TODO comments in shipped code
- NEVER hallucinate constants — if you don't know it, READ THE CODE
- If a function signature is unclear, READ IT, don't guess

### Rule B: Every Decision Must Pass the Production Test
1. Is this production-level?
2. Is this scalable?
3. Is this the right direction?
If any NO → stop and redesign before writing code.

### Saved at: memory/user_rules_absolute.md

## What Shipped

### Dashboard Redesigns (ALL 6 DONE)
1. **Socialize** — Timeline/story layout, StoryArc, pulse spine, sync dots, narrative labels, status+accentColor end-to-end
2. **Musitron** — Recording Studio (generation) + Jukebox (collections), tab nav, real 3 models
3. **Org** — Constellation Hero (SVG stars) + searchable MemberTable, role-based star colors
4. **Credits** — Receipt Tape (dark thermal receipt, 7 animations, gold zigzag edges)
5. **UploaderX** — Done prior
6. **Clickatron** — Done prior

### Export Dialog Decomposition
- 2,680-line monolith → 13 files in `components/dashboard/ThinkForge/export/`
- `useExportPipeline.ts` (1,705 lines) — all 62 state vars, 24 API calls, 3 polling systems
- 10 sub-components: ExportConfigPanel, ProfileSelectionPanel, ReferenceImagePanel, StoryboardReviewPanel, PipelineProgressPanel, ExportCompletePanel, SubjectCard, SceneCard, ExportStageHeader, thin wrapper
- Step labels changed from developer terms to user-friendly ("Reading your script", "Identifying visuals", etc.)
- Film Strip design concept chosen and implemented (sprocket holes, film frames, viewfinder processing, clapperboard complete)
- Backend audit: all 17 handlers verified across 43 references

### Bug Fixes
- 107 broken plan references fixed (prod DB)
- Billing crash: useSearchParams needs Suspense + null plan name guard
- Tailwind animate-[] breaks in Vercel prod → use inline style + <style> tags
- Video gen URL newline bug (asset proxy URL had \n)
- Socialize notifications hidden in preview (removed !isPreview gate)
- Receipt buttons matched to product theme (solid gold, not dashed border)

### Design Artifacts
- 12 dashboard mockups built (4 each: Musitron, Org, Credits)
- 3 export concept mockups (Energy Flow, Film Strip chosen, Director's Desk)
- Export stages showcase HTML (all 7 stages)
- Socialize timeline mockup (V3 through V3.11 iterations)

## What Needs Fixing NEXT SESSION — CRITICAL

### 1. Export Dialog Visual Polish (HIGHEST PRIORITY)
The Film Strip design was implemented but the VISUAL OUTPUT doesn't match the mockup:
- Film strip frames render as empty dark boxes — icons not visible
- Sprocket holes barely visible
- The dialog is now centered (fixed positioning) but the CONTENT panels are too tall for the viewport
- The config panel (ExportConfigPanel.tsx) has too many form fields stacked vertically
- **Solution needed**: Make panels COMPACT enough to fit in ~70vh without scrolling. Consider 2-column layout for config form fields, or collapsible sections.
- **The approved mockup is at**: `public/mockups/export-concept-2.html` — this is the source of truth
- **Compare against**: the live production at insturix.com after clicking Export in ThinkForge

### 2. Navbar Spacing Inconsistency
- User noticed different text spacing between home page and products page navbars
- Both use the same SiteNavbar component
- The landing page scroll bridge fires pill mode at `pct > 0.02` (nearly instant) while regular pages fire at `scrollY > 200`
- I tried changing the threshold to 200 but user said it made things worse → REVERTED
- The real fix needs investigation: is it the pill mode, or something else causing visual difference?
- **DO NOT TOUCH landing-page-a.tsx scroll threshold again without user approval**

### 3. Old Monolith Cleanup
- The old `ExportToEditronDialog.tsx` (2,680 lines) still exists in the parent directory
- Currently unused (import points to export/ version)
- Delete AFTER confirming the new version works end-to-end on production

## Key Technical Gotchas

1. **Tailwind animate-[] BREAKS in Vercel prod** — ALWAYS use `style={{ animation: "keyframeName 2s ease" }}` with keyframes in `<style dangerouslySetInnerHTML>` tags
2. **useSearchParams() in Next.js 15** requires a `<Suspense>` boundary or the entire page crashes
3. **Radix Dialog scrollbar bug** — clicking the scrollbar triggers dialog close. Fix: `onPointerDownOutside` + `onInteractOutside` handlers
4. **Plan references can be stale** — always null-check before .toLowerCase() or property access
5. **Asset proxy URLs can have embedded newlines** — .trim().replace(/\n/g, '') at input boundaries

## User's Design Taste (confirmed repeatedly)
- Dark luxury (#0B0B0A, #D4A652 gold)
- Alive animations (pulse, glow, draw-on-load, traveling energy)
- Every element has meaning — no decoration without function
- Breathing room — decluttered, not crammed
- JetBrains Mono for data, Plus Jakarta Sans for body
- NO scroll in dialogs — entire content visible at once, centered on screen
- Hates: generic dark rectangles, developer terminology exposed, blinking buttons, receipt metaphors taken too far

## Remaining Work (from REMAINING_WORK.md)
- Export dialog visual polish (see above)
- Navbar consistency
- Brand field on projects
- Blog submission backend
- Agency / business pages
- Responsive / mobile passes

## Branch State
- Branch: `uiux-redesign`
- Latest commit: `1cba6805` — center dialog on screen
- All pushed to main
- Zero type errors in export/ directory

## Files Map (Export)
```
components/dashboard/ThinkForge/export/
├── types.ts                    (100 lines)
├── hooks/
│   ├── usePolling.ts           (82 lines)
│   └── useExportPipeline.ts    (1,705 lines) ← DO NOT TOUCH
├── ExportToEditronDialog.tsx   (~170 lines, thin wrapper)
├── ExportStageHeader.tsx       (film strip pipeline bar)
├── ExportConfigPanel.tsx       (configure form — TOO TALL, needs compact)
├── ProfileSelectionPanel.tsx   (profile picker)
├── ReferenceImagePanel.tsx     (reference review)
├── StoryboardReviewPanel.tsx   (storyboard review)
├── PipelineProgressPanel.tsx   (viewfinder + step list)
├── ExportCompletePanel.tsx     (clapperboard success)
├── SubjectCard.tsx             (individual subject)
└── SceneCard.tsx               (individual scene)
```

## Design Decisions (saved in memory/dashboard_redesign_decisions.md)
- Socialize: Timeline/story chosen
- Musitron: Recording Studio + Jukebox (2 views)
- Org: Constellation + Crew Manifest merged
- Credits: Receipt Tape (dark, gold accents)
- Export: Film Strip concept chosen, viewfinder from Director's Desk integrated
- Brand Vault concept deferred (repurpose War Room for brand asset knowledge graph)
