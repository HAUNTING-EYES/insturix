# Commit History Audit — 2026-05-31 (R21N)

Covers commits since the last audit (`commit_history_audit_2026_05_22.md`). Branch `infrastructure-improvs-+Editron`, all pushed to `origin` (Insturix/Front-End). The 9-day gap (05-23 → 05-31) accumulated ~150 commits across prior sessions that were never logged in an audit doc — clustered below with SHA anchors + handover pointers; this session's 2 commits in full.

## THIS SESSION (2026-05-31, accountable in detail)
| SHA | Type | Scope | Verification | Cluster |
|---|---|---|---|---|
| `e46569d2` | fix | **Phase 0.1 — wire MG font loading.** NEW `lib/editron/motion-graphics/mg-fonts.ts` (static top-level `@remotion/google-fonts` loadFont: Plus Jakarta Sans/JetBrains Mono/Inter, 12 fetches<20, Lambda-safe by precedent) + side-effect import in `motion-graphic-layer-content.tsx`. 2 files. | tsc +0/196, eslint clean, render-verified proj_OzG2qgoYudFa 13/13, before/after PNGs (real fonts + callout overflow fixed) | MG-Spine Phase 0 |
| `cca42eb1` | feat | **Phase E — MG design gate (observe-mode).** `structural-gate.ts` + per-role CRG font floors (counter 64/primary 48/secondary 36/label 36/72) + focal-hierarchy check + structured WOULD-SUPPRESS log. Observe-only (no output change). 1 file. | tsc +0/196, eslint clean, self-test all 4 checks fire, sweep 0/36 would-suppress (0% FP) via untracked `scripts/eval-mg-gate.ts` | MG-Spine Phase E |

**No reverts. No business-logic changes outside MG render path. Both observe/additive (0.1 adds font loading; E adds logged-not-acted checks).**

⚠️ **DEPLOY NOTE (R16):** the 0.1 font change alters what the renderer produces → the **Remotion Lambda bundle must be resynced on the next prod deploy** for fonts to take effect in production renders (preview already has it). Deploys are user-driven via the Vercel dashboard from `main` (R24N).

## GAP PERIOD 05-23 → 05-31 (clustered backfill; narrative in the handovers)
- **GSAP animation backbone (D-015-GSAP)** — `1d2e6a08`→`62d7d932` (Phase 0-8: gsap-config/presets, dashboard+landing entrances, scroll perf). Handover: `session_handover_2026_05_27_gsap_editfloor`.
- **Landing/marketing scroll motion** — `0722af37`/`286b61b6`/… + Phases 1-6 (`a2d1404a`→`ea5c763d`), Lenis (`d5bd2a69`), film strip (`ed95be09`/`88d99abf`). Handover: `session_handover_2026_05_27_scroll_motion`.
- **MG engine Phase 0-1 + renderer tiers** — `a03b0717`/`6a5b5d53`/`7603ed27`/`605a76e4`/`4cd0e1ba`/`58b69181`/`bf803ac7`. Handover: `session_handover_2026_05_27_mg_renderer_calibration`.
- **Utility AI engine (D-014)** — `8c947288`/`1fe5e7ea`/`29a319a6`/`a92dc03c` (scorer, 59 overlays, signal bridge, live mode). Handover: `session_handover_2026_05_24_mg_engine_complete`.
- **YouTube calibration pipeline** — `5e3f96ba`/`fffedeec`/`b2b3bf6e` + threshold bandit (`a5fe49e5`/`be143558`).
- **D-016 profile removal** — `8d296acb`/`b18f8a92`/`629cfd95` (Phases 1-3B partial; see [[Doc-vs-Code-Reconciliation-2026-05-31]] — profiles still partly wired).
- **MG Tier 3 "no presets"** — `83a1debc`/`95a4046f`/`2eab984b`/`51372761`/`b6ad3079`/`4fbac832`. Handover: `session_handover_2026_05_30_mg_tier3`.
- **Signal-pipeline "monotony onion" fixes** — `5d2e1223`→`ceb6ae8f` (backdrop opacity, stat rendering, graphicsDensity thread, QStash double-fire/'800s' unit, per-frame signals `8017a70a`, idempotency guard). Handover: `session_handover_2026_05_30_mg_signals_design`.
- **G-1/G-2/G-1b brushwork** — `404a8e38`/`d9fe9485`/`42a01786`. Handover: `session_handover_2026_05_31_mg_g1_brushwork`.
- **Grok STT / Essentia / TRIBE Phase-2 worker** — `16a7fa4b`/`26575af8`/`01c1aa1a`/`c7aee298`/`7e0f4d18`.
- **Reliability** — `0925815d` (63 silent-catch warns, R11.75N), `97e3a9d4`, model-factory centralization (`97fcde07`/`329ab3ef`).

(Full per-commit narrative lives in the dated session handovers; this audit anchors the SHAs so the ledger isn't silently missing the gap. Future sessions: keep this current per R21N — one entry per commit, same response.)
