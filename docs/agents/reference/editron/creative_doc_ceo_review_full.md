---
name: Creative Content Doc — FULL CEO Reviews (both signal taxonomy + scope system)
description: >
  UNABRIDGED CEO/founder reviews. First review audited the 35-signal taxonomy for product-market fit,
  ambition, gaps, competitive landscape, and 10-star vision. Second review audited the scope hierarchy
  for agency workflows, brand management, campaign orchestration.
  DO NOT CONDENSE — these are reference documents for doc writing.
type: project
last_updated: 2026-05-19
priority: HIGH
originSessionId: 06e29f3e-3816-4c0e-8acc-4d2fb1ebae47
---
# CEO REVIEW #1: Signal Taxonomy (35 signals, pre-audit)

## 1. Is This Ambitious Enough?

The taxonomy itself is table stakes dressed in academic clothing. Any sufficiently funded competitor (Jasper, Writer, Copy.ai, even Adobe with Firefly's content layer) could hire a rhetoric PhD and produce a similar periodic table in 90 days. The taxonomy is not the moat. The moat is in three things the taxonomy enables:

- The signal-to-execution pipeline. Can you go from "this brand's LinkedIn voice is high-ethos, low-pathos, medium-formality, Schwartz level 3" directly to generated content that actually sounds like that? That is hard. Nobody does it.
- The measurement loop. Can you take a finished piece of content, decompose it back into signals, and score drift from the brand profile? That is a defensible data flywheel.
- Cross-format coherence. Can you prove that the same brand sounds like itself across a TikTok script, a pitch deck, and an investor email — using signal math, not vibes? Nobody does this.

If you build all three, you have a 3-5 year moat. If you ship just the taxonomy as a fancy UI, you have a feature that gets cloned in a quarter.

Verdict: The ambition needs to be in the SYSTEM, not the TABLE. The table is the periodic table; the moat is the chemistry engine.

## 2. What is Missing from the Product Perspective?

Five gaps that agencies and brand teams will ask about on day one:

A. Brand Voice Identity / Consistency Signal. You have formality, humor, enthusiasm, irreverence — four voice signals. But brand voice is more than tone. Where is:
- Lexical signature — the specific vocabulary a brand owns ("Think Different", "Just Do It"). Not just formality level but which words and which words are forbidden.
- Sentence rhythm / cadence — Apple writes in short declaratives. McKinsey writes in nested subordinate clauses. Both can be "medium formality." The structural fingerprint of the prose itself is missing.
- Persona consistency — when a brand has multiple sub-voices (Wendy's Twitter vs. Wendy's investor relations), how do you model voice variants within one brand?

B. Cultural and Contextual Sensitivity. There is no signal for:
- Cultural register — content that works in the US market may be offensive in MENA or tone-deaf in Japan. Agencies running global campaigns need a cultural-context dimension.
- Platform-native conventions — TikTok has genre-specific norms (greenscreen, duet-bait, hook structures) that are not captured by pacing_velocity or humor alone.

C. Visual-Verbal Integration Signal. For a company whose core product is video, the taxonomy is suspiciously text-only. Where is:
- Visual dependency — how much of the meaning lives in visuals vs. words?
- Show-vs-tell ratio — does this content describe or demonstrate?
- Multimodal coherence — when the visual and verbal tracks carry different signals intentionally.

D. Conversion / CTA Architecture. persuasion_intent is too blunt. Agencies care about:
- CTA specificity — "Buy now" vs. "Learn more" vs. "Share with a friend" are different architectural choices.
- Funnel position — top-of-funnel content has fundamentally different signal profiles than bottom-of-funnel.
- Value proposition clarity — how explicitly is the offer stated?

E. Collaboration and Approval Signals. The signal profile should enable automated compliance checking — "this draft violates the brand's approved signal envelope, here is where and why." That turns the taxonomy from a creative tool into a governance tool, which is what gets enterprise contracts signed.

## 3. Does This Work for the Full Vision?

| Format | Works? | Gap |
|---|---|---|
| Video scripts | Yes, strong | Missing visual-verbal integration |
| Social posts | Mostly | Platform-native conventions missing |
| Email sequences | Yes | Funnel position / CTA architecture missing |
| Presentations | Partially | No signal for slide-level information architecture |
| Case studies | Yes | Could use an "evidence density" signal |
| Brand guidelines | Breaks | Brand guidelines are META-content — they describe the signal envelope itself. Need a meta-layer. |
| Pitch decks | Partially | Missing "ask magnitude" |
| Product documentation | Weak | education_intent too coarse; needs task-completion orientation |
| Internal comms | Weak | Missing organizational-politics signals |

The brand guidelines problem is the most important one. If Insturix is the system of record for brand identity, then brand guidelines are not "content" — they are the configuration file for the signal engine.

## 4. Where Does This Break?

Three content types that expose holes:

Legal and compliance content. A pharma company's ad copy has regulatory constraints that override creative intent. No signal for "regulatory constraint density."

Data-driven content. A quarterly earnings report. The signal that matters most — "fidelity to source data" — does not exist. logos_load is about logic, not data integrity.

User-generated content. When your client is moderating UGC, the signals need to work in detection mode (classifying incoming content) not just generation mode.

## 5. Multi-Format Campaigns

What works: Same core message, different signal profiles per format. Good.

What is missing:
- Campaign-level coherence constraints. Invariants that don't change across formats.
- Sequencing logic. In a drip campaign, signals should EVOLVE: audience_awareness shifts from Schwartz 1 toward 5. persuasion_intent climbs.
- Cross-format dependency. Landing page cognitive_load must match what the ad promised.

## 6. Brand Evolution Over Time

temporal_relevance_decay and scope_breadth are not enough. They describe individual content properties, not brand evolution.

What you need: brand signal trajectory model.
- Stage-appropriate profiles (startup launch = high kairos, high novelty, high enthusiasm → enterprise = high ethos, high social_proof, lower irreverence)
- Voice drift detection over 6 months
- Competitive signal positioning relative to category norms

## 7. Competitive Analysis

Nobody is doing this at the signal-decomposition level. But several are adjacent:
- Writer.com — brand voice enforcement via AI. Shallow tone detection (formal/casual/friendly). Well-funded.
- Persado (now Jacquard) — AI marketing language using "emotional profiling." Crude compared to 47 signals but they have Fortune 500 clients and performance data.
- Phrasee — similar to Persado, focused on email/push/SMS.
- Jasper / Copy.ai — brand voice "training" via examples. No signal model. Just pattern matching.
- Adobe GenStudio — brand guidelines enforcement. Tone is a single slider.

Your advantage: Nobody has a 47-signal atomic decomposition with cross-format coherence and measurement loops. But Persado and Writer have data — millions of A/B test results. You have theory; they have empirical validation. The 10-star version needs to close that gap.

## 8. The 10-Star Version

Star 7 (great product): Agency uploads brand guidelines + 50 pieces of past content. System decomposes into a brand signal profile automatically. All future content generated within that envelope. Drift detection alerts when new content strays.

Star 8 (remarkable): System models the audience's signal preferences (from engagement data). Shows gap between "what the brand says" and "what the audience responds to." Recommends signal adjustments with predicted performance impact.

Star 9 (transformative): Full campaign orchestration. One brief → complete cross-format campaign with mathematically coherent signal profiles per format, sequenced for optimal audience progression. Human approves or adjusts signal knobs, not copy.

Star 10 (category-defining): Signal system becomes the language of creative collaboration. "The pathos_load is too high for this segment — bring to 0.4 and raise logos_load." Insturix owns the vocabulary. Industry standard.

Three things must happen:
1. Performance feedback loop (engagement data → signal model validation)
2. Signal decomposition API (third parties submit content → signal profile back)
3. Collaborative signal editing UI (visual mixing board, not text prompts)

Summary: Keep the 35 signals, the 8 axes, the emergence principle. Add: visual-verbal integration (3-4 signals), brand voice identity layer, campaign-level coherence, funnel/CTA architecture. Build the measurement loop and mixing board.

---

# CEO REVIEW #2: Scope System

## 1. Does This Serve the 10-Star Vision?

Partially. The hierarchy is correct but the naming is wrong and the priority is inverted.

The 10-star product for agencies is: "One brief, every format, brand-perfect, zero rework." That means CAMPAIGN is not the top of your hierarchy — BRAND is. A brand outlives any campaign.

```
BRAND DNA — immortal (voice, visual identity, sonic signature, editorial rules)
  CAMPAIGN — strategic (tone shift, seasonal palette, campaign-specific messaging)
    PROJECT — one deliverable
      ACT — structural grouping (only for long-form)
        SCENE — per-segment
          BEAT — micro-production
```

Why this matters: An agency managing Nike doesn't start with "Campaign." They start with "Nike." The brand signal board is the permanent home screen. Campaigns are time-bound overlays on that brand. Your current hierarchy makes Campaign the ceiling, which means every new campaign starts from scratch or requires manual signal copying.

Verdict: Rename CAMPAIGN to BRAND, add CAMPAIGN as a layer between BRAND and PROJECT. This is the single biggest product insight in the hierarchy.

## 2. Is It Too Complex for Users?

Yes, as described. No, if you hide the complexity behind progressive disclosure.

The UI should never expose these words — ACT, BEAT, SCENE, TRANSITION — to a brand manager.

Default view (90% of users, 90% of the time): Brand board + Project. Two levels. The brand board shows the 8-12 signals that matter most. The project inherits everything automatically. User sees: "Nike — Summer 2026 Campaign — TikTok Reel #3." They tweak 1-2 signals if needed. Done.

Power view (editors, creative directors): Timeline appears. Scenes are visible. Override signals per scene.

Expert view (long-form, documentary, series): Acts and beats become available. This is the 5% case.

The cascade model is invisible to most users. They just see "this project uses Nike defaults" with a small override indicator when something deviates.

Verdict: The hierarchy is not too complex. Exposing it would be. Make it a 2-level default with progressive disclosure to 5 levels.

## 3. Does Cascade Work for Campaigns?

Yes, IF you add FORMAT PROFILES.

The problem: A TikTok and a LinkedIn video from the same brief need different pacing_velocity, different formality, different info_density. But they share brand DNA and campaign tone. The cascade handles the shared part. What it doesn't handle is the format-specific adaptation.

The solution: Format profiles sit between CAMPAIGN and PROJECT. They are system-provided defaults (not user-created):

```
BRAND → CAMPAIGN → FORMAT (TikTok/LinkedIn/YouTube/Email) → PROJECT → ...
```

FORMAT says: "TikTok means pacing_velocity +30%, formality -2 levels, max duration 60s, vertical crop." The user never touches this. When they see TikTok vs LinkedIn side by side, the signals are correctly adapted.

Without FORMAT, users manually adjust 10+ signals per platform for every project. That's the Adobe workflow. That's what you're killing.

Verdict: Add FORMAT as a system-managed layer between CAMPAIGN and PROJECT.

## 4. Where Does This Create Competitive Advantage?

Three places:
A. Brand continuity across time and people. Adobe has no concept of "brand signal state." Every editor starts from scratch.
B. Multi-format coherence. Cascade from BRAND through FORMAT to PROJECT means a campaign drops 8 pieces that are coherent but platform-appropriate. No one does this today.
C. Signal mixing board as creative tool. "emotional_arousal ramps from 0.3 to 0.8 across three scenes with exponential curve" — DaVinci-grade control that non-editors can understand.

NOT a competitive advantage: ACT and BEAT levels. Table stakes for professional editors.

## 5. What's Missing?

A. AUDIENCE signal. Same brand, same campaign, same platform — but targeting Gen Z vs C-suite needs different signals. AUDIENCE should be an orthogonal overlay.

B. APPROVAL/LOCK states. When a creative director approves brand DNA signals, those should be lockable. Deviation requires explicit unlock.

C. VERSION HISTORY on signals. Brand DNA evolves. Nike Q1 2026 is different from Q3 2026. Need signal versioning at BRAND and CAMPAIGN level — not just "current" but "what was it when this project was created?"

D. COMPETITIVE REFERENCE. Agencies reverse-engineer competitors. "Make it feel like Apple but warmer." Need to import signal profiles from reference content.

E. CONFLICT RESOLUTION UI. When BRAND says formality=0.8 and CAMPAIGN says formality=0.4, user needs to see the conflict. "Overridden from Brand default" with one-click revert.

## 6. Does GROUP Serve a Real Need?

Yes, but rename it and narrow the scope. Replace GROUP with SEGMENT TYPE. Real users think in terms of interview, b-roll, title card, product shot, testimonial, CTA. These are natural groups with default signal profiles. More useful than arbitrary grouping because:
- New projects auto-tag scenes by segment type
- Segment types carry learnable signal defaults
- "All my interview segments across all projects share these signals"

Verdict: Replace GROUP with SEGMENT TYPE. Concrete, learnable, closer to how editors think.

## 7. Brand Evolution Over Time

Brand DNA changes over quarters, but cascade model is stateless — only knows "current."

Need: Brand DNA versioning with project pinning. When project is created, snapshots brand DNA version. Brand evolves → old projects keep original DNA. New projects get updated DNA. "Refresh to latest" shows diff and requires approval.

Brand TIMELINE view: signal trajectories over time. "Formality decreased 15% over 2026." Intelligence no tool provides today.

## Summary: Revised Hierarchy

```
BRAND DNA (versioned, lockable)
  CAMPAIGN (time-bound overlay)
    FORMAT (system-managed: TikTok/LinkedIn/YouTube/Email)
      PROJECT (one deliverable)
        ACT (long-form only, 5+ scenes)
          SCENE (per-segment, tagged with SEGMENT TYPE)
            BEAT (micro-production, expert mode)

TRANSITION — between adjacent items (keep as-is)
SEGMENT TYPE — replaces GROUP
AUDIENCE — orthogonal overlay
```

Three changes that matter most:
1. BRAND above CAMPAIGN
2. FORMAT between CAMPAIGN and PROJECT
3. SEGMENT TYPE replacing GROUP

Three additions for 10-star:
1. Signal locking with approval workflows
2. Brand DNA versioning with project pinning
3. Audience as orthogonal signal modifier
