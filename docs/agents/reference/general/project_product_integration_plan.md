# Product Integration Plan — The Five-Product Pipeline

## Vision
ThinkForge is the brain. It plans months of content, brand-aligned, right mix of platforms. Output flows to production tools, then distribution. One connected system, not five islands.

## The Pipeline

```
ThinkForge (plan + write)
  ├── Posts/Carousels → Clickatron (design/produce) → UploaderX (schedule + publish)
  ├── AI Videos → Editron (produce) → UploaderX (schedule + publish)
  └── User-Shot Videos → Pre-production Storyboard (setup guide + sketches)
                          → User shoots → Editron Mode 2 (edit) → UploaderX

Alyzzitron sits across ALL paths analyzing content quality, generating captions/descriptions.
Brand DNA flows to ALL products.
```

## What Exists Today

| Bridge | Status | Notes |
|--------|--------|-------|
| ThinkForge → Editron | WIRED | Full export pipeline: scene parsing, reference images, storyboard, video gen |
| ThinkForge → Clickatron | MISSING | Posts/carousels can't flow to Clickatron |
| Editron → UploaderX | MISSING | Rendered video has no path to UploaderX |
| Clickatron → UploaderX | MISSING | Designed posts can't auto-schedule |
| Alyzzitron → Content Planning | MISSING | Analysis results orphaned |
| Alyzzitron → Captions/SEO | MISSING | Should auto-generate, currently manual |
| Brand DNA → Clickatron | MISSING | Clickatron doesn't read brand identity |
| Brand DNA → Editron MG | PARTIAL | hierarchyOverrides param exists, no data source |
| Content Planner | STUB | Bare CRUD, no calendar UI, no strategy |

## What Needs Building (Priority Order)

### P0: Content Planner
- Monthly calendar UI with platform mix strategy
- Brand-aligned content cadence (e.g., 3 LinkedIn/week, 2 Reels/week)
- Each planned item links to ThinkForge session for production
- Trend surfacing integration

### P1: Editron → UploaderX Bridge
- After Editron render completes, offer "Schedule on UploaderX"
- Auto-fill: video file, title from script, description from Alyzzitron, platform from ThinkForge plan
- Webhook or polling from render completion

### P1: ThinkForge → Clickatron Bridge
- Post/carousel output formatted for Clickatron's input
- Text layers, brand colors, layout hints from ThinkForge output
- One-click "Design in Clickatron" from ThinkForge

### P1: Alyzzitron Feedback Loop
- Analysis results feed back to Content Planner (what worked, what didn't)
- Auto-generated captions + descriptions + SEO tags from analysis
- Performance data influences future content mix

### P2: Pre-Production Storyboard (User-Shot Video)
- Equipment assessment: how many cameras, lighting type user has
- Setup recommendations per scene: ideal camera positions, lighting adjustments
- Printable rough sketches (pre-generated, not on-demand)
- Shot list with framing guides

### P2: Avatar + SaaS Explainer
- AI avatar integration in Editron (HeyGen/Hyperframes style)
- Animated SaaS explainer templates (screen recordings + motion graphics)

### P3: Brand DNA → All Products
- Centralized Brand DNA Vault (user-level + project-level)
- All products read from it: Clickatron (colors, fonts), Editron MG (themes), UploaderX (caption voice)
- Auto-extraction from URLs/LinkedIn (see project_brand_auto_extraction.md)

## Design Decisions Pending
1. Content Planner: separate page or tab within ThinkForge?
2. Bridges: webhook-based (async) or direct API calls (sync)?
3. Alyzzitron feedback: real-time or batch (weekly digest)?
4. Pre-production storyboard: AI-generated sketches or template-based?
