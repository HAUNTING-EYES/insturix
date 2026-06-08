# Insturix Brain

Central knowledge base for Insturix product development. Persists across Claude Code sessions.

## How to Use
- Every session reads relevant docs FIRST before proposing anything
- New findings get added HERE, not in memory files or handover docs
- Link between docs using `[[doc-name]]` for Obsidian graph view
- Tag decisions with status: `#decided`, `#open`, `#rejected`, `#deferred`

## Vault Structure

### [[01-Research/Index|Research]]
Papers, libraries, competitor analysis, benchmarks. The raw knowledge.

### [[02-Architecture/Index|Architecture]]  
System designs, data flows, component maps. How things work and how they should work.

### [[03-Decisions/Index|Decisions]]
Every architectural decision with context, alternatives considered, and why. Prevents re-litigating.

### [[04-Session-Notes/Index|Session Notes]]
Per-session summaries. What was done, what was decided, what's next.

### [[05-Bugs-and-Issues/Index|Bugs & Issues]]
P0-P3 bugs, known issues, dead ends. Things that went wrong and why.

### [[06-Resources/Index|Resources]]
APIs, models, keys, costs, datasets, external tools.

### [[07-Roadmap/Index|Roadmap]]
Phases, priorities, timelines. Where we're going.

## Rules for Claude Code Sessions
1. START every session by reading `00-Index.md` + relevant section indexes
2. BEFORE proposing anything, check if it was already discussed in Decisions or Research
3. AFTER making progress, update the relevant docs
4. NEVER rehash decided topics — link to the decision doc instead
5. Session notes capture WHAT HAPPENED, not what was planned
