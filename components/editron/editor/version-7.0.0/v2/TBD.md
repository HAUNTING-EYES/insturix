# Editron editor v2 — TBD / remaining

Preview route: `/dashboard/editron/project/[projectId]/v2` (via `ReactVideoEditor variant="v2"`). v1 is untouched. Everything below is **runtime-unverified** — the `/v2` route is authed and local `next build` is EPERM-broken, so it only truly renders on Vercel.

## Bugs to investigate (founder-reported)
- [ ] **Quality Review modal renders see-through** — the video canvas is faintly visible *through* the modal sheet. The Modal primitive sheet is `bg-surface-raised` (opaque in code), so either that class isn't rendering on this route or `QualityReviewPanel` paints its own transparent/overlay surface. Investigate on Vercel; likely fix = force an opaque bg on the modal body or the panel root. `v2/modals/v2-modals.tsx`.

## Functional gaps (the "last mile")
- [ ] **Double-editor** — the other tool-panel tabs (Text / Video / Image / Captions / Sound) still render the real v1 `*-panel`, which pops its own details editor on selection. That's redundant with the new right props panel. Fix = v2-native **browse-only** twins for those tools (text presets, media search, etc.), same pattern as `v2-assets-panel.tsx`.
- [ ] **Clip trim handles** are still the v1 gray grips, not the v6 gold edge bars. Minor; render v2 gold handles that call the same `handleMouseDown('resize-start'|'resize-end')`.
- [ ] **AI Activity tab** stays empty — `react-video-editor.tsx` hardcodes `aiActions: []`. Backend must populate it from the chat stream.
- [ ] **Named-markers persistence** — client POSTs `markers`, but the autosave/save routes + project GET must persist/return it (schema may whitelist fields). In-session works; cross-reload unverified.
- [ ] **Mobile preview** — no real provider; currently a "coming soon" placeholder.
- [ ] **Props › Scale** is read-only (keyframe-track only; no base field). Fine, but noted.

## Deferred by decision
- [ ] Keyframe dock (v6 docked editor) — clip diamonds + the keyframe inspector already cover it.
- [ ] Multi-select, versioned recovery list, generated-scene seed.

## Done (for reference)
- Shell (header w/ real project name + gold render, canvas w/ clean radial backdrop, transport)
- Tool rail + Assets panel (MEDIA/LOTTIE/EXTRACT over real media hook)
- Props panel (full per-type editor on the right, real fields)
- Timeline (real drag/snap/zoom engine, v6 clips: glyph + width-gated name + hover-reveal, no spill)
- AI panel (Chat/Suggestions real, Activity native) + Render/Recovery/Quality/Mobile modals
- Named-marker persistence client wiring + recovery loadState

## Final step
- [ ] Once approved on Vercel: **swap `/v2` into the main editor route** (point the project route at `variant="v2"` / retire v1 chrome).
