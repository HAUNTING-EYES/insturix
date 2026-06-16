---
name: Brand/Client scoping for agencies
description: Graphiti episodes must be scoped by brandId not just userId. Agencies manage multiple brands with conflicting preferences. Client entity planned.
type: project
originSessionId: 258b5761-7320-40f2-bce5-e253af32c1b3
---
Agency users manage multiple brands (McDonald's, Nike, Deloitte). Knowledge graph facts must be scoped per-brand, not per-user.

**Current state (2026-04-26):** Graphiti episodes use `groupId = userId`. All brand preferences bleed together. Director queries ask "what does this user prefer?" but should ask "what does this brand prefer?"

**Planned fix:** 
1. Add Client/Brand entity — agencies create clients with profiles (name, industry, colors, voice, visual style)
2. Projects are associated with a `brandId` 
3. Graphiti `groupId` = `brandId` (brand-level) OR `userId` (user-level preferences like profile overrides)
4. Graph search scoped by `brandId` — penalize-not-exclude already supports this parameter
5. Per-brand billing tier (makes pricing easier for agencies)

**How to apply:** When wiring any new Graphiti episode or query, always include `brandId` where available. When it's null (unbranded project), fall back to `userId`.

**Why:** The "automatic car" vision means the system learns per-brand. Project #50 for McDonald's should edit like an editor who's done 49 McDonald's projects — not like someone who's done 25 McDonald's and 25 Nike and is confused about both.
