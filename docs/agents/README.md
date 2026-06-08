# docs/agents — migrated agent knowledge base

The accumulated context from this project's prior Claude-Code sessions, migrated in-tree so Codex (or
any agent) can read it without external paths. **Start at the repo-root `AGENTS.md`.**

## Layout
```
docs/agents/
├── SESSION-INDEX.md           # numbered index of every session, per workstream
├── sessions/
│   ├── editron/      (45)     # Editron-NN-<original>.md, oldest→newest by date
│   ├── uiux/         (4)
│   ├── thinkforge/   (2)
│   ├── alyzitron/    (0)      # no standalone sessions — see reference/
│   └── general/      (21)     # daily / cross-cutting handovers
├── reference/                 # non-session knowledge, per workstream (114 files)
│   ├── editron/      (33)     # visions, audits, architecture-truth, prompts, tech inventory
│   ├── uiux/         (5)      # UIUX_RULES, design_system_v1, design_philosophy
│   ├── thinkforge/   (3)
│   ├── alyzitron/    (1)
│   └── general/      (72)     # cross-project visions, rules, feedback/lessons, status, audits
└── vault/                     # the Obsidian "second brain", distilled (72 files)
    ├── 00-Index.md
    ├── 01-Research/  (12)
    ├── 02-Architecture/ (27)  # ← MG-Overlay-Infrastructure-Complete-Map is here (read first for MG)
    ├── 03-Decisions/ (15)     # D-001..D-017 architectural decisions
    ├── 05-Bugs-and-Issues/ (6)
    ├── 06-Resources/ (2)
    └── 07-Roadmap/   (9)
```

## How to use it
- **Onboarding:** `AGENTS.md` → `SESSION-INDEX.md` → `vault/00-Index.md`.
- **Working on a subsystem:** read the latest 1–2 sessions for that workstream + the matching `reference/<ws>/` + `vault/02-Architecture/`.
- **Before touching Motion Graphics:** `vault/02-Architecture/MG-Overlay-Infrastructure-Complete-Map-2026-06-03.md`.
- **User rules / how the human works:** `reference/general/user_rules_absolute.md`, `reference/general/feedback_*.md`, `reference/uiux/UIUX_RULES.md`, and the prior `CLAUDE.md` at the repo root.

## Provenance & caveats
- Copied 2026-06-04 from the Claude-Code memory store + the Obsidian vault (`D:\Insturix-Brain`). Those remain the live sources; this is a point-in-time snapshot.
- Session **numbering is by date** (so it lines up with "Editron 41/44" labels) — not a guaranteed match to any external canonical list; re-label if needed.
- "General" sessions are untagged daily handovers (often Editron-heavy); re-file as desired.
- These are **internal working notes** (candid, sometimes superseded). Treat the newest session + the `vault/` architecture docs as the current truth; older notes may be stale.
