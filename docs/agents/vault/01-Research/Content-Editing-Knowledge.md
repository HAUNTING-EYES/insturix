---
tags:
  - research
  - editing
  - domain-knowledge
date: 2026-05-24
---

# Content Editing Knowledge

Professional editing principles that inform every automated decision in the Editron pipeline. This is domain knowledge, not system documentation -- it describes how human editors think, and how the system should emulate that thinking.

---

## Walter Murch's Rule of Six (Priority Hierarchy)

The foundational framework for all cut decisions. When criteria conflict, sacrifice from the bottom up. Never sacrifice emotion for continuity.

| Priority | Criterion | Weight | What It Means |
|----------|-----------|--------|---------------|
| 1 | **EMOTION** | 51% | Does this cut make the viewer FEEL something? Overrides everything. |
| 2 | **STORY** | 23% | Does this advance the narrative? |
| 3 | **RHYTHM** | 10% | Is this rhythmically interesting and "right"? |
| 4 | **EYE-TRACE** | 7% | Does this respect where the viewer's eye is? |
| 5 | **2D PLANE** | 5% | Does the composition work? |
| 6 | **3D CONTINUITY** | 4% | Does spatial continuity make sense? |

This maps directly to the signal system: emotional signals (enthusiasm, warmth, visceral_impact) should dominate composition decisions over perceptual signals (shot_scale, visual_complexity) which should dominate over structural signals (position_in_video). See [[Signal-Registry-Deep-Dive]].

---

## Beat-Sync Principles

Beat-sync is a TOOL, not a default style. The system must know when to use it and when to leave it alone.

### When Beat-Sync Works
- Montages
- Product reveals
- Action sequences
- Brand anthems
- Music videos

### When Beat-Sync Is Wrong
- Tutorials
- Talking heads
- Testimonials
- Gentle product demos

### Rules
- Not every beat needs a cut -- cutting on every beat feels frantic
- Use downbeats for major cuts, off-beats for secondary actions
- Fast cuts on high-energy songs, longer takes for emotional moments
- Let some beats pass WITHOUT cuts -- negative space is powerful
- Videos with strong audio-visual sync see up to 40% higher completion rates

This informs the signal-driven routing: `speechCoverage > 0.6` should suppress beat-sync; `musicPresence > 0.5 + speech < 0.3` should enable it. See the TAG architecture proposal in [[MG-Engine-State]].

---

## When to Cut (Professional Editor Rules)

| Rule | Guidance |
|------|----------|
| Cut on action | Mid-movement, not at rest. The motion carries the eye across the cut. |
| Cut on dialogue | Just before the speaker starts, or during a reaction shot. |
| Cut on music | On downbeats for emphasis, on upbeats for urgency. |
| Cut on emotion | When the emotion changes, not before. |
| Do NOT cut during camera moves | Let the move complete. |
| Do NOT cut mid-sentence | Unless intentionally jarring. |
| Do NOT cut without purpose | If the next shot does not advance the story, hold. |

---

## Pacing by Content Type

Each content type has a natural rhythm. The system uses profile detection (54 profiles with 16x pacing range) to match these automatically.

| Content Type | Cuts/Min | Beat-Sync | Transitions | Feel |
|--------------|----------|-----------|-------------|------|
| Product ad (hero) | 12-20 | Downbeats | Dissolves, dip-to-white | Aspirational |
| Brand ad (montage) | 20-35 | All beats | Hard-cuts, zoom-punch | Energetic |
| UGC/testimonial | 6-10 | None | Soft-cuts | Authentic |
| Tutorial/demo | 4-8 | None | Hard-cuts | Clear |
| Website/SaaS ad | 10-18 | Downbeats | Dissolves | Professional |
| Talking head | 3-6 | None | Jump-cuts | Personal |

### Content Type Characteristics

**Talking Head**: Speaker-dominant. 3-6 cuts/min. No beat-sync. Jump cuts acceptable. MG: keyword highlights and lower-thirds. The system's strongest mode -- word indices provide full coordinate coverage.

**Music Video**: Beat-dominant. 20-35 cuts/min. Full beat-sync. Hard cuts and zoom-punches. MG: beat-reactive elements, kinetic typography. The system's weakest mode -- no word indices means no intelligence coordinates (the non-speech editing gap).

