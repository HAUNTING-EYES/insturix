---
name: Creative Content Knowledge Doc — Complete Research & Signal Taxonomy
description: >
  ALL research for building the scriptwriting/content creation knowledge doc (equivalent to editing doc v3).
  4 rounds of research + 3 expert reviews (CEO, Eng, Scriptwriter) + signal taxonomy.
  47 primary signals across 10 axes. Architecture decisions locked.
  THIS IS THE MASTER REFERENCE for building the doc.
type: project
last_updated: 2026-05-19
priority: HIGH
originSessionId: 06e29f3e-3816-4c0e-8acc-4d2fb1ebae47
---
# Creative Content Knowledge Doc — Complete Research

## STATUS
- Research Round 1 (marketing video scripts): DONE
- Research Round 2 (posts/captions): DONE
- Research Round 3 (non-marketing content): DONE
- Research Round 4 (signal taxonomy — periodic table): DONE
- CEO Review: DONE (saved separately in creative_doc_ceo_vision.md)
- Eng Review: DONE
- Scriptwriter Review: DONE
- Signal taxonomy audit synthesis: DONE
- **Doc writing: NOT STARTED — next session**

## ARCHITECTURE DECISIONS (LOCKED)

### Philosophy
Same signal-centric architecture as editing doc v3 (7 parts).
Content type is EMERGENT from signals — no hardcoded content types.
User feedback: "hooks aren't universal — a corporate training video doesn't need a pattern interrupt."
Signals are ATOMIC PROPERTIES of content, not content-type mappings.

### Signal Scope (added after music direction bug)
Signals have THREE scopes:
- **GLOBAL** — one value per piece (music direction, brand voice, visual style, narrator voice)
- **PER-SCENE** — varies across segments (emotional intensity, pacing, negative space)
- **TRANSITION** — describes changes between segments (pivot intensity, music evolution, pacing shift)
Music is PROJECT-LEVEL with per-scene MODULATIONS, NOT independent per-scene compositions.

### Tiered Architecture (from Eng review)
- ALL 47 signals computed for every piece
- SYSTEM uses all 47 for technique selection (deterministic)
- LLM prompt sees only 8-10 primary voice/style signals
- Each technique card specifies 3-6 relevant signals (sparse activation)
- 3-tier inference: format defaults → brief extraction → smart defaults

## INSTALLED REFERENCE SKILLS
- `~/.claude/skills/creative-writing/` — 14 skills (prose, scene construction, story architecture, critique, writing principles with 4 reward channels, LLM failure modes)
- Ogilvy advertising principles — positioning→promise→big idea hierarchy, TV/video rules, headline rules

## ROOT CAUSES TO FIX (from ThinkForge investigation)
1. RC1: Output format contradicts section guidance (script-author-agent.ts:337-342 vs :120-132)
2. RC2: No Narration/Voiceover label in Path A output template (script-author-agent.ts:340)
3. RC3: parseMarkdownToBlocks doesn't produce SceneBlocks
4. RC4: Creative constraints amplify production direction over narration
5. RC5: Outline agent is genre-blind
6. RC6: score_direction regex can hijack video_script classification
7. RC7: No creative knowledge doc for scriptwriting exists (THIS DOC)
8. RC8: Music direction is per-scene instead of project-level with modulations

## NEW FEATURES IDENTIFIED
- User upload scripts/docs/PDFs as input for script generation
- Approved scripts influence brand vault (learning loop)

---

## FINAL SIGNAL TAXONOMY (47 primary + 3 derived + 6 constraints)

### I. RHETORICAL AXIS (4 signals)
- `logos_load` (0-1) — reliance on logic/evidence/data
- `pathos_load` (0-1) — reliance on emotional resonance
- `ethos_load` (0-1) — reliance on credibility/authority/trust
- `kairos_pressure` (0-1) — time-sensitivity/situational urgency

