---
name: UI/UX System Audit — May 3, 2026
description: Complete audit of all rules, docs, graphs, skills, MCPs mapped for full-site UI/UX work. What's pipeline-specific, what's universal, what's missing.
type: project
originSessionId: 8d7e7000-8452-489c-81f8-105084b2ef5c
---
# UI/UX System Audit — 2026-05-03

## Purpose
Audited ALL existing systems (rules, docs, memory, graphs, skills, MCPs) to identify what's Editron-pipeline-specific vs what applies to full-site UI/UX redesign work.

---

## 1. RULES

### Universal (apply to all UI/UX work)
R1 (clean before refactor), R2 (phased execution ≤5 files), R3 (senior dev override), R4 (forced verification tsc+eslint), R5 (sub-agent swarming >5 files), R6 (context decay re-read), R7 (file read budget), R9 (edit integrity), R10N (no assumptions), R12N (Priyank standard), R16 (production-level), R17N (deliberate), R23N (never MVP), R24N (never deploy prod)

### Extended for UI/UX
R0 → universal *user type* compat (agency, brand, creator). R11N → entire *user experience*. R18N → *design system compliance*. R19N → "would a UI designer / typographer do it this way?"

### Pipeline-only (skip for UI work)
R7N (Ken Burns), R8N (script duration), R9N (understand assets), R11.5N (A3 decision log), R11.75N (Toyota audit), R20N (pipeline investigations)

### NEW: UIUX_RULES.md — 20 rules created this session
UI-1 (token-only values), UI-2 (anti-pattern checklist), UI-3 (gold = decisions), UI-4 (two fonts three weights), UI-5 (mono label pattern), UI-6 (letter spacing), UI-7 (three durations one easing), UI-8 (five animations), UI-9 (progressive disclosure), UI-10 (chat escape hatch), UI-11 (UI for picking chat for describing), UI-12 (row-based progress), UI-13 (timestamp-click-to-scrub), UI-14 (floating→drawer escalation), UI-15 (topbar pattern), UI-16 (card pattern), UI-17 (score color buckets), UI-18 (domain expert for UI), UI-19 (no product names in UI), UI-20 (focus & keyboard)

---

## 2. DOCS (103 files, ~23,400 lines)

### UI/UX relevant
- `DESIGN_LANGUAGE.md` (root) — **STALE. Uses old zinc palette, Space Grotesk + Inter. Superseded by design system v1.0**
- `docs/UPLOADERX_WALKTHROUGH.md` — UploaderX UI flow
- `Documentation/Features/Billing/` — credits, plans UI (3 files)
- `Documentation/Operations/Admin/` — admin dashboard (18 files)
- `Documentation/Services/Clickatron/` — Clickatron UI (4 files)
- `README.md` — product overview, 6 products

### Pipeline-only (skip)
- `DIRECTOR_KNOWLEDGE_BASE.md` — 1,529 lines, editing intelligence rules
- `docs/EDITRON_SYSTEM_CAPABILITIES.md` — Editron features
- `docs/KNOWLEDGE_GRAPH_ARCHITECTURE.md` — Neo4j/Graphiti design
- `docs/TRIBE_HUMAN_INTEGRATION_PLAN.md` — V-JEPA2 integration
- `alyzitron_migration.md` + `ALYZITRON_COMPLETE_MIGRATION_ROADMAP.md` — backend migration

---

## 3. MEMORY

### UI/UX critical (read before UI work)
- `design_system_v1.md` — **THE source of truth** for all visual decisions
- `editron_ui_spec_v1.md` — Editor screen spec + JSX prototype
- `alyzitron_ui_spec_v1.md` — Analysis tool spec + JSX prototype
- `UIUX_RULES.md` — 20 UI/UX-specific rules
- `insturix_vision.md` — automatic car model, user types
- `project_rebrand.md` — rebrand active

