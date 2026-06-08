---
tags: [roadmap, motion, zoom, enhancement, focal-zoom, ken-burns, backlog]
date: 2026-06-04
status: backlog — founder-requested 2026-06-04
relates: [[Zoom-Phase-3.1-Diagnosis-2026-06-03]], [[MG-Overlay-Infrastructure-Complete-Map-2026-06-03]]
---

# Roadmap — Focal Zoom (zoom-on-a-point / Ken Burns)

## The idea (founder, 2026-06-04)
Zoom isn't only uniform in/out. A real editor zooms *toward a point* — a face, a product, a stat — which is **scale + x/y frame movement** (a focal push / Ken Burns). The engine can't do this today.

## Current limitation (VERIFIED in code)
Zoom today is **uniform center scale only**: `applyZoom` (`lib/editron/services/edl-executor.ts`) → `buildZoomKeyframes` (`lib/editron/services/zoom-keyframes.ts`) pushes a single `property:'scale'` keyframe track, scaled around frame center. There is **no x/y (position/translate) track** in the zoom path. So every zoom is centered — you cannot push toward an off-center subject.

## The enhancement
Add a **focal point** (x, y in [0,1]) to a zoom → emit a `scale` track AND `x`/`y` translate tracks so the frame scales *while panning* to keep/centre the focal point. = a focal push / Ken Burns.
- Direction still governed by scaleFrom/scaleTo (the fixed convention, commit `d3991d02`); the focal point adds translation.
- Pull-backs can also re-centre (pan back to centre as they widen).

## Focal point comes from signals we ALREADY have (no new perception)
- **V-JEPA face boxes / `visual.face_present` / `visual.eye_contact`** → focal point = the face/eye region.
- **`visual.significance`** → the most visually distinct region.
- Fallback: rule-of-thirds / centre when no salient subject.
So this is *wiring + a translate track*, not new analysis.

## Where it plugs in
- `zoom-keyframes.ts` → extend `buildZoomKeyframes` to also return x/y tracks (or a sibling `buildFocalZoomTracks`).
- `applyZoom` (`edl-executor.ts`) → push the x/y tracks alongside scale; derive the focal point from the decision's signals.
- Brief/registry → optionally carry a `focalPoint` on a zoom decision (or compute downstream from face boxes).
- **VERIFY FIRST:** does the version-7.0.0 overlay renderer apply x/y keyframe tracks to *video* overlays? (It interpolates keyframeTracks; confirm `x`/`y`/position is supported on video overlays before building — do not assume.)

## Placement / effort
Phase 3/4 enhancement, after the pull-back direction fix (`d3991d02`). Medium: translate track + focal-point computation + render-side verification. Adversarial-test across content (no face → graceful centre fallback; multiple faces; moving subject — Rule 29).

## Status
Backlog — logged 2026-06-04 per founder. Not started. Builds on the zoom direction fix (`d3991d02`).
