---
name: Code Review Graph — Query Cheatsheet
description: SQL snippets for the code-review-graph SQLite DB at .code-review-graph/graph.db. Use for structural questions (callers, callees, blast radius, containment). Grep is still the right tool for string-based lookups (tool name registries, feature flags, env vars).
type: reference
last_updated: 2026-04-19
originSessionId: 6b272c7c-4888-4c9b-8caf-d84e6c03234f
---
# Code Review Graph — Query Cheatsheet

The graph lives at `.code-review-graph/graph.db` in the repo root. It's plain SQLite. Query it with `python -c "import sqlite3; ..."` or any SQLite client.

**When to use this instead of grep:**
- Finding all callers of a function (blast radius before a rename/change)
- Finding what a function calls (helper exploration)
- Containment queries (all functions in a file, all methods of a class)
- Import graph queries (who imports what)

**When grep is still correct:**
- String-based tool registries (LangChain tools dispatched by name)
- Env var usage
- Comment / string literal searches
- JSON / config file content

---

## Keeping the graph fresh

```bash
cd <repo>
code-review-graph update        # incremental, fast, run after commits
code-review-graph status        # verify last_updated + commit SHA
```

If `git_head_sha` in metadata differs from actual HEAD, re-run `update`.

---

## Schema at a glance

| Table | Purpose |
|---|---|
| `nodes` | Functions, classes, files (id, kind, name, qualified_name, file_path, line_start, line_end, signature) |
| `edges` | Relationships (kind: `CALLS` / `CONTAINS` / `IMPORTS_FROM` / `TESTED_BY`, source_qualified, target_qualified, file_path, line) |
| `nodes_fts` | Full-text search on node names/signatures |
| `communities` | Auto-detected module clusters (may be empty — algorithm-dependent) |
| `flows` | Named control/data-flow paths (often empty) |

Edge kinds (typical counts on this repo):
- `CALLS` ~32k — function-to-function
- `CONTAINS` ~17k — file→function, class→method
- `IMPORTS_FROM` ~9k — module imports
- `TESTED_BY` ~100 — test coverage

---

## Common queries

### 1. Blast radius — who calls function X?

```python
import sqlite3
con = sqlite3.connect('.code-review-graph/graph.db')
cur = con.cursor()
cur.execute("""
  SELECT DISTINCT source_qualified, file_path, line
  FROM edges
  WHERE kind='CALLS' AND target_qualified LIKE ?
  ORDER BY file_path, line
""", ('%FUNC_NAME%',))
for r in cur.fetchall(): print(r)
```

### 2. Subgraph — what does function X call?

```python
cur.execute("""
  SELECT DISTINCT target_qualified, line
  FROM edges
  WHERE kind='CALLS' AND source_qualified LIKE ?
  ORDER BY line
""", ('%FUNC_NAME%',))
```

### 3. All functions in a file

```python
cur.execute("""
  SELECT name, qualified_name, line_start, line_end, kind
  FROM nodes
  WHERE file_path LIKE ? AND kind IN ('Function','Class')
  ORDER BY line_start
""", ('%lib/editron/services/asset-briefing.ts%',))
```

### 4. Imports of a module

```python
cur.execute("""
  SELECT DISTINCT source_qualified
  FROM edges
  WHERE kind='IMPORTS_FROM' AND target_qualified LIKE ?
""", ('%asset-briefing%',))
```

### 5. Full-text search across node names/signatures

```python
cur.execute("""
  SELECT n.name, n.file_path, n.line_start, n.kind
  FROM nodes n JOIN nodes_fts f ON n.id = f.rowid
  WHERE nodes_fts MATCH ?
  LIMIT 50
""", ('compressAnalysis OR assetBriefing OR five_track',))
```

### 6. Find a function's signature quickly

```python
cur.execute("""
  SELECT qualified_name, signature, file_path, line_start
  FROM nodes
  WHERE kind='Function' AND name = ?
""", ('FUNC_NAME',))
```

### 7. Test coverage for a module

```python
cur.execute("""
  SELECT source_qualified AS test, target_qualified AS covers, file_path
  FROM edges
  WHERE kind='TESTED_BY' AND target_qualified LIKE ?
""", ('%lib/editron/%',))
```

### 8. "Dead-end" functions (never called — potential dead code)

```python
cur.execute("""
  SELECT n.qualified_name, n.file_path, n.line_start
  FROM nodes n
  WHERE n.kind='Function'
    AND n.is_test = 0
    AND NOT EXISTS (
      SELECT 1 FROM edges e
      WHERE e.kind='CALLS' AND e.target_qualified = n.qualified_name
    )
  ORDER BY n.file_path
  LIMIT 50
""")
```

(Many will be legitimate entry points — route handlers, exported helpers, React component exports. Filter further.)

### 9. Transitive callers (depth-2 "who calls something that calls X")

```python
cur.execute("""
  SELECT DISTINCT e2.source_qualified
  FROM edges e1
  JOIN edges e2 ON e2.target_qualified = e1.source_qualified
  WHERE e1.kind='CALLS' AND e2.kind='CALLS'
    AND e1.target_qualified LIKE ?
""", ('%FUNC_NAME%',))
```

---

## Gotchas / limits

- **Graph doesn't track runtime tool dispatch.** LangChain `tool({name:'add_transition', ...})` invoked by string lookup registers as zero callers in the graph. For tool registries, grep `'add_transition'` (the string).
- **Dynamic `require()` / `await import()` with variable names** won't appear as CALLS. Static `import` is fine.
- **Windows codec gotcha:** `detect-changes` subcommand crashes on commits with unicode chars (→, emoji) in messages. Pass `PYTHONIOENCODING=utf-8` or avoid unicode in commit titles for CI usage.
- **`.code-review-graph/wiki/index.md` is often empty** — the community-detection algorithm rarely finds strong clusters in Next.js monorepos. Not a bug.
- **Graph is branch-local.** `git_branch` in metadata tells you which branch the graph was built on. Switching branches without re-running `code-review-graph update` gives stale results.

---

## Helper: one-liner for "who calls X"

For quick ad-hoc lookups without writing Python:

```bash
python -c "
import sqlite3, sys
q = sys.argv[1] if len(sys.argv) > 1 else ''
con = sqlite3.connect('.code-review-graph/graph.db')
for r in con.execute(\"\"\"SELECT DISTINCT source_qualified, file_path, line FROM edges WHERE kind='CALLS' AND target_qualified LIKE ? ORDER BY file_path, line\"\"\", (f'%{q}%',)):
  print(' ' + ' '.join(map(str, r)))
" FUNC_NAME
```

Or drop this into `scripts/graph-callers.mjs` / `.py` as a repo utility.

---

## When this cheatsheet becomes stale

The graph schema version is stored in `metadata.schema_version`. Current: `5`. If the version bumps, some queries here may need updating — re-run `PRAGMA table_info(nodes)` / `table_info(edges)` to verify columns.
