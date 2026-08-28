# Connectivity Map — every engine surface → its studio wiring

Census 2026-08-28 (code-verified; agent-audited). Build order follows this
table. Status legend: WIRED / NEXT / LATER.

## Org access (foundational — everything below depends on it)
- [x] Turn envelope carries real `isOrgAdmin` via Clerk `has({role:"org:admin"})` (fixed in turns route)
- [ ] Org-scoped project listing: use `listOrgProjects` when orgId present (Home adapter)
- [ ] Every generative step resolves wallet via `resolveContextBillingOwner` (write/design/analyze do; audit remaining)
- CalOS scoping rule: org present → team calendar (`calosScope`); brand gate via `requireCalosBrandAccess`

## Trends (the founder-flagged gap) — NEXT
- [ ] "What's trending for my niche?" → `GET /api/services/calos/trends?brandId=` (niche auto-resolves from brand; Perplexity chain, degrades honestly)
- [ ] Opportunity queue → `GET /api/services/calos/trend-opportunities` list; accept card → `PATCH .../trend-opportunities` (creates draft deliverable → hands to write turn); snooze/dismiss
- [ ] Trend-watch policy → `POST /api/services/calos/trend-watch` ("watch trends for me" — flips cron scanning on)
- [ ] ThinkForge reference flow: `trends/reference` (URL → candidate) → `trends/select` → `trends/analyze` (quoted, QStash) → poll `trends/status`

## CalOS calendar depth — NEXT
- [ ] Approve/changes → `POST /deliverables/[id]/decision` (atomic publish enqueue; 409 on unassigned account — surface reconnect card)
- [ ] Publish health → `GET /publish-status` ("did yesterday's posts go out?"); retry → `POST /publish-status` w/ `confirmPossibleDuplicate` (duplicate-risk confirm card)
- [ ] Client share → `POST /client-view` (mint token URL artifact); list/revoke drawer
- [ ] Brand references → `POST /brand-references` (URL/file as brand grounding before generation)

## ThinkForge functions — NEXT (refine + research)
- [ ] Script refine without full chat: `POST /script/edit` + `/script/edit-blocks` (whole-doc / selection) — the "tighten it" fast path
- [ ] URL brief: `POST /url-brief` ("turn this article into a brief" → attaches to next write)
- [ ] Refinery research: `POST /refinery` (1..10 URLs, quoted, QStash poll → authorized sources feed the writer)
- [ ] Brand DNA: `POST /brand-dna/extract-fingerprint` ("here are my posts — learn my voice"); tone chips in write stage
- [ ] Databank: notes ("remember this"), promote (medium risk), review queue (org:admin rail)
- [ ] AV presentation tab in script stage (`GET /script/av-presentation`)
- [ ] Shot plan: `GET/POST /production/shot-plan` (production stage pre-step)
- [ ] Content cards round-trip: ideas → card → CalOS deliverable (`content-planning` routes)

## Storyboard as conversation (script → reel chain) — LATER (big)
prewarm → extract-subjects → reference-images (QStash poll) → storyboard/generate (atomic credit deduct, 5/h rate limit) → voices/voiceover → scene approve/regenerate → generate-videos (+avatar bind) → finalize → Editron reel. Maps 1:1 to the declared storyboard stage view.

## Remaining surfaces — LATER
- [ ] Avatar pipeline turns (profiles/[id]/pipeline-jobs + render-plan/readiness)
- [ ] Musitron DAW persistence (projects CRUD) in audio stage
- [ ] Socialize updates ("update my link-in-bio") — low-risk distribute step
- [ ] UploaderX status reads + stuck-upload reset
- [ ] Brand Vault rescans ("rescan acme.com") — quoted, poll; signal-profile review
- Flagged gap: no HTTP route for ThinkForge version manager (needs one or direct db call for "show versions / restore")
