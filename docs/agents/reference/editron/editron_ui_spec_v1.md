---
name: Editron UI/UX Spec v1.0 — Locked
description: Editron editor screen spec. Topbar + 52px rail + center preview + 300px drawer + dynamic timeline + chat pill. Source at D:\google downloads\editron-spec (1).md. Companion JSX at D:\google downloads\InsturixEditor.jsx (2534 lines)
type: project
originSessionId: 8d7e7000-8452-489c-81f8-105084b2ef5c
---
# Editron UI Spec v1.0

**Source:** `D:\google downloads\editron-spec (1).md` (473 lines)
**Prototype:** `D:\google downloads\InsturixEditor.jsx` (2534 lines, working)

## Layout
- Topbar: 44-48px | Rail: 52px (labeled, Pipeline+Layers) | Drawer: 300px (when open) | Timeline: 200-280px dynamic

## Rail
- Pipeline: Prompt → Script → Edit → Analyze → Deliver (gated)
- Layers: Script (gold), Video (red), Captions (green), Music (pink), Graphics (purple)
- Each layer: 32x32, 2-letter mono abbrev, color indicator

## Inspector (floating → drawer escalation)
1. No layer selected → no inspector
2. Layer selected → floating quick-panel (200-240px, 3-5 props, "More controls →")
3. "More controls →" → drawer slides in (300px, Basic|Advanced tabs, scroll memory per layer+tab)
4. Backend: if user opens drawer >3x without floating interaction → skip to drawer

## Timeline
- Dynamic track widths: focused = 80px, others = 16px, unused 90s = 8px
- Playhead: gold vertical line with ball
- J/K/L scrub, I/O in/out, Space play/pause

## Chat Pill
- Fixed bottom-right, 20px from edges, "Ask anything" + ⌘K badge
- Expands to 360-420px wide, 60vh tall, contextual suggestions per layer
- Never modal — preview/timeline stay active

## Gallery Modal
- 820x560px, 11 categories, Brand/Recent/Favorites filters
- Hover-to-preview on user's actual content (signature feature)
- Shift+click = apply + keep open

## Screens Not Yet Designed
- Dashboard, Project creation, Client approval, Export/delivery, Settings/billing
