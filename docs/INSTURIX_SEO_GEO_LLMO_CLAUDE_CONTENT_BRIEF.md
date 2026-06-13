# Insturix SEO / GEO / LLMO Content Enrichment Brief for Claude

Use this as the source prompt for generating the next content layer. The goal is keyword-rich, answer-engine-friendly copy that matches the current Insturix positioning without inventing claims or exposing internal product codenames.

## Copy This Prompt Into Claude

You are helping write SEO, GEO, and LLMO content for Insturix.

Insturix is an automated content production platform. The current tagline is:

Produce Anything

Canonical domain:
https://www.insturix.com

Current LLM-facing summary already live in `llms.txt`:

> Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.
>
> Tagline: Produce Anything.
>
> Insturix helps teams move from content idea to finished output in one workflow. The platform supports planning, scripting, editing uploaded footage, analyzing content, creating visual assets, adding music and sound, publishing finished media, and sharing content from a public profile surface. A persistent brand profile helps keep tone, pacing, fonts, colors, visual style, and preferences consistent across outputs.
>
> Individual creators can use Insturix, but the primary audiences are agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.

## Non-Negotiables

- Do not call Insturix only a video production platform. Video is one major output, but the category is automated content production.
- Do not expose internal product codenames, dashboard route names, or legacy product names.
- Use public capability labels only:
  - Plan and script
  - Edit
  - Analyze
  - Create assets
  - Add music and sound
  - Publish
  - Share
  - Brand profiles
- Do not mention creator insurance, influencer protection, sponsorship marketplaces, creator business marketplaces, or brand-deal marketplaces. Those are stale legacy associations.
- Do not claim SOC 2, guaranteed performance, thousands of users, fully autonomous output, or "replace your team" unless explicitly marked as unverified and removed from final copy.
- Do not over-prioritize individual creators. They can use the product, but they are the lowest-priority ICP.
- Write for teams that need repeatable production, brand consistency, and less operational drag.
- Keep claims factual, useful, and defensible.

## ICP Priority

Use this priority order when writing examples, FAQs, and page copy:

1. Agencies
2. In-house teams
3. Businesses
4. Filmmakers
5. Enterprises
6. Creator houses
7. Individual creators, lowest priority

## Core Positioning To Preserve

Insturix helps teams go from idea, brief, prompt, or uploaded material to finished content in one connected production workflow.

It is not only an editor. It is the production layer around planning, scripting, editing, analysis, visual assets, music and sound, publishing, sharing, and brand consistency.

It should feel useful for:

- Agencies producing client work across many brands
- In-house teams producing repeated campaigns and social assets
- Businesses that need consistent content without a scattered toolchain
- Filmmakers who want AI-assisted production workflows
- Enterprises that need structured brand and workflow control
- Creator houses coordinating high-volume output

## Primary Keyword Set

Use naturally. Do not stuff.

- automated content production platform
- AI content production platform
- content production automation
- content production workflow
- AI content workflow
- marketing content production platform
- business content production software
- content production platform for agencies
- AI content workflow for in-house teams
- enterprise content production platform
- creator house content production
- filmmaker content workflow
- brand-consistent content
- on-brand content production
- AI-assisted content editing
- automated video editing
- AI video editor
- AI thumbnail generator
- AI script writer
- AI publishing workflow
- content performance analysis

## Output Required From Claude

Return implementation-ready Markdown. Do not include motivational prefaces. Do not say "here is." Start with the content.

### 1. Site-Wide Messaging

Provide:

- One-sentence positioning
- Two-sentence positioning
- Plain-English definition
- 50-word answer-engine summary
- 100-word answer-engine summary
- 200-word answer-engine summary
- "What Insturix is not" block
- Category and subcategory recommendations
- 10 approved phrases to repeat across the site
- 10 phrases to avoid

### 2. Page-Level SEO/GEO Briefs

For each page, provide:

- SEO title, 50 to 60 characters where possible
- Meta description, 140 to 160 characters where possible
- H1
- Suggested H2s
- Short hero/subhead copy
- 3 to 5 body copy blocks
- GEO answer summary, 2 to 4 sentences
- FAQ questions and answers
- Internal links and anchor text
- Structured data recommendation
- Any claim that needs founder confirmation

Pages:

- Home: `/`
- Products: `/products`
- Pricing: `/upgrade`
- Showcase: `/showcase`
- Blog index: `/resources/blogs`
- Blog post template: `/resources/blogs/[slug]`
- Tutorials: `/resources/tutorials`
- Support: `/resources/support`
- FAQ: `/resources/faq`
- Contact: `/contactus`
- Newsroom: `/newsroom`
- Public profile pages: `/profile/[username]`

### 3. Product/Capability Copy

Write public copy for these capability sections. Do not use internal codenames.

For each capability, provide:

