# TODO: Full Codebase Knowledge Capture

## Status: #deferred

## What
Document the ENTIRE Insturix codebase into the Obsidian vault. Every service, every module, every significant file — what it does, who calls it, what depends on it, known issues.

## Why
The vault currently captures research, architecture decisions, and session context. But the actual codebase knowledge (what each file does, how services connect, data flows, hidden gotchas) lives only in Claude's per-session reads. Every new session re-discovers the same things. Documenting it once means no session wastes time re-reading files it should already understand.

## Scope
- `lib/editron/` — all services, agents, config, data, motion-graphics engine
- `lib/thinkforge/` — all agents, services
- `lib/services/` — shared services
- `app/api/` — all API routes
- `components/editron/` — editor UI components
- `components/dashboard/` — product dashboards
- Key config files (package.json deps, tsconfig, Vercel config)

## Approach
- One Obsidian doc per major module/service
- Include: purpose, key exports, callers/dependents, data flow, known bugs, gotchas
- Link to architecture docs and decision docs
- Could be done incrementally — document each module as we touch it

## Estimated Effort
- Full sweep: ~2-3 hours with sub-agent swarming
- Incremental: document each file as it's edited (add to session workflow)

## Related
- [[Editron-Pipeline-Map]] — high-level pipeline already documented
- [[MG-Engine-State]] — MG engine already documented
- [[Signal-Registry-Deep-Dive]] — signals already documented
- [[ThinkForge-State]] — ThinkForge already documented

Tags: #deferred #todo #codebase
