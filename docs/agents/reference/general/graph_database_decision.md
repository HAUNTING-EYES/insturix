---
name: Graph Database Decision — Neo4j Aura Free → FalkorDB Migration Path
description: Current choice and future migration plan for the Graphiti knowledge graph backend. Dev on Aura Free, production on FalkorDB self-hosted.
type: project
last_updated: 2026-04-25
originSessionId: 6ed46a30-a9d4-464d-ba45-2bb418f7ef9f
---
# Graph Database Decision

## Current: Neo4j Aura Free (development)
- 200K nodes, 400K relationships
- Zero cost
- Instant setup at console.neo4j.io
- Data on Neo4j's servers (acceptable for dev)
- Pauses after inactivity (wake on first query)
- Graphiti driver: `Neo4jDriver("bolt+s://xxx.databases.neo4j.io", "neo4j", "password")`

## Production: FalkorDB self-hosted (when users arrive)
- 60-70% cheaper than Neo4j Aura at equivalent capacity
- Built specifically for GraphRAG/AI (Graphiti supports it natively)
- Redis module — runs on any VPS with Redis 6.2+
- Hosting options: Hetzner ~$5/mo, Railway ~$5/mo, Fly.io ~$7/mo, Render ~$7/mo
- Graphiti driver: `FalkorDBDriver("falkor://host:6379")`
- Community edition is fully featured (no enterprise license needed)

## Migration path
1. Build everything on Aura Free now
2. All Graphiti code uses the driver abstraction — DB-agnostic
3. When ready for production: spin up FalkorDB on a VPS, change one constructor line
4. Migrate data via Graphiti's episode replay (re-ingest, not raw dump)

## Why NOT Cloudflare
- Cloudflare has no graph database service
- Neo4j/FalkorDB need persistent TCP connections (Bolt protocol)
- Cloudflare Workers can QUERY via HTTP API but can't HOST the DB
- R2 stays on Cloudflare for assets. Graph DB is just the index layer.

## Cost comparison (documented for later)
| Option | Cost | Nodes | SLA |
|--------|------|-------|-----|
| Aura Free | $0 | 200K | None |
| Aura Pro | $65/GB/mo (~$520 for 8GB) | Unlimited | Best-effort |
| Aura Business | $146/GB/mo (~$1168 for 8GB) | Unlimited | 99.95% |
| FalkorDB self-hosted | $5-20/mo (VPS cost only) | Unlimited | You manage |
| FalkorDB Cloud Pro | ~$350/8GB | Unlimited | Managed |
| Neo4j self-hosted (Enterprise) | $20K+/yr license + VPS | Unlimited | You manage |

## Graphiti compatibility
- Neo4j: primary driver, fully supported
- FalkorDB: supported via `graphiti-core[falkordb]`
- Kuzu: file-based, supported but no production use cases documented
- Code is driver-agnostic — switch by changing one import + constructor