### II. COGNITIVE AXIS (4 signals, 1 derived)
- `elaboration_demand` (0-1) — deep thinking required from audience
- `bloom_level` (enum: remember|understand|apply|analyze|evaluate|create)
- `novelty` (0-1) — genuinely new information vs confirming known
- `abstraction_level` (0-1) — Hayakawa's ladder: concrete 0 to universal 1
- DERIVED: `cognitive_load` = f(elaboration, abstraction, complexity, novelty)

### III. EMOTIONAL AXIS (6 signals)
- `visceral_impact` (0-1) — immediate sensory/aesthetic reaction
- `behavioral_utility` (0-1) — enables audience to DO something
- `reflective_depth` (0-1) — invites reconsideration of beliefs/worldview
- `narrative_transportation` (0-1) — immersive mental world absorption
- `emotional_valence` (-1 to +1) — dark/tragic to bright/celebratory
- `emotional_arousal` (0-1) — intensity of emotion, independent of direction

### IV. AUDIENCE AXIS (5 signals)
- `audience_awareness` (enum: unaware|problem_aware|solution_aware|product_aware|most_aware)
- `assumed_expertise` (0-1) — domain knowledge audience already has
- `social_proof_reliance` (0-1) — "others are doing this" as lever
- `in_group_signal` (0-1) — insider jargon and shared references
- `autonomy_grant` (0-1) — agency given to audience vs directing them

### V. STRUCTURAL AXIS (3 signals, 1 derived)
- `pacing_velocity` (0-1) — how fast through ideas/topics/beats
- `tension_arc` (0-1) — builds and releases tension over duration
- `predictability` (0-1) — audience can anticipate what's next
- `linguistic_complexity` (0-1) — Flesch-Kincaid reading difficulty
- DERIVED: `information_density` = f(logos, elaboration, abstraction)

### VI. VOICE AXIS (9 signals — expanded from 4 after all 3 reviews)
- `formality` (-1 to +1) — irreverent (-1) to formal (+1). Merged from original formality + irreverence
- `humor` (0-1) — comedic intent
- `enthusiasm` (0-1) — energy and excitement
- `warmth` (0-1) — personal familiarity vs professional distance [NEW — scriptwriter]
- `epistemic_stance` (enum: teacher|peer|guide|oracle|co-discoverer) [NEW — scriptwriter]
- `certainty` (0-1) — doubt/provisionality vs confident assertion [NEW — scriptwriter]
- `temporal_orientation` (enum: forward|present|backward) [NEW — scriptwriter]
- `power_dynamic` (enum: command|invite|confide|provoke) [NEW — scriptwriter]
- `intensity_performance` (0-1) — amplification vs understatement [NEW — scriptwriter]

### VII. PURPOSE AXIS (3 signals, 1 derived)
- `education_intent` (0-1) — knowledge/skill transfer
- `entertainment_intent` (0-1) — pleasure/diversion/aesthetic experience
- `connection_intent` (0-1) — relationship building (not persuade, not teach — bond)
- DERIVED: `persuasion_intent` = max(logos, pathos, ethos)

### VIII. TEMPORAL AXIS (2 signals)
- `temporal_relevance_decay` (0-1) — 0=ephemeral, 1=evergreen
- `scope_breadth` (0-1) — narrow/specific to wide/universal

### IX. CRAFT AXIS (8 signals) [NEW — from scriptwriter review]
- `negative_space` (0-1) — proportion of deliberate absence (pauses, unsaid, white space)
- `specificity_grain` (0-1) — generic category-level to hyper-specific proper nouns
- `rhythmic_variation` (0-1) — variation in sentence/clause structure
- `pivot_intensity` (0-1) — sharpness of central turn(s)
- `callback_density` (0-1) — frequency of setup/payoff pairs
- `subtext_depth` (0-1) — gap between surface and intended meaning
- `implication_reliance` (0-1) — ratio of explicit to implied meaning
- `transition_craft` (enum: hard_cut|bridge|callback_bridge|question_bridge|tonal_shift|contradiction)