### Pipeline-specific (skip for UI work)
- `editron_architecture_truth.md`, `editron_master_remaining.md`, `system_architecture_map.md`, `stable_v2_snapshot.md`, `pipeline_investigations.md`, `pipeline_audit_*`, `session_handover_*`, `commit_history_audit_*`, `toyota_reliability_audit.md`, `creative_production_knowledge.md`, `phase_a3_decision_log.md`

---

## 4. GRAPHS

| Graph | Nodes | Edges | UI coverage | Action |
|---|---|---|---|---|
| Graphify | 4,959 | 7,436 | ~10% UI, ~90% pipeline | Run `graphify update` after building new UI components |
| CRG | 377 | 3,124 | ~10% UI | Same |

---

## 5. SKILLS (13 installed)

### For landing page / UI work
| Priority | Skill | Lines | Use |
|---|---|---|---|
| **1st** | `frontend-design` | 43 | Creative direction before coding |
| **2nd** | `bencium-controlled-ux-designer` | 739 | Design decisions, accessibility |
| **3rd** | `web-design-guidelines` | 40 | Review pass before shipping |
| **4th** | `ckm-ui-styling` | 325 | shadcn + Tailwind patterns |
| **5th** | `vercel-react-best-practices` | 150 | Perf optimization |
| **6th** | `vercel-composition-patterns` | 90 | Component API design |
| **7th** | `vercel-react-view-transitions` | 320 | Page/route transitions |
| Ref | `ui-ux-pro-max` | 659 | UX guideline queries |
| Ref | `ckm-design-system` | 245 | Token architecture reference |

### Not needed for landing page
`ckm-banner-design`, `ckm-brand`, `ckm-design`, `ckm-slides`

---

## 6. MCPs

| MCP | UI/UX use | Priority |
|---|---|---|
| **Claude Preview** | Start dev server, screenshot, verify visually | **CRITICAL** |
| Session management | Chapter marking, task spawning | Active |
| Desktop Commander | File ops | Low |
| Claude in Chrome | Superseded by `/browse` | Don't use |
| Gmail/Calendar/Drive | Not relevant | Skip |

---

## 7. STALE FILES (contradict design system v1.0)

| File | Problem | Action |
|---|---|---|
| `DESIGN_LANGUAGE.md` (root) | Old zinc palette, Space Grotesk, blue accent | Mark superseded or replace |
| `app/globals.css` (1,097 lines) | Glassmorphism, zinc variables, wrong fonts | Replace with design system tokens |
| `tailwind.config.ts` | Points to Inter, old breakpoints | Update with design system values |
| `lib/themeConfig.ts` | Blue accent `#3b82f6`, wrong gradients | Replace entirely |
| `app/layout.tsx` | Loads Inter, Space Grotesk, Caveat | Swap to Plus Jakarta Sans + JetBrains Mono |

---

## 8. PRE-EDIT HOOK (updated this session)

`.claude/settings.json` now has 24-item checklist:
- Items 1-16: AGENT_RULES (code quality, safety, process)
- Items 17-24: UIUX_RULES (colors, fonts, weights, sizes, spacing, gold, anti-patterns, disclosure)

Fires on every Edit/Write tool call.

---

## 9. REFERENCE ARTIFACTS (source files for redesign)

| File | Lines | What |
|---|---|---|
| `D:\google downloads\design-system (2).md` | 628 | Full design system spec |
| `D:\google downloads\editron-spec (1).md` | 473 | Editron editor spec |
| `D:\google downloads\alyzitron-spec (1).md` | 830 | Alyzitron spec |
| `D:\google downloads\InsturixEditor.jsx` | 2,534 | Editor prototype |
| `D:\google downloads\Alyzitron (2).jsx` | 1,128 | Alyzitron prototype |
| `D:\google downloads\insturix-editor-v6 (1).jsx` | 747 | Homepage/marketing prototype |

---

## 10. ISOLATION

UI/UX work runs in separate git worktree branch `uiux-redesign` to avoid conflicts with:
- `infrastructure-improvs-+Editron` (Editron pipeline work)
- `thinkforge-enhancementsV2` (ThinkForge work)
- `clean-pr-branch` (Harsimran's Alyzitron)
