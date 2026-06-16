---
name: Parallel branch work — ThinkForge + Editron worktree setup
description: Two branches active via git worktree. Editron on main dir, ThinkForge on worktree. Never switch branches — use the correct directory.
type: project
originSessionId: ea53af26-aa8f-43f1-9697-8600c5715b86
---
Two branches active in parallel as of 2026-04-26, using git worktree:

- `D:\google downloads\Front-End-main\Front-End-main\` → `infrastructure-improvs-+Editron` (Editron session)
- `D:\google downloads\Front-End-main\thinkforge-worktree\` → `thinkforge-enhancementsV2` (ThinkForge session)

**Why:** User works on both products concurrently in different Claude Code sessions. Worktree prevents branch-switch conflicts between sessions.

**How to apply:** NEVER run `git checkout` to switch branches. Each directory is permanently locked to its branch. Commits in either directory share the same git database. Push from whichever directory has the changes.

**Vercel deploys from:** `haunting` remote (`github.com/HAUNTING-EYES/insturix`), NOT `origin` (`github.com/Insturix/Front-End`). Always `git push haunting <branch>` to trigger deploys.