### X. VISUAL-VERBAL AXIS (3 signals) [NEW — from CEO review]
- `visual_dependency` (0-1) — how much meaning lives in visuals vs words
- `show_tell_ratio` (0-1) — demonstrate vs describe
- `multimodal_counterpoint` (0-1) — visual and verbal carry different signals intentionally

### REQUIRED CONSTRAINTS (not signals)
- `target_length` — { value: number, unit: 'seconds'|'words'|'slides' }
- `output_format` — enum of format types
- `language` — ISO 639-1

### OPTIONAL CONSTRAINTS
- `brand_voice_id` — reference to stored brand profile (overrides voice signals)
- `cta_type` — none|soft|hard|urgent
- `reading_level_target` — Flesch-Kincaid grade level

---

## ENG REVIEW KEY DECISIONS

### Signals removed (→ derived composites)
- `information_density` → derived: 0.4*logos + 0.3*elaboration + 0.3*abstraction
- `cognitive_load` → derived: f(elaboration, abstraction, complexity, novelty)
- `persuasion_intent` → derived: max(logos, pathos, ethos)

### Signals merged
- `irreverence` absorbed into `formality` (-1 to +1 scale)

### Tiered inference (how signals get set)
1. **Format defaults** — "TikTok script" instantly sets ~15 signals
2. **Brief extraction** — LLM parses user text for cues
3. **Smart defaults** — remaining signals get content-appropriate defaults
- Never ask user to set more than 3-5 signals explicitly

### Signal classification for LLM prompt
- **Primary (8-10, in LLM prompt):** pathos, logos, ethos, bloom_level, pacing, formality, humor, emotional_valence, emotional_arousal
- **Secondary (~37, system uses for technique selection):** everything else
- **Derived (3, computed):** information_density, cognitive_load, persuasion_intent

### Schema features
- `_inference_metadata` tracks WHERE each signal came from (format_default|brief_extraction|user_specified|smart_default) and confidence per signal
- All creative signals optional — system has complete default resolver
- Sparse activation: each technique specifies only 3-6 relevant signals + 0-2 inhibitors

---

## SCRIPTWRITER REVIEW KEY FINDINGS

### What the taxonomy misses about CRAFT
1. **Negative space** — the taxonomy is entirely additive. Great writing is equally about what to LEAVE OUT.
2. **Specificity** — "She drove a car" vs "She drove a 1987 Volvo 240 with a bobblehead of Ruth Bader Ginsburg." Single fastest way to make writing feel human.
3. **Rhythm** — sentence length variation IS the craft. Short. Short. Then long and flowing.
4. **The turn** — every great piece has a moment where it pivots. Not tension_arc (continuous). A discrete hinge.
5. **Subtext** — gap between surface meaning and intended meaning. Great writing operates on 2+ levels.
6. **Setup/payoff** — plant in minute 1, pay off in minute 8. Absent from taxonomy.
7. **Transitions** — how you move between ideas separates professional from amateur.
8. **Implication** — great writing trusts the audience to construct meaning from what's implied.

### Voice axis expansion rationale
4 signals can't distinguish:
- MrBeast (maximalist, performative) vs Casey Neistat (laconic, observational)
- Vox (smart friend explaining) vs Kurzgesagt (benevolent alien showing universe)
- Nike (imperative, pressurized) vs Patagonia (reflective, unhurried)
- Startup scrappy (breathless, future-oriented) vs Apple restrained (future already arrived)

Differences captured by: epistemic_stance, warmth, certainty, temporal_orientation, power_dynamic, intensity_performance

### "Where this system would still produce mediocre output"
1. Writing that is correct but not SURPRISING — no signal for deliberate rule-breaking
2. Writing with no voice SIGNATURE — two writers with identical signals still sound different
3. Writing that doesn't BREATHE — signals are static, but within a piece both pacing and emotion should be in constant motion

---

## RESEARCH DATA (condensed — full data in session transcript)