- Public capability name
- One-line description
- 80 to 120 word section copy
- 3 bullets
- FAQ answer
- Search intent
- Keywords to include

Capabilities:

- Plan and script
- Edit
- Analyze
- Create assets
- Add music and sound
- Publish
- Share
- Brand profiles

### 4. FAQ Expansion

Generate 30 FAQ entries for answer engines.

Each answer should be:

- 2 to 4 sentences
- factual
- non-hype
- written so a search engine or LLM can quote it directly

FAQ categories:

- What Insturix is
- Who Insturix is for
- How the workflow works
- Uploading and editing existing footage
- Brand profiles and brand consistency
- Content analysis
- Asset creation
- Publishing
- Pricing and credits, mark uncertain items as `[founder confirmation needed]`
- Security and enterprise readiness, no SOC 2 claims

### 5. Blog Content Plan

Generate 30 blog post plans.

For each post:

- Slug
- Title
- Primary keyword
- Secondary keywords
- Search intent
- Excerpt, 150 to 200 characters
- Tags, max 4
- Outline with H2s
- Answer-engine summary
- Internal links

Prioritize "what is", "how to", "for agencies", "for in-house teams", "brand consistency", "content production automation", and comparison-style topics.

### 6. First 5 Blog Posts In JSON-Ready Shape

Generate the first 5 full blog posts as JSON-ready objects matching this schema:

```json
{
  "id": "kebab-case-slug",
  "title": "Post title",
  "author": {
    "name": "Insturix Team",
    "avatar": "/blogs/blank_profile.png"
  },
  "publishedAt": "2026-06-14T00:00:00Z",
  "image": "/blogs/fallback-blog.jpg",
  "fallbackImage": "/blogs/fallback-blog.jpg",
  "excerpt": "150 to 200 character excerpt",
  "tags": ["Tag", "Tag", "Tag"],
  "readTime": 5,
  "content": "# Markdown content as a single escaped string"
}
```

Do not include invalid JSON comments. Escape newlines in the `content` string.

Suggested first 5 posts:

1. What Is Automated Content Production?
2. How Agencies Can Scale Content Production Without Adding Handoffs
3. How In-House Teams Keep Content On Brand Across Channels
4. What a Content Production Workflow Looks Like From Brief to Publish
5. AI-Assisted Editing vs. Automated Content Production

### 7. Tutorials Plan

Generate 20 tutorial entries.

For each:

- Title
- Public capability
- Difficulty
- Duration estimate
- Search keyword
- Summary
- Step outline
- Related FAQ
- Internal links

Tutorials should cover:

- Getting started
- Creating a brand profile
- Planning a campaign
- Writing a script
- Uploading footage
- Editing an output
- Reviewing analysis
- Creating thumbnails/assets
- Adding music/sound
- Publishing content
- Creating a public profile
- Managing multiple client brands
- Team workflows
- Enterprise workflow setup

### 8. Comparison Pages

Generate 10 comparison page briefs.

Do not make unverified claims about competitors. Phrase comparisons around workflow category differences.

Include:

- Insturix vs single-purpose editors
- Insturix vs traditional production tools
- Insturix vs social schedulers
- Insturix vs asset generators
- Insturix vs freelancer-only production
- Best automated content production platforms for agencies
- Best AI content workflow tools for in-house teams

For each:

- SEO title
- Meta description
- H1
- Neutral comparison angle
- Where Insturix fits
- Where another tool may be better
- FAQs
- Internal links

### 9. `llms.txt` Enrichment

Rewrite the current `llms.txt` only if you can improve clarity while preserving the current positioning.

Rules:

- No crawler directives
- No internal codenames
- No stale legacy product descriptions
- No unsupported claims
- Keep it factual and concise
- Keep "Produce Anything"
- Keep automated content production as the category

### 10. Claim Safety Table

Return a table with:

- Claim
- Safe to use now?
- Evidence needed
- Safer wording

Include at least these claims:

- Produce Anything
- automated content production platform
- AI-assisted editing
- brand consistency
- publishing workflows
- enterprise-ready
- secure
- API access
- white-label
- credits
- supported social platforms
- faster production
- lower production cost
- fully automated
- guaranteed performance
- thousands of users
- SOC 2

## Tone

Clear, precise, founder-led, useful. No hype. No vague AI words like "revolutionary", "seamless", "unlock", "game-changing", "leveraging", or "harnessing".

Write like a product team explaining a serious workflow tool to agencies, businesses, and production teams.

## Final Claude Output Format

Use this exact section order:

1. Site-Wide Messaging
2. Page-Level Briefs
3. Capability Copy
4. FAQ Expansion
5. Blog Plan
6. First 5 Blog JSON Objects
7. Tutorials Plan
8. Comparison Page Briefs
9. `llms.txt`
10. Claim Safety Table
11. Founder Confirmations Needed

End with a list of every item that needs founder confirmation.
