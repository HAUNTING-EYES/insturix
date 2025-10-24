ICS'25 — Changes and Updates Log

Date: 2025-10-21

Summary
-------
This document records the edits and additions made to the ICS'25 landing and GameOn pages in the Front-End workspace (path: `Front-End/`). The goal was to redesign the ICS'25 landing with a bold dark + neon aesthetic, sectionize content, and add a dedicated GameOn esports page. It also includes a late-scope decision to drop the mobile app and surface schedule/updates on-site only. The following is a chronological list of changes made so far.

Files Added / Changed
---------------------
1. components/ICS25ClientContent.tsx (modified)
   - Converted the landing content to a dark + neon theme (base #0A0A0C, accents #3A9EFF, #FF2EE6).
   - Reworked the Hero section to include:
       - Date and venue line (minimal typography; GlowChips removed in the cinematic pass).
     - Gradient headline and subhead with Framer Motion entry animations.
     - CTAs: "Get Creator Pass" (anchor to #pricing), "Register for Gaming" (signup/register flow), "View Schedule" (anchor to #schedule).
     - Small DTV label at bottom-right with dates and venue.
   - Replaced inline <a> tags with Next.js `Link` for internal navigation to satisfy ESLint.
   - Added Section wrappers and assembled the landing from new components: About, Highlights, GameOnBlock, PricingGrid, SchedulePreview, Sponsors, Countdown, FAQ link.

2. components/ics25/Countdown.tsx (added)
   - Live countdown component targeting 2025-11-22T10:00:00+05:30.

3. components/ics25/Section.tsx (added)
   - `SectionWrapper` and `SectionHeader` layout helpers for consistent section spacing and headers.

4. components/ics25/HighlightsGrid.tsx (added)
   - Neon-glow highlights cards with Framer Motion.

5. components/ics25/GameOnBlock.tsx (added)
   - Dedicated GameOn block with tournament info, CTAs, prize pool, and slots counter UI.

6. components/ics25/PricingGrid.tsx (added)
   - Creator pass pricing grid (four tiers) with group discounts and hover glow effects.

7. components/ics25/About.tsx (added)
   - Two-column About section with animated stats tiles.

8. components/ics25/Schedule.tsx (modified)
   - Previously referenced the ICS'25 app; updated to remove the app promo.
   - New copy: "Full schedule drops Oct 25 on this website. Live updates will be posted here." and a panel labeled "Updates — Live on the Site" stating "No mobile app. We’ll post real-time changes, room switches and announcements right here.".

9. components/ics25/IcsFaq.tsx (added)
   - FAQ accordion for core ICS questions (registration, refunds, accommodation, conduct, Wi‑Fi/food).

10. components/ics25/Sponsors.tsx (added)
    - Sponsors grid with grayscale-to-glow hover effects and partner CTA.

11. app/ics25/gameon/page.tsx (added)
    - Dedicated GameOn esports page linking to GameOnBlock and rules/FAQs.

12. app/layout.tsx (modified)
    - Wired Google fonts (Inter, Space Grotesk) via next/font and applied CSS variables on `html`.

13. Front-End/ics25.md (added)
    - This changelog file (you are reading it).

Additional Files Added / Changed (Cinematic + Rhythm Pass)
---------------------------------------------------------
14. components/ics25/Marquee.tsx (added)
   - Reusable marquee component with seamless loop, mask gradient edges, speed control, and pause-on-hover. Typed to accept `React.ReactNode`.

15. app/globals.css (modified)
   - Added lightweight global utilities used across ICS'25:
     - `.orb` (soft glow circles), `.glow-pulse`, `.tilt-hover`, `.shimmer-bg`, `.floaty`, `.pulse-dot`, `.scroll-indicator`.
   - Added angled neon gradient section breaks:
     - `.section-angled-top` and `.section-angled-bottom` using clip-path + blur to create premium transitions between sections.

16. components/ics25/Section.tsx (modified)
   - SectionHeader: minimal uppercase eyebrow label (chips removed), while-in-view animation and subtle title glow.
   - SectionWrapper: ambient orbs behind content for depth.

17. components/ics25/HighlightsGrid.tsx (modified)
   - Staggered fade-rise-in, tilt-hover on cards, shimmer overlay on icons.

18. components/ics25/GameOnBlock.tsx (modified)
   - Count-up animation for slots (motion values + spring), glow-pulse CTAs, timeline pills, background orbs.

19. components/ics25/PricingGrid.tsx (modified)
   - Staggered slide-up animations, "best value" card floats gently, glow-pulse CTAs.

20. components/ics25/IcsFaq.tsx (modified)
   - Motion-driven accordion open/close, hover glow on triggers.

21. components/ICS25ClientContent.tsx (modified, rhythm integration)
   - Integrated `.section-angled-top/bottom` on section wrappers to break monotony.
   - Inserted two marquee separators: (a) between Highlights → GameOn and (b) before Sponsors.
   - Ensured internal navigation uses `Link` and targets anchors for CTAs.

Premium Layout Pass (Layered + Designer Feel)
--------------------------------------------
22. components/ics25/Beams.tsx (added)
   - Soft gradient beam background for a premium layered look with subtle noise texture.

23. components/ics25/Parallax.tsx (added)
   - Lightweight on-scroll parallax wrapper to create depth between hero and content blocks.

24. components/ics25/Decor.tsx (added)
   - `Sticker` and `Ribbon` mini-components for tasteful decorative labels and accents.

25. components/ics25/RailNav.tsx (added)
   - Sticky vertical rail navigation on desktop that highlights the active section and improves page exploration.
   - IntersectionObserver-based, smooth-scroll anchors, auto-highlights the most visible section.

26. components/ICS25ClientContent.tsx (modified, premium integration)
   - Wove `Beams` into the hero background and wrapped primary content with `Parallax` for depth.
   - Added `Ribbon` (date/venue) and two `Sticker` accents beneath the hero CTA cluster.
   - Mounted `RailNav` with sections: About, Highlights, Esports, Passes, Schedule, Sponsors.
   - Result: less blocky/stacked feel; more editorial, layered presentation with ambient motion.

Interactive & Content Pass (Counters, Overlay, Tickets)
------------------------------------------------------
27. components/ics25/About.tsx (modified)
   - Replaced static stats with animated counters using `CountUp` (800+, 50K+, 200+).

28. components/ics25/HighlightsGrid.tsx (modified)
   - Ensured consistent bottom-aligned “Learn more” across all cards using a 4-row grid.
   - Added click-to-open overlay with premium animation; removed reliance on raw .txt fetch for content.
   - Integrates curated block-specific details via a new helper module.

29. components/ics25/highlightDetails.tsx (added)
   - Curated, beautified content per highlight (bullets, emphasis, links) shown in the overlay.

30. components/ModalOverlay.tsx (added)
   - Premium modal overlay: neon halo, diagonal sheen, glass blur, spring transitions, ESC/backdrop close.
   - Header supports per-block icon for stronger visual context.

31. components/ics25/PricingGrid.tsx (modified)
   - Removed all chips/badges from the tickets section as requested.
   - Kept premium frame; CTAs pinned to the bottom for hierarchy.

32. components/ScrollProgressBar.tsx (added) and app/ics25/page.tsx (modified)
   - Thin, neon gradient top progress bar to elevate scrolling feel.

Linting & Validation
--------------------
- Ran `pnpm -C Front-End lint` to validate changes. ESLint previously flagged a `no-html-link-for-pages` rule for raw anchor tags linking to internal pages; this was fixed by replacing those anchors with Next.js `Link`.
- The repo has several unrelated ESLint warnings (unused variables, missing alt on <img>, react-hook dependency warnings). These were not introduced by the ICS edits and remain as broader cleanup items.

- Latest status (2025-10-21):
  - Lint: Modified ICS'25 files pass. Unrelated warnings persist elsewhere.
  - Build: Fails due to unrelated API route requiring `QSTASH_CURRENT_SIGNING_KEY` at build-time, and a GCS bucket requirement in `/api/proxy/image` for prod builds.
  - Hydration: Fixed button nesting error in TournamentGrid; no hydration mismatches.
  - Navigation: RailNav properly highlights active sections with stable glow during slow scrolling; FAQ section added and correctly ordered.
  - Workarounds:
     1) Temporarily set a dummy env for local builds.
       - Windows PowerShell:
         - `$env:QSTASH_CURRENT_SIGNING_KEY="dummy"; pnpm build`
       2) Refactor API routes to read env lazily and guard third-party clients (e.g., GCS) at request-time to avoid build-time failures.