**Product Review**: Data-dominant. 10-18 cuts/min. Selective beat-sync on reveals. MG: stat counters and data visualization. Batch testing confirmed 60% stat counters for spec-heavy content.

**Tutorial**: Clarity-dominant. 4-8 cuts/min. No beat-sync. Hard cuts only. MG: keyword highlights and callouts. Batch testing showed high graphic density (28 in 52 seconds) which matches professional tutorials (Fireship, NetworkChuck).

**Corporate/Earnings**: Formality-dominant. 6-12 cuts/min. No beat-sync. Dissolves. MG: stat counters (68% in batch testing). Numbers drive the visual.

**Entertainment/Vlog**: Energy-dominant. 12-25 cuts/min. Selective beat-sync. Mixed transitions. MG: lower-thirds for name introductions (21% in batch testing).

---

## Music Sections and Editing Actions

The relationship between musical structure and editorial decisions. Maps to the `music_section` signal.

| Section | Energy | Editorial Action |
|---------|--------|-----------------|
| Intro | Low, building | Establish scene, slow push-in, title card |
| Verse | Medium, steady | Show product/content, match-cuts, steady pacing |
| Build | Rising | Accelerate cuts, tighter framing, rising action |
| Chorus/Drop | Peak | Fastest cuts, zoom-punches, reveals, hero shots |
| Breakdown | Low | Slow-mo, pull-back, breathing room, testimonial |
| Outro | Resolving | Logo reveal, CTA, fade to black |

---

## The Video Editor's 5-Step Decision Process

Before placing ANY edit decision, a professional editor asks:

1. **What is the SUBJECT in this frame?** Person, product, text, background.
2. **What is the MOTION?** Static, pan, zoom, action, subtle.
3. **What is the MOOD?** Match to music energy + script mood.
4. **Where is the viewer's EYE?** Follow Murch's eye-trace rule.
5. **What happens NEXT?** Prepare the viewer. Do not surprise without reason.

This maps to the signal dimensions: CONTENT (subject), PERCEPTUAL (motion), EMOTIONAL (mood), PERCEPTUAL (eye-trace), and TEMPORAL (what's next). The composition engine should implicitly answer all 5 questions through signal consumption.

---

## The Beat Hierarchy (7 Metrical Levels)

Professional audio-reactive editing operates on 7 distinct metrical levels, not just "on the beat" or "off the beat."

| Level | Name | Typical Duration | MG Application |
|-------|------|------------------|----------------|
| 1 | **Tatum** | ~100-250ms | Micro-animations: text shimmer, accent pulse, glow flicker |
| 2 | **Beat (Tactus)** | ~300-600ms | Core beat-sync: scale pop, opacity pulse |
| 3 | **Downbeat** | Every 2-8 beats | Stronger effects: bigger scale, color flash |
| 4 | **Bar/Measure** | ~1-4 seconds | Composition-level: MG enters/exits at bar boundaries |
| 5 | **Phrase** | ~4-32 seconds | Narrative-level: new MG type at phrase change |
| 6 | **Section** | ~15-60 seconds | Density/style shift: chorus = richer, verse = subtler |
| 7 | **Onset** | Irregular | Transient-reactive: flash on drum hit, accent on stab |

The D6 implementation uses a continuous `beat_level` signal (0-1) with quadratic response scaling: tatum gets 0.25% scale effect, section gets 5%. See [[MG-Engine-State]] for implementation details.

---

## Sources

- Walter Murch's Rule of Six: StudioBinder, No Film School
- Beat-Sync Complete Guide: Beat2Cut
- Edit to the Beat: Toolfarm
- Agentic Video Editing: a16z
- ISMIR 2020 (beat hierarchy research)
- CCRMA Stanford MIR Workshop (metrical levels)
- Joint Beat & Tatum Tracking: Seppanen & Eronen, ISMIR 2006

---

## Related Documents
- [[Signal-Registry-Deep-Dive]] -- how these principles are encoded as signals
- [[MG-Engine-State]] -- the system that implements these principles
- [[Session-2026-05-22-MG-Engine-Complete]] -- session context for the MG engine build
