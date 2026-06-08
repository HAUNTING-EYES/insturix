---
name: mg-no-preset-menu
description: "MG must dissolve the graphicType preset menu — signals gate IF a graphic appears, content shapes WHAT, engine generates; render is already generative"
metadata: 
  node_type: memory
  type: project
  originSessionId: 21697ecc-4b7d-412d-9a77-816727f4b599
---

**Decided 2026-05-31** (user-confirmed). The MG `graphicType` enum (keyword-highlight / stat-counter / callout / quote-card / lower-third / logo-reveal) is a PRESET MENU and violates the no-presets thesis (Rule 11 / 29N).

**Why:** the render engine is ALREADY generative (`planComposition` + content-shape analysis + structural moves build from primitives). But it's fronted by an LLM picking a type LABEL from a fixed enum — that selection layer is the preset, and `keyword-highlight` (the catch-all default) makes every video look the same (8/13 measured).

**How to apply:** Do NOT build features that pick or tune graphic TYPES. Build selection as: signals decide IF a graphic appears (incl. legitimately zero); the content there decides WHAT (number/name/phrase → shape); the engine generates the treatment from shape × signals × brand. The "type" EMERGES; never chosen from a list. So G-7 = "dissolve the type menu," NOT "calibrate keyword firing" (the deferred G-7a prompt-eval was tuning inside the preset paradigm — superseded).

**Candidate HOW (open):** reuse the overlay-as-signals scoring infra (`scoreAllOverlays`) — overlays described BY signals, video signals select/shape them — extended from MG *properties* to the graphic-appearance decision itself.

**THE OPEN RISK:** will it LOOK GOOD or be a "dirty mashup"? Signals are NOT what make it look good. Needs a coherence layer (one visual language per moment — the spine), design guardrails (auto-correct contrast/clutter/safe-zone), restraint (one focal), + calibration. Prove on real renders before committing.

Vault: `D:\Insturix-Brain\03-Decisions\D-017-MG-Dissolve-Type-Preset-Menu.md`. [[mg_render_harness]]