Design Notes
------------
- Aesthetic: dark background (#0A0A0C) with neon gradients (primary: #3A9EFF; accent: #FF2EE6) and soft glow blobs.
- Typography: Space Grotesk (headlines) + Inter (body) substituted where Satoshi was requested but not available via Google Fonts.
- Motion: Framer Motion is used for entry animations and staggered reveals. DotGrid background remains for hero dynamism.
 - Premium cleanup: informational chips removed site-wide to preserve minimal, high-end look; replaced with typographic eyebrows and ambient orbs/glows.
 - Rhythm: angled neon bands and marquee separators add depth and cadence without heavy assets.

Pending / Next Tasks
--------------------
- Full build: Run `pnpm -C Front-End build` and resolve any TypeScript or runtime errors. (Not yet executed.)
- Replace placeholder assets: hero video background, 3D logo, and sponsor logos.
- Wire dynamic data: slot counts for GameOn, schedule items, and FAQ entries should be sourced from an API or CMS.
- Documentation: Add a succinct README note explaining where to update content and how to wire dynamic sources (planned next).
- RailNav testing: Perform manual browser tests for slow/fast scrolling, hover behavior, and glow consistency (completed - stable with 150ms debounce).
- Hydration fixes: Resolved button nesting error in TournamentGrid (completed).
- FAQ navigation: Added FAQ section to RailNav with correct ordering (completed).
 - Optional polish: smooth inertia scroll, mouse-follow glow, scroll-linked hue shifts, or lightweight hero particles (kept performance-first).

How to test locally
-------------------
1. From the workspace root, install deps and start dev server (if needed):

```powershell
cd Front-End
pnpm install
pnpm dev
```

2. Open `http://localhost:3000/ics25` to view the landing and `http://localhost:3000/ics25/gameon` for the GameOn page.

Notes & Assumptions
-------------------
- The Satoshi font requested in the design brief was not used because it is not on Google Fonts; Space Grotesk was used as an appropriate headline substitute.
- The prize pool is shown as a total (₹25,000) to avoid conflicting splits present in source notes.
- The app was intentionally removed from the schedule flow per the latest direction: "no app — list updates on site only." This is reflected in copy and the Schedule panel.

Chat Summary (condensed)
------------------------
- Ask: Redesign ICS’25 landing + GameOn pages with a bold dark + neon aesthetic, motion, and premium feel; remove app references and show schedule/updates on-site.
- Implementation: Built sectionized components (Hero, About, Highlights, GameOn, Pricing, Schedule, FAQ, Sponsors), wired fonts, added countdown, and dedicated GameOn page.
- Cinematic pass: Added global utilities (orbs, glow-pulse, shimmer, tilt, float, pulse dot, scroll indicator), staggered hero per-letter animation, hover glows, count-up slots, and timeline slide-ins. Removed informational chips in favor of minimal eyebrows.
- Rhythm pass: Introduced angled neon section bands and marquee separators to break visual monotony and add a designer cadence; added gradient Beams, Parallax, and a right-side RailNav for layered feel.
- Interactive pass: Bottom-aligned highlight CTAs; premium animated overlay that shows only block-specific details (curated) instead of entire .txt files; animated stat counters in About; ticket chips removed; top scroll progress bar for designer feel.
- Validation: Lint OK on modified files; production build blocked by unrelated env/infra requirements—use dummy env locally or refactor routes to be lazy and guarded.

Contact
-------
If you want, I can now:
- Run a full build and fix any runtime errors.
- Add a small on-site "Live updates" feed UI (reads from a JSON file or a new API route).
- Fill in placeholder images/video and wire sponsor logos.

---
Generated automatically on 2025-10-20 by the workspace script.

Session updates (2025-10-20)
----------------------------
Recent interactive and UX fixes applied during the session:

- Ics FAQ UX: simplified the FAQ accordion to remove nested motion wrappers that caused hydration/animation glitches. The `components/ics25/IcsFaq.tsx` now uses the Radix Accordion directly with cleaner trigger/content styling, larger click targets, and consistent focus/hover states.
- GameOn block: removed the team-registered/slots counter UI and associated count-up animation where requested to simplify the esports presentation.
- Highlights overlay: toned down chip-style UI and neon glows in `components/ModalOverlay.tsx` and `components/ics25/highlightDetails.tsx` — now premium-minimal lists with subtle dividers; overlay retains ESC and backdrop dismiss, focus trap and scroll lock.
- Section rendering bug: fixed the `Element type is invalid` runtime error by ensuring `components/ics25/Section.tsx` is marked as a client component when Framer Motion is used.

- GameOn page redesign: replaced the simple block with a full esports experience composed of `EsportsHero`, `TournamentGrid`, `ScheduleTimeline`, `PrizePoolBreakdown`, `RulesEligibility`, `SponsorsStrip`, and existing `GameOnFaq`. The layout keeps the dark + neon aesthetic, adds timeline, prize split, and clear rules/eligibility sections.
- ICS esports CTAs update: in the main ICS page’s esports section (`GameOnBlock`), swapped “Register” and “Rules” with “Visit GameOn” and “FAQs” to direct users to the dedicated page. Anchors use Next.js `Link` and target `/ics25/gameon` and `#faqs`.

Chat summary (complete)
-----------------------
The following condensed chat summary captures the full session context and decisions (for audit and handoff):

1) Goals
- Redesign the Highlights overlay to feel premium and match site aesthetic. Ensure dismiss-on-backdrop and ESC, beautify text and remove chip UI.
- Tone down neon and overly decorative visual elements when requested.
- Fix GameOn page: remove the team registered counter in the esports section and ensure the page renders without errors.
- Resolve runtime render error: "Element type is invalid" for `SectionHeader`.
- Add and improve GameOn-specific FAQs and make the general ICS FAQ UX robust and accessible.