### Video Scriptwriting
- Hook: 0.4s stopping, 70-85% 3s retention = 2.2x views, 7 hook types
- MrBeast: every second earns next second, time-block structure, open loops, retention graph analysis
- Narration-visual: 4 modes (complement 80%, counterpoint, illustration=amateur, anchoring)
- WPM: 150 standard, 30s=65-85 words, 60s=130-170 words, 10% breathing room
- Anti-AI: 600+ banned words, structural tells (uniform length, formulaic openers)
- Brand timing: first 5s +182% awareness, sonic first 2s +191%, CTA opening +44% conversion
- DR frameworks: PAS <30s, AIDA 60s+, BAB transformation, hybrid wins

### Posts/Captions
- LinkedIn: 1300-1900 chars sweet spot, carousels 6.6%, 210 chars before fold
- Twitter/X: threads 63% more impressions, 5-7 tweets, 71-100 chars optimal single
- Instagram: 125 chars before fold, DM shares #1 signal, keywords > hashtags (5 cap)
- Attention: 8.25s average, 0.4s stopping, Gen Z 6.5s
- Triggers: curiosity, social proof, emotional arousal, FOMO, reciprocity, identity
- Formatting: 15-20 word sentences, 1-3 sentence paragraphs, white space
- Calendar: 80/20 (value/promo), quality > quantity

### Non-Marketing Content
- Educational: Gagne's 9 Events, Mayer's 12 Principles, 6-min optimal (edX 6.9M sessions)
- Documentary: Nichols' 6 Modes, two-column AV script, Ken Burns "literary dimension"
- Corporate: Single-Message, under 90s, authenticity > polish
- Brand films: values-first (Patagonia), product invisible, 31% sales lift (Nike Dream Crazy)
- Explainer: intuition before formalism (Kurzgesagt/3B1B), progressive disclosure, dual coding
- Podcast: Ira Glass anecdote+reflection, three-part arc, question clusters
- Presentation: Duarte Sparkline (what is/what could be every 45-90s), 9-min brain-perk rule
- Long-form: inverted pyramid, white paper structure, case study BAB
- Product demo: outcome-first, Feature→Benefit→Value, one problem per video

### Signal Taxonomy Sources
All 47 signals grounded in established theory:
- Aristotle (rhetoric), Bloom (taxonomy), Schwartz (awareness), Norman (emotional design)
- Shannon (information theory), Cialdini (influence), Mayer (multimedia learning)
- NN/g (tone dimensions), Petty & Cacioppo (ELM), Sweller (cognitive load)
- Green & Brock (transportation), Russell (circumplex), Hayakawa (abstraction)
- Freytag (tension), Jakobson (language functions), Deci & Ryan (SDT)

---

## DOC STRUCTURE (7 parts, mirrors editing doc v3)

Part 0: Content Intent Schema — scope, cascade, FORMAT ranges, inference, transitions, authority matrix
Part 1: Voice & Brand System — 3-layer voice signature, personas, brand DNA, FORMAT presets, regulatory
Part 2: Brief Signal Dictionary — 47 signals across 10 axes with 5-level behavioral anchors
Part 3: Signal Dynamics — unified BREATHING+SURPRISE, breath groups, moments, envelopes, arc contrast
Part 4: Signal → Writing Technique Atlas — 25 technique cards, selection algorithm, priority rules
Part 5: Writing Technique Reference — full specs for hooks, structures, narration, CTA, transitions, surprises
Part 6: Writing Constraints — anti-AI (10 constraints), platform, pacing, brand safety, readability, regulatory
Part 7: Irreducible Writing Knowledge — Aristotle, Freytag, Cialdini, Mayer, Sweller, Green&Brock, ELM
Part 8: Platform & Format Constants — TikTok, Instagram, LinkedIn, YouTube, X, Email, WPM tables

STATUS: v1.0 COMPLETE. 4,338 lines. 18 CEO/Eng/Copywriter reviews. 55 fixes applied.
FILE: editron-worktree/docs/creative-content-knowledge.md

Consumers: ThinkForge agents (outline, contract, author, section, refinement, coherence, stylist)
