---
name: Always run eslint alongside tsc
description: tsc and eslint check different things — running only tsc misses unused vars, bad imports, let/const issues. Must run BOTH after every phase.
type: feedback
originSessionId: ec211e6e-f4aa-4e7b-bf44-a171a1990deb
---
Run BOTH after every phase, not just tsc:
```
npx tsc --noEmit --skipLibCheck
npx eslint <changed-files> --quiet
```

**Why:** Session 2026-05-02 shipped 22+ eslint warnings across multiple commits because only tsc was run. Unused imports, `require()` instead of `import`, `let` on never-reassigned vars — all invisible to tsc but caught by eslint.

**How to apply:** After every phase/commit, run eslint on the changed files. Fix all warnings before reporting done. This is Rule 4.