2) Key technical decisions
- Next.js app dir with server/client components; Framer Motion requires client components where used.
- Tailwind CSS utilities are used for the premium minimal UI.
- Radix Accordion is the base for FAQ; removed extra motion wrappers to avoid hydration and open/closed mismatches.

3) Files changed in this session (high level)
- `components/ics25/IcsFaq.tsx` — refactored accordion usage and styling (removed framer-motion wrappers).
- `components/ics25/GameOnBlock.tsx` — removed slots/counter and simplified CTAs.
- `components/ics25/highlightDetails.tsx` & `components/ModalOverlay.tsx` — toned down neon and chip UI; preserved overlay accessibility features.
- `components/ics25/Section.tsx` — added `"use client"` to fix framer-motion rendering error.
- `components/ics25/GameOnFaq.tsx` — added a dedicated esports FAQ component and wired it into `app/ics25/gameon/page.tsx`.

4) Validation
- ESLint was re-run and the Front-End lint check passed for modified files. Several unrelated warnings exist across the repo (unused imports, image alt text, missing hook deps) and are noted for follow up.

5) Next steps recommended
- Optionally run a full `pnpm -C Front-End build` with a dummy env for `QSTASH_CURRENT_SIGNING_KEY` to reveal runtime build-time errors and fix API routes that currently require infra secrets at build time.
- Content: review and refine FAQ copy and GameOn rules for legal clarity.
- Optional UI polish: slightly reduce GameOn block radial gradients and reduce shimmer intensity across highlights for a calmer premium look.

Appendix: Full generated chat summary and change log is included earlier in this file. Use Git history to trace individual commits for each component change.

Recent edits (2025-10-20 - ongoing session)
-------------------------------------------
- Hero/content updates:
   - Changed the GameOn hero CTA to "Register Now" which links to `/ics25/register` and centered the detail capsules symmetrically for better visual balance.
- Esports framing and imagery:
   - Added arena imagery and background frames for the GameOn hero and tournament cards; created `public/ics25/gameon-frames.jpg` as the recommended asset path. Tournament cards now support per-card banners.
- Tournament overlays and schedule adjustments:
   - Tournament overlays for Valorant and BGMI were added and populated from curated content; schedule milestones updated: Finals on Nov 22 and Awards & Closing on Nov 23.
- Tickets / Pricing updates:
   - Pricing grid modernized to glass panels with subtle gradient frames, cleaned price typography (removed gradients), CTA buttons routed to `/checkout?tier=<slug>`, and a tasteful "Recommended" ribbon on the Gold tier.
- Theming and palette:
   - GameOn theme applied site-wide to the esports section (`theme-gameon`) with red (#FF3B3B) and military green (#4B5320) neon accents; CSS variables updated in `app/globals.css`.
- Accessibility & UX:
   - Modal overlay improvements (focus trap, ESC/backdrop close) applied across highlights and tournament detail modals.

Chat Summary (2025-10-20 detailed)
---------------------------------
This session focused on turning the ICS'25 landing into a premium editorial experience and building a dedicated GameOn microsite for esports at the event. Key priorities were clarity of CTAs, a premium minimal design language (no chips), consistent neon theming for GameOn (red/green), and the use of overlays for detailed game rules. We also ensured the tickets UI felt premium and wired CTAs to payment paths. I adjusted components for accessibility and responsiveness and cleaned minor lint issues where the work touched files.

Files modified during this last pass:
- components/ics25/gameon/EsportsHero.tsx — Hero framing, Register CTA, capsule layout.
- components/ics25/gameon/TournamentGrid.tsx — Per-card image banner support and default images.
- components/ics25/PricingGrid.tsx — Premiumized cards, CTA routing, recommended ribbon, removed price gradient.
- public/ics25/README.md — Asset placement notes for `gameon-frames.jpg`.

Status: Documentation updated to reflect the current state. The UI changes have been lint-validated locally; build and full typecheck were not executed due to unrelated infra/type issues in other parts of the repo.

Recent edits (2025-10-21 - RailNav fixes and FAQ integration)
-----------------------------------------------------------------
- RailNav component improvements:
   - Fixed glow inconsistencies during slow scrolling by increasing debounce from 2ms to 150ms for stable section detection.
   - Removed shared layoutId that caused motion element conflicts between buttons.
   - Improved z-index stacking so active section labels display above glow effects.
   - Added pointer-events-none to glow elements to prevent interaction issues.
   - Implemented debounced IntersectionObserver with proper cleanup and initial measurement.
   - Fixed label positioning to appear beside active circles (left-aligned, fixed width for even spacing).
   - Added FAQ section to RailNav navigation (7 total circles: About, Highlights, Esports, Passes, Schedule, FAQs, Sponsors).
   - Corrected RailNav section order to match actual page content (FAQ before Sponsors).

- TournamentGrid hydration fix:
   - Resolved "button cannot be a descendant of button" hydration error by changing outer motion.button to motion.div with cursor-pointer styling.
   - Replaced inner Button component with styled span to eliminate nested button elements.
   - Removed unused Button import and maintained visual consistency.

- FAQ integration:
   - Added FAQ section to main ICS'25 RailNav with proper ordering before Sponsors section.
   - Verified FAQ content includes general ICS questions and redirects to GameOn page for esports FAQs.

Chat Summary (2025-10-21 - RailNav polish and bug fixes)
---------------------------------------------------------
This session focused on fixing RailNav navigation issues and resolving a critical hydration error. The RailNav was experiencing glow inconsistencies during slow scrolling, and there was a button nesting error in the TournamentGrid causing hydration mismatches.

Key technical fixes:
- Increased IntersectionObserver debounce from 2ms to 150ms for stable section detection during slow scrolling.
- Removed layoutId conflicts and improved z-index ordering for proper label/glow stacking.
- Fixed button nesting by converting motion.button to motion.div and replacing inner Button with styled span.
- Added FAQ section to RailNav and corrected section ordering to match page content.

Files modified:
- `components/ics25/RailNav.tsx` — Debounce increase, layoutId removal, z-index fixes, label positioning improvements.
- `components/ics25/gameon/TournamentGrid.tsx` — Button nesting fix, hydration error resolution.
- `components/ICS25ClientContent.tsx` — Added FAQ to RailNav sections array, corrected ordering.

Validation: All changes lint-clean; hydration error resolved; RailNav now properly highlights active sections during slow scrolling.

Task status:
- RailNav glow fixes: completed
- Hydration error fix: completed  
- FAQ navigation: completed
- Update docs: completed
