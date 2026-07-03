# SaaS Explainer Content Bible

**Layer:** Content doctrine. Sits between Brand Vault / input analysis and the SaaS Director (storyboard planner). Everything downstream — Director, Remotion motion engine, VO/caption/music/SFX engines, QA gate — consumes this document's rules, either directly or via the knowledge graph in Section 11.

**What this is:** The definition of what a premium SaaS explainer contains, how scenes are chosen, what evidence each claim requires, and how motion, voice, and sound must behave. This is the layer that turns "generate a product video" into a directed, evidence-backed film.

**What this is not:** Implementation code, brand-specific copy, or a template library. Reference videos (Lovable-2.0-class launch films and equivalents) are quality benchmarks only. Nothing here reproduces their layouts, wording, screens, claims, or assets — Section 7 makes copying a hard-fail condition.

**Version:** 1.2.0 · Doctrine ID: `saas-explainer-bible`
**Changelog:** 1.1.0 added the narration-mode axis, the `section_header` family, and repeat-group notation. **1.2.0 is the grounding release:** every numeric constant is now derived from published standards, peer-reviewed research, platform data, or named practitioner consensus (Section 12 maps each number to its source); the narration-mode axis expands from 2 to 6 modes; a 15-archetype Visual Archetype Library replaces the old 6-item list; the legibility formula is rebuilt on subtitle reading-speed research; audio levels, sync tolerances, tempo, and SFX density are re-specified from ITU/EBU/W3C standards and mixing practice; and the evidence rules gain their legal floor (FTC substantiation doctrine).

---

## 1. North Star

A **premium SaaS explainer** is a short film in which a real product, wearing its own brand, proves it can do a specific job — timed to a voice, and honest about every claim. It should look like a senior brand studio spent two weeks on it: nothing on screen is accidental, nothing on screen is invented.

### The Six Laws

**1. Product-led.** The product is the protagonist. Real product evidence (screenshots, recordings, verified capability) is the spine of the video. If the product is never shown doing its job, the output is an ad, not an explainer — and it must be declared as such (brand film / teaser), never disguised as a demo. The viewer's dominant memory after watching should be *the product working*, not the motion graphics around it.

**2. Brand-led.** Brand Vault tokens govern 100% of styling. Colors, type, logo behavior, voice, and motion taste come from the Vault — never from the reference video, never from model defaults. The test: strip the logo from any frame; the video should still be recognizably that brand's.

**3. Readable.** Every text element passes a legibility gate: size × contrast × hold duration. If a viewer can't comfortably read it on a phone at arm's length, it does not ship. Readability outranks style. Always.

**4. Cinematic.** Deliberate energy curve, deliberate camera language, deliberate restraint. Premium is defined by what's left out: one idea per scene, one owner of attention per frame, cuts by default, holds that last past comfort on the moments that matter. Motion wallpaper — everything drifting, nothing meaning — is the signature of cheap.

**5. VO-timed.** The narration is the conductor; visuals are the orchestra. Every significant visual event binds to a narration anchor (stress word, number, product-name drop, imperative). A reveal that lands in dead air, or a number that appears before the voice says it, breaks the illusion of direction.

**6. Proof-based.** The system is a witness, not an author of facts. Every customer name, metric, integration, capability, testimonial, compliance badge, and price on screen traces to a source in the input set via the Claim Ledger (Section 5). No source, no render. This is the honest-encoding principle applied to marketing: the wire from input evidence to on-screen claim must be unbroken.

### The Three-Question Test

A finished video passes only if a first-time viewer can answer:

1. **"What is this?"** — by the 10-second mark (or 33% of runtime for videos under 30s).
2. **"Why is it better than what I do now?"** — by 60% of runtime.
3. **"What exactly do I do next?"** — by the final frame, unambiguously, with a readable URL or action.

**Why the clock is set this tight.** Platform-scale viewing data backs the timing: roughly 30% of viewers are gone within the first 30 seconds, the sharpest loss anywhere in a video, and hosting-platform analysis of drop-off patterns puts the hook's real deadline at about five seconds. Videos under a minute retain only about half their audience on average even when they're good. Every second of throat-clearing is paid for in viewers — which is why the logo-first intro is banned (the brand stamp belongs at the end, after the value has been earned), and why the three questions have deadlines instead of suggestions.

### What Premium Is Not

- A template slideshow with the brand's colors poured in.
- A stock-metaphor montage (gears, handshakes, rockets, city timelapses).
- Karaoke captions over animated gradients.
- A fake dashboard invented to look like "a SaaS product."
- A feature laundry list narrated at constant energy.
- Motion for motion's sake — parallax on everything, whoosh on everything.

Every one of these is an anti-pattern with a corresponding gate in Section 10.

---

## 2. User Inputs

The system receives up to six inputs. Each has a defined role, a defined authority domain, and a defined failure mode. The core rule: **inputs are consulted by domain, not by a single global ranking** — identity questions go to the Vault, capability questions go to visual evidence, style questions go to taste and reference.

### Authority by Domain

| Domain | Authority order (highest first) |
|---|---|
| Brand identity (logo, color, type, voice) | Brand Vault → *nothing else, ever* |
| Narration text | User script (verbatim law) → generated under Vault voice + brief |
| Claims (metrics, customers, compliance, pricing) | User brief/script → Vault proof claims → *nothing else* |
| Product capability (what it can be shown doing) | Screenshots/recordings → product URL content → brief assertions |
| Structure & intent (duration, audience, goal, platform) | User brief → Vault audience/positioning → defaults |
| Style & rhythm (pacing, transitions, energy) | Vault motion taste → reference video style DNA → doctrine defaults |

The reference video appears in exactly one row. It is never an evidence source and never an identity source.

### Per-Input Rules

**Brand Vault** — the identity constitution and claim inventory. Three distinct roles: *identity is law* (logo, colors, fonts — non-negotiable, applied to every frame), *taste is bias* (voice, motion taste, audience — shapes decisions without dictating them), *proof is inventory* (proof claims are the only pre-approved claim list). Full usage rules in Section 6.

**Product URL** — the product-truth source. Extraction targets: product vocabulary (the nouns and verbs the brand itself uses — the video must speak the product's own language, not generic SaaS-speak), feature inventory, positioning lines, publicly stated integrations/customers/metrics (these count as brand-published claims and are Ledger-admissible with source `url`), and capturable UI. URL copy is marketing language the brand already publishes — usable, but visual evidence still outranks it for *showing* capability.

**Product screenshots** — the highest-value asset in the entire input set. Real UI beats synthetic UI in every scene where both are possible. Screenshots are treated as photographs of truth: crop, zoom, pan, and highlight are allowed; repainting content, altering data, or compositing fabricated elements into a real screenshot is prohibited. Each screenshot should be analyzed for: which feature it evidences, its strongest crop region, its text density (drives hold duration), and its resolution ceiling (drives maximum zoom before degradation — below threshold, use tighter crops rather than full-frame blur).

**User brief** — intent. Supplies audience, goal, platform, duration, tone pointers, and priority messages. The brief selects the story structure (Section 4) and can include user-asserted claims: these are admissible (the user owns them) but are Ledger-tagged `source: brief` so accountability is traceable. The brief never overrides Vault identity tokens.

**User script** — when provided, the script is law for narration. The system times visuals to it; it does not rewrite it. Permitted operations: marker annotation (Section 9), splitting into scene-sized phrases, and flagging lines that carry claims with no supporting evidence (flag upstream — do not silently cut or silently render). A partial script is completed in the same register, and generated lines are tagged as generated.

**Reference video** — style evidence only. The system extracts style DNA as parameters (Section 7) and discards the asset. It contributes zero words, zero layouts, zero colors, zero claims.

### Missing-Input Behavior

The system degrades loudly, never silently. Every degradation is recorded and surfaced upstream (the Director's plan should carry a `degradations[]` list a human can read).

| Missing input | Degradation | Forbidden response |
|---|---|---|
| Screenshots + URL capture (no real UI at all) | Video becomes a **declared-abstract** product film: brand-styled schematic motifs, typography-led scenes. `ui_proof` and `workflow_demo` families are disabled. Video may not be framed as a demo. | Fabricating a dashboard and presenting it as the product |
| Product URL | Rely on Vault product context + brief for vocabulary; capability set shrinks to what screenshots/brief evidence | Inventing features from category knowledge ("SaaS products usually have analytics") |
| User brief | Infer audience/goal from Vault; default to 60s launch structure; flag assumption | Guessing a niche audience and writing insider copy for it |
| User script | Generate narration under Vault voice rules + Section 9 marker discipline | Free-styling tone outside the Vault voice |
| Reference video | Use Vault motion taste + doctrine default style parameters | Imitating a famous launch video from memory |
| Proof claims (Vault + brief empty) | Cut `proof_metric`, `social_proof`, `objection_handling` families; extend product evidence scenes | Inventing metrics, customers, or badges |
| Brand Vault weak/partial | Section 6 weak-Vault ladder + mandatory gaps report | Silently substituting a generic "modern SaaS" look |

**Conflict rule:** when inputs disagree inside a domain, the higher authority wins and the conflict is logged. When a user script asserts something no evidence supports, the claim is flagged for the user — the system neither launders it into "verified" nor deletes the user's words without notice.

### Narration Mode

Every plan declares one narration mode before storyboarding. A mode answers two questions: **who carries the verbal argument** (a narrator, the founder, a customer, on-screen text, or nobody) and **what the master clock is** (a voice timeline or the music's beat grid). Crossing those questions yields six modes — all real, all shipping in the wild:

| Mode | Who speaks | On camera? | Master clock | Register |
|---|---|---|---|---|
| `vo` *(default)* | Third-person narrator | No | VO timeline | Classic launch/explainer |
| `founder_vo` | Founder, first person | No | VO timeline | Product-led walkthrough; conversational, "let me show you" |
| `talking_head` | Founder/creator/presenter, on camera + product B-roll | Yes (full or PiP) | VO timeline (the on-camera speech) | UGC-style ads, LinkedIn-native launches, AI-presenter demos |
| `testimonial_led` | Customers, in their own words | Usually (Zoom-frame authenticity) | VO timeline (stitched quotes) | Proof-led enterprise, case-study films |
| `text_driven` | Nobody — statement cards **are** the narration | No | Music beat grid | Music-driven launches (the Lovable/Ramp register) |
| `ambient_demo` | Nobody — the product speaks via captioned in-app actions | No | Beat grid + interaction rhythm | Raw-demo culture, "watch it work" clips |

**Selection.** The user's explicit choice wins. A supplied script implies a voiced mode unless stated otherwise; supplied founder/customer footage implies `talking_head`/`testimonial_led` and that footage becomes evidence under Section 5. With no script and no stated preference, `vo` remains the default; a reference whose style DNA reads text-driven may *suggest* `text_driven` — surfaced, never silently adopted. One mode per video; a mid-video mode switch reads as two videos stapled together. (Exception: `talking_head` naturally alternates camera and product B-roll — that alternation is inside the mode, not a mode switch.)

**Shared law across all six:** the claim rules do not care who is talking. A card, a founder, a customer, and a narrator are all held to the same Claim Ledger — and testimonial modes are held to *more*, not less, because endorsement law adds a typicality requirement on top (Section 5.5).

**What each mode changes downstream:** Section 9.0 carries the full audio remap per mode (anchors, captions, ducking, SFX budget). Structurally: `text_driven` makes `section_header` first-class; `founder_vo` maps to Structure 4.5's register; `testimonial_led` feeds Structure 4.6; `talking_head` shortens type scenes (the human face replaces the statement card as the emotional carrier) and demands honest B-roll — the product footage behind a presenter obeys 8.10 like any other UI on screen.

---
## 3. Scene Families

Scene families are the atomic units the Director composes from. Each family has a fixed contract: what it's for, what evidence it demands, how it looks, what the voice does, what the camera does, and how it typically fails. The Director may style a family many ways; it may not violate the family's contract.

Duration ranges are for 1080p landscape at normal launch-video pacing; the teaser structure (Section 4) is the only context allowed to compress below these floors, using the flash-variant rules noted where they exist.

**Narration-mode transfer rule:** every "Narration role" below is written for voiced modes (`vo`/`founder_vo`/`talking_head`/`testimonial_led` — the register shifts, the instruction doesn't). In `text_driven`, the same instruction applies to the scene's primary on-screen text line — the reveal anchor becomes a beat anchor, the stressed word becomes the emphasized word on the card, and the claim rules apply unchanged. In `ambient_demo`, it applies to the interaction caption. Scenes whose narration role is "silence" (`ui_proof` holds, `logo_outro`) are identical in every mode.

### 3.0 Visual Archetype Library

An archetype is the compositional identity of a frame — what kind of picture the viewer is looking at, independent of styling. The Director picks one archetype per scene (the variety law in 8.5 governs rotation); families below declare which archetypes they admit. Fifteen archetypes cover the modern SaaS register; industry taxonomies of explainer styles (motion graphics, screencast, kinetic type, live action, character, 3D, mixed media) collapse into this scene-level vocabulary.

| # | Archetype | What the frame is | Native evidence class | Notes / when it earns its place |
|---|---|---|---|---|
| 1 | `TYPE_ONLY` | A statement or name on a clean brand field | claim / none (headers) | The kinetic-typography register; carries `text_driven` narration; emptiness is the function |
| 2 | `TYPE_OVER_MEDIA` | Display type set over dimmed UI/footage | claim + context | Type owns the frame; media is context at ≤ 40% visual weight, never both fighting |
| 3 | `UI_FULL_BLEED` | Raw full-frame screen capture | screenshot_visible | The screencast register; honesty at maximum, styling at minimum; UI text must survive 8.3 |
| 4 | `UI_FRAMED` | Capture inside browser/app/device chrome on a brand field | screenshot_visible | The default product frame; chrome must be real chrome (8.10) |
| 5 | `UI_CROP_ZOOM` | A cropped region of real UI filling the frame | screenshot_visible | The feature-demo workhorse; the feature occupies the frame, not 4% of it |
| 6 | `CURSOR_HERO` | Close capture following a live cursor/interaction, smooth zoom-pan | screenshot_visible (interaction) | The modern demo dialect (Screen-Studio-style); motion comes from the *recording*, rig adds only camera |
| 7 | `UI_FLOAT_STACK` | Multiple UI panels/layers floated in composed space | screenshot_visible ×N | Exploded-view storytelling; each panel real; depth implies relationship, so only related panels stack |
| 8 | `DEVICE_CONTEXT` | Product on a device in a physical scene (desk, hands, lifestyle) | screenshot_visible + staging | Live-action/mockup register; humanizes; the screen content is still evidence and still obeys 8.10 |
| 9 | `HUMAN_FRAME` | A person on camera — founder, presenter, customer | testimonial / delivery | The talking-head register; full-frame or PiP over product; authenticity beats polish here |
| 10 | `BENTO_GRID` | A composed grid of feature tiles | mixed (each tile sourced) | Breadth-at-a-glance; every tile is a claim; ≤ 6 tiles or nothing is readable |
| 11 | `DIAGRAM_SCHEMATIC` | Declared-abstract nodes/flows/shapes explaining a concept | declared abstraction | The motion-graphics register for the invisible (architecture, pipelines); never wears product costume |
| 12 | `DATA_VIZ` | A chart, counter, or metric as the subject | vault_proof / verbatim number | Numbers land here; axes honest, baselines shown, count-ups decelerate |
| 13 | `SPLIT_COMPARE` | Two states/options sharing the frame | per-side sourcing | Before/after and us/them; asymmetric weight rules from the comparison family apply |
| 14 | `ICON_CONSTELLATION` | Logos/icons arranged around a hub or grid | verified integrations/platforms | Integration and publish-everywhere scenes; every logo shown is a verified claim |
| 15 | `LOGO_FIELD` | The brand mark on a clean field | vault asset | Outro territory; earns ≤ 3 seconds of the video, at the end |

Three library-wide rules. **Evidence binding:** an archetype's native evidence class is a contract — `UI_*` archetypes render only supplied captures; `DIAGRAM_SCHEMATIC` is the *only* home for synthetic product-adjacent visuals. **Register coherence:** archetypes 1–2 + 11–12 read as motion graphics; 3–7 read as product film; 8–9 read as live action; a video mixes registers deliberately (the hybrid MG-plus-screencast blend is the dominant modern SaaS register) but each scene knows which register it's in. **Coverage duty:** a launch video that never leaves archetypes 1–2 has no product in it; one that never leaves 3–5 is a tutorial, not a launch — the structure's evidence bill forces the mix.

---

### 3.1 HOOK — `hook` (2–4s)

**Purpose.** Earn the next ten seconds. Establish tension or spectacle before the viewer's thumb moves.

**When to use.** Always. First scene of every structure, no exceptions.

**Required evidence.** None strictly — but the hook should spend the *strongest single asset available*: the most impressive real UI moment, or the sharpest tension line derived from the audience's actual pain. Any claim used in a hook line must already be Ledger-admissible.

**Visual language.** One idea, maximum confidence. Either bold display type on a brand field, or a full-bleed product moment. No logo-first opens (the logo has an outro; it hasn't earned the open). Fewer than four elements on screen.

**Narration role.** First line ≤ 12 words. A question, a tension statement, or a category-defiant claim. Never "In today's fast-paced world." The first stressed word is the video's first anchor.

**Motion role.** Motion within the first 300–500ms — a static open reads as a broken render. One decisive move (type slam, hard push, or cut-in on action), then cut before comfort. Energy 0.9 on the video's 0–1 curve.

**Common mistakes.** Logo-first opens; slow fade-ins; stacking value prop + brand + UI in one frame; a hook line that could describe any product in the category.

**Abstract pattern.** `[COLD OPEN: brand field] → [tension line slams in on first VO stress word] → [optional second line stacks under] → [hard cut on the consonant]`

---

### 3.2 PROBLEM — `problem` (4–10s)

**Purpose.** Make the viewer feel the cost of the status quo, concretely enough that the product's arrival is a relief.

**When to use.** Explainers ≥ 45s aimed at audiences not already problem-aware. Skip for launch teasers and for hype-aware audiences (they came for the product, not a lecture).

**Required evidence.** Audience pain from brief or Vault audience/positioning. No statistics unless Ledger-admissible — a problem scene is the most common place systems smuggle in fake numbers ("teams waste 20 hours a week…"). If the number isn't sourced, the pain is expressed qualitatively.

**Visual language.** Constrained, deliberately uncomfortable: desaturated or muted palette (still Vault-derived — the brand's neutrals, not arbitrary gray), fragmented or cramped compositions, "before"-state artifacts (scattered tabs, threads, files — abstract, not a competitor's real UI). The product does not appear. The accent color does not appear — it's being saved for the turn.

**Narration role.** Second person, concrete pain verbs, no melodrama. Name the actual workflow pain the audience recognizes, in their vocabulary. Two sentences maximum.

**Motion role.** Heavier and slightly off-rhythm: staccato entries, interruptions, accumulation. Friction is expressed through motion texture, not through chaos. Energy drops to ~0.5 — the contrast is what makes the promise land.

**Common mistakes.** Spending more than 20% of runtime on the problem; abstract global statements ("data is exploding"); showing the product during the problem; stock-metaphor chaos; fake statistics.

**Abstract pattern.** `[pain artifacts accumulate one by one, rhythm tightening] → [composition becomes claustrophobic] → [beat of silence] → [hard cut to relief]`

---

### 3.3 PRODUCT-LED PROMISE — `promise` (4–7s)

**Purpose.** Name the product as the answer, in one sentence. This is the turn — the single most important cut in the video.

**When to use.** Immediately after the problem (or directly after the hook when the problem is skipped). Exactly once.

**Required evidence.** Product name, logo asset, and the one-line positioning statement from the Vault (or brief). Ideally a first glimpse of real UI.

**Visual language.** The palette flips to full brand confidence: light, space, the accent color's first appearance. Product name or logo plus the single positioning line. If real UI exists, it enters here — beneath or behind the name, large enough to be legible, small enough not to fight the name.

**Narration role.** "Meet [product]." / "This is [product]." followed by the positioning line. One value proposition, not three. The product-name drop is a NAME anchor — the visual name-set binds to it within ±120ms.

**Motion role.** Release of tension: one clean, open, decisive move into stillness. More whitespace than any scene before it. Energy ~0.7 — confident, not frantic.

**Common mistakes.** Multiple value props at once; burying the product name mid-sentence; revealing UI at postage-stamp size; reusing the hook's energy so the turn doesn't feel like a turn.

**Abstract pattern.** `[cut from tension to open brand field] → [product name sets exactly on the VO name-drop] → [positioning line sets under] → [real UI slides in beneath and settles]`

---

### 3.4 WORKFLOW DEMO — `workflow_demo` (10–25s)

**Purpose.** Show the end-to-end job getting done: input → process → outcome. This is where the viewer decides the product is real.

**When to use.** Videos ≥ 60s where the product's value is a *flow* rather than a single feature. The spine of demo explainers and founder walkthroughs.

**Required evidence.** Real screenshots or recordings covering the actual step sequence, and knowledge of the true step order (from URL flow analysis or brief). If the step order is unknown, this family is disabled — a guessed workflow is a fabricated capability.

**Visual language.** Sequential UI states with visible continuity: the *same project, same data, same content* flows through every step. Step markers (01 → 02 → 03) in the brand's mono/label face. Maximum 4 steps per workflow scene; more steps means splitting into two scenes or cutting steps.

**Narration role.** Procedural but outcome-framed: narrate what the user achieves, not which button they press ("Your brief becomes a first cut" — not "Click the generate button"). Each step boundary is a REVEAL anchor.

**Motion role.** Connected camera moves that imply continuity: lateral pans between steps, match cuts where an element from step N physically carries into step N+1's entrance. Each step gets a settle-and-hold long enough to pass the legibility gate for its densest text. Energy 0.6–0.7, steady.

**Common mistakes.** Cursor-following screen-capture feel; teleporting data (step 2 shows different content than step 1 produced); more than 4 steps; equal time per step regardless of importance; narrating the interface instead of the outcome.

**Abstract pattern.** `[step 01 UI settles, marker sets] → [output element of step 01 carries across the transition] → [step 02 receives it] → … → [final outcome state gets the longest hold]`

---

### 3.5 FEATURE DEMO — `feature_demo` (5–8s per feature)

**Purpose.** Prove one capability. Singular. One feature per scene is a law, not a preference.

**When to use.** After the promise. Count scales with duration: 2 features at 45s, 2–3 at 60s, 3 at 90s. Features are chosen by audience priority (brief) — never by "what we have screenshots of," unless evidence forces the substitution (and then the degradation is logged).

**Required evidence.** A screenshot evidencing the feature, or a URL/brief-verified capability. A feature with no visual evidence may only be *told* (typographic scene), never *shown* via invented UI.

**Visual language.** Crop and zoom to the feature's region — the feature should occupy the frame, not 4% of a full-app screenshot. One highlight treatment (draw-on ring, underline, or dim-the-rest), applied once. A short feature label (≤ 4 words) in the brand label face.

**Narration role.** Benefit first, mechanism second: "Ship in one click" beats "We have a deploy button." The benefit's stressed verb is the reveal anchor; the label sets on it.

**Motion role.** Wide-to-close push into the region, highlight lands once (never pulses repeatedly), one micro-interaction beat if evidence supports it, settle, hold to legibility. Energy ~0.65.

**Common mistakes.** Three features in one scene; full-app screenshots where the feature is unreadable; highlight strobing; UI on screen too briefly to parse; features chosen by asset availability without logging the compromise.

**Abstract pattern.** `[wide UI establishes context, 0.5s] → [push into feature region] → [label sets on VO stress verb] → [one interaction beat] → [hold]`

---

### 3.6 UI PROOF MOMENT — `ui_proof` (4–8s)

**Purpose.** The "it's real" beat. Credibility through an unedited-feeling look at the actual product. Distinct from a feature demo: this scene proves *existence and quality*, not a specific capability.

**When to use.** At least once in any product-led video. The emotional center of demo explainers. The single scene most correlated with "this looks legit."

**Required evidence.** Real screenshots or recordings **only**. Synthetic UI categorically disqualifies this family — a fake UI-proof scene is the definition of the fake-dashboard failure and is a hard fail (Section 10).

**Visual language.** Full-frame or near-full-frame UI. Minimal overlay — at most a whisper of a caption. Honest detail: real density, real content, no decorative glow, no fake data sparkle. Treat the screenshot like hero product photography.

**Narration role.** Quieter. One confident short line — or nothing, letting music carry a beat. This is the one scene where VO silence is a designed choice rather than a sync failure.

**Motion role.** Slow push (2–4% scale over the hold) or a clean hold with micro-drift. The longest hold in the video lives here — hold past comfort; that discipline is a premium tell. Energy dips to ~0.5 deliberately.

**Common mistakes.** Over-decorating the frame; cutting away at 2s because the pacing model got nervous; compositing fake elements "to make the UI pop"; using a mockup and hoping nobody notices.

**Abstract pattern.** `[hard cut to full UI] → [slow 3% push begins] → [single quiet VO line or music beat] → [hold 1s past the point that feels safe] → [cut]`

---

### 3.7 PROOF / METRIC — `proof_metric` (4–7s)

**Purpose.** Quantified believability. A number the viewer can repeat to their boss.

**When to use.** Whenever an admissible metric exists. Mandatory in enterprise structures; the flagship moment of the 60s launch structure's back half.

**Required evidence.** Numbers exclusively from Vault proof claims, brief, or brand-published URL content — verbatim value, verbatim unit, with context. Never generated, never rounded up, never given invented precision ("~3x faster" may not become "3.2x faster").

**Visual language.** Big numeral typography in the display face — the number is the composition. One metric per frame (two metrics may share a scene only as sequential beats, never simultaneous rivals). A context line beneath in body scale; source attribution if available.

**Narration role.** The voice says the number; screen and VO must agree exactly. The spoken number word is a NUMBER anchor — the numeral's final value lands on it.

**Motion role.** Count-up is permitted only if the final value then holds legibly ≥ 1s; otherwise scale-settle the finished number. Count-ups ease out — they decelerate into the true value, never overshoot past it. Energy peaks here (~0.8): this is the crescendo.

**Common mistakes.** Fake precision; unattributed superlatives ("the fastest platform"); three metrics fighting in one frame; count-ups so fast the number never registers; VO saying "three times" while screen shows "3.4x."

**Abstract pattern.** `[numeral counts up, decelerating] → [lands exact value on the VO number word] → [unit + context line sets under] → [hold]`

---

### 3.8 COMPARISON — `comparison` (6–10s)

**Purpose.** Position against the status quo. Make the switch feel obvious, not argued.

**When to use.** When the category has an entrenched "old way" the audience recognizes. Optional in most structures. Naming a specific competitor is allowed **only** when the user explicitly instructs it and supplies the comparative claims; the default form is always "the old way vs. with [product]."

**Required evidence.** An honest, defensible contrast. The "before" side must be a fair depiction of the generic old workflow — a strawman before-state is a credibility leak the audience notices instantly.

**Visual language.** Split or sequential before/after with asymmetric weight: the "before" is muted, cramped, accent-free; the "after" wears full brand light and owns the accent color. Never a 50/50 frame — visual weight is the argument.

**Narration role.** Contrast structure: "Before, X. Now, Y." Short clauses, parallel construction. The pivot word ("now") is the anchor for the wipe.

**Motion role.** The "after" side receives objectively better motion — smoother easing, cleaner settle, more light. The transition itself carries the meaning: a wipe or push that physically replaces old with new. Energy 0.7.

**Common mistakes.** Strawman before-states; naming competitors uninstructed; equal visual weight; before/after so stylistically identical the point is lost; letting the comparison run long enough to feel defensive.

**Abstract pattern.** `[muted 'before' panel, friction texture] → [wipe on the VO pivot word] → [brand-lit 'after' panel] → ['after' expands to full frame and settles]`

---

### 3.9 SOCIAL PROOF / TESTIMONIAL — `social_proof` (5–8s)

**Purpose.** Borrowed trust. Other humans and companies vouching.

**When to use.** When — and only when — real testimonial text, real names/roles, or permitted logos exist in the Vault or brief. This family has zero fallback content: no evidence, no scene.

**Required evidence.** Testimonials verbatim with attribution exactly as provided. Customer logos only as supplied assets (presence in the Vault implies permission; the system never sources logos from the web). Counts ("500+ teams") only if Ledger-admissible.

**Visual language.** Quote typography with generous space; attribution line (name, role, company) in the label face; logo strips with clear hierarchy and equal treatment — no logo soup. Photography only if supplied.

**Narration role.** The VO does not read the quote verbatim over the viewer reading it (dueling channels). Either the VO carries a summary line while the quote reads silently over music, or the VO goes quiet for the beat.

**Motion role.** Gentle. Quotes need reading time — hold duration computed from word count via the legibility formula, no exceptions. Line-by-line set is permitted; word-by-word karaoke is not (this is a testimonial, not a lyric video). Energy ~0.55.

**Common mistakes.** Fabricated names or companies (instant hard fail); logo walls with fifteen equal logos; quotes trimmed to change meaning; quotes too long to read at the assigned hold.

**Abstract pattern.** `[quote sets line by line, music forward] → [attribution sets] → [logo strip resolves in a single row] → [hold to read]`

---

### 3.10 OBJECTION HANDLING — `objection_handling` (6–10s)

**Purpose.** Preempt the single biggest reason the viewer won't act — security, migration effort, "another tool" fatigue, team adoption.

**When to use.** 90s demo and enterprise structures. Pick **one** objection (the audience's top blocker per the brief), not a checklist of five.

**Required evidence.** The strictest gate in the doctrine: security and compliance claims (SOC 2, ISO 27001, GDPR, HIPAA…) render only if the exact certification appears verbatim in the inputs. Generic security iconography (locks, shields) is permitted only when *some* security claim exists — a lock next to nothing implies certification that was never claimed.

**Visual language.** Calm and orderly: verified badges or plain-set facts, checklist motifs of admissible claims, stable grid. This is the most restrained frame in the video.

**Narration role.** Name the objection plainly, then dissolve it with a verified fact. Directness reads as confidence; hedging reads as guilt. Two sentences.

**Motion role.** Near-stillness. Elements set and stay. Stability is the message — an objection scene that jitters undermines itself. Energy ~0.5.

**Common mistakes.** Inventing compliance certifications (hard fail, the worst single failure this system can produce); answering five objections at speed; defensive tone; burying the objection scene after the CTA.

**Abstract pattern.** `[objection stated as plain type] → [verified counter-fact sets beneath, steady] → [badge/checkmark resolves once] → [long stable hold]`

---

### 3.11 CTA — `cta` (4–7s)

**Purpose.** One action. The entire video funnels here.

**When to use.** Always, second-to-last scene (or merged with the outro as one designed unit).

**Required evidence.** Real CTA language and destination from the Vault or brief. A real, current URL — the system never invents `getproduct.com`. "Free trial" appears only if the offer is confirmed in inputs.

**Visual language.** Maximum simplicity: one action verb phrase, high contrast, the URL readable at body scale or larger. One CTA — "Start free, or book a demo, or follow us" is three videos' worth of endings fighting.

**Narration role.** Imperative, ≤ 8 words, matching the on-screen text word-for-word. The imperative verb is the anchor.

**Motion role.** Confident set into deliberate near-stillness — the only intentional quiet-frame in the video, kept alive with micro-motion (breathing scale ≤ 1%, subtle field drift) so it never reads as a frozen render. Hold long enough to read the URL twice. Energy steps down to ~0.6.

**Common mistakes.** Multiple CTAs; URL in fine print; cutting away before the URL is readable twice; VO saying "get started today" while the screen says "Book a demo."

**Abstract pattern.** `[frame clears] → [CTA verb phrase sets on the VO imperative] → [URL sets beneath] → [near-still hold to the read-twice threshold]`

---

### 3.12 LOGO OUTRO — `logo_outro` (2–3s)

**Purpose.** The brand stamp. The last pixel the viewer keeps.

**When to use.** Always, final scene.

**Required evidence.** Logo asset from the Vault, correct variant for the background. Optional tagline only if it exists in the Vault.

**Visual language.** Logo on a clean brand field. Nothing else competing. If CTA and outro are merged, the merge is designed (URL persists small beneath the logo), not collided.

**Narration role.** Silence, or at most the brand name spoken once. The VO's work is done.

**Motion role.** One signature move — this is where the brand's logo behavior (from motion taste) lives — resolving to true stillness with ≥ 1s of quiet hold. Optional SFX sting, once. Energy resolves to ~0.3.

**Common mistakes.** Logo animations over 2.5s (self-indulgence); busy backgrounds; logo and CTA fighting for the same beat; ending on motion instead of rest.

**Abstract pattern.** `[CTA fades] → [logo sets with its signature move] → [1s true-still hold] → [end]`

---

### 3.13 SECTION HEADER — `section_header` (1.5–4s)

**Purpose.** A chapter title. Names the capability the next scene will prove — "Multiplayer," "Introducing Agent Mode," "Edit in preview." It is not a hook, not a promise, not a claim: it's the label on a drawer the viewer is about to see opened. *(Numbered 3.13 to preserve cross-references; in a storyboard it sequences between `promise` and the demo families, recurring before each demo group.)*

**When to use.** Feature-parade structures and any video presenting 3+ distinct capabilities, where viewers need chapter boundaries to track what they're seeing. First-class in `text_driven` mode, where it carries the narration between demos. Never in a 30s teaser — at that length, headers are overhead.

**Required evidence.** None — by design. A header may contain **only** the capability's name (≤ 4 words, one line) plus at most a status tag that exists in evidence ("Beta," "New"). The instant a header contains a verb-claim, a number, or a superlative, it stops being a header and gets reclassified as a claim card — full Ledger rules apply. This evidence-free status is paid for by one iron rule: **the orphan rule.** Every `section_header` must be immediately followed by a scene that proves the named capability (`feature_demo`, `workflow_demo`, or `ui_proof`). A header whose check the next scene doesn't cash is an orphan, and an orphaned header is a fabricated capability claim — reject.

**Visual language.** The most minimal scene in the system: capability name on a clean brand field, brand display face, sentence case unless Vault casing says otherwise. Nothing else on screen — no UI peeking in, no icons, no subtitle paragraph. The emptiness is the function: it resets the eye before the next dense demo.

**Narration role.** In `vo` mode the voice speaks the capability name as the card sets (`NAME` marker) and may add one short bridging phrase. In `text_driven` mode the card **is** the narration — hold obeys the legibility gate with the 9.0 multiplier.

**Motion role.** Fast in, clean hold, fast out — a drumbeat, not a scene. One set move (type slam or mask reveal), true hold, exit into the demo via hard cut. Headers are where cut rhythm accelerates: in a parade's back half, header holds compress toward the 1.5s floor while demo holds stay honest. Energy 0.55–0.7, spiking briefly on the set.

**Common mistakes.** Claims smuggled into headers ("Blazing-fast Agent Mode"); orphaned headers; two-line headers; headers with subtitles that duplicate the upcoming demo's label; decorating the card until it competes with the demo it introduces; using a header before every single scene until the video is all chapter titles (headers should front demo *groups*, not every beat).

**Abstract pattern.** `[card sets on beat/NAME marker] → [legibility hold] → [hard cut into the proof scene]`

---

## 4. Story Structures

A structure is a validated sequence of scene families with timing and an evidence bill of materials. The Director selects one structure, verifies its evidence requirements against the Claim Ledger and asset inventory, and only then storyboards. **Structures degrade before they fabricate:** if evidence for a scene is missing, the substitution table below fires — the system never invents evidence to preserve a structure.

Timings are reference values; scale holds proportionally when the brief specifies a nonstandard duration. Scene floors from Section 3 still apply after scaling — if scaling would push a scene below its floor, cut a scene instead of compressing all of them.

**Why these lengths.** Hosting-platform engagement data holds steady from one to five minutes and drops meaningfully past five; sub-minute videos average roughly 50% watch-through; and website explainers convert best under two minutes. The doctrine's 30–90s band sits deliberately inside the flat part of that curve. Placement data also fixes the CTA's position: for videos under five minutes, the conversion moment performs best at the end — which is why every structure lands on `cta → logo_outro` and none opens with an ask.

### 4.1 — 30s Launch Teaser

For aware audiences and paid placements. High energy, no problem scene (the hook line carries a micro-tension at most). Uses the **flash variant** of `feature_demo`: 3–4s per capability, label ≤ 4 words, legibility gate still enforced via short labels rather than shortened holds on long text.

| Time | Scene family |
|---|---|
| 0–3s | hook |
| 3–8s | promise |
| 8–20s | feature flashes ×3 (or workflow compressed to 3 beats) |
| 20–25s | ui_proof *or* proof_metric (whichever has stronger evidence) |
| 25–28s | cta |
| 28–30s | logo_outro |

**Evidence bill:** positioning line + at least one strong visual asset. Runs even on a weak evidence set — this is the floor structure everything else degrades toward.

### 4.2 — 45s Product Explainer

The general-purpose website/social explainer for problem-aware-ish audiences.

| Time | Scene family |
|---|---|
| 0–4s | hook |
| 4–10s | problem |
| 10–16s | promise |
| 16–30s | feature_demo ×2 (7s each) |
| 30–36s | proof_metric *or* social_proof |
| 36–42s | cta |
| 42–45s | logo_outro |

**Evidence bill:** positioning line, 2 evidenced features, 1 admissible proof item (else the proof slot becomes a `ui_proof`).

### 4.3 — 60s SaaS Launch Video *(flagship)*

The Lovable-2.0-class slot: launch day, homepage hero, the video that defines the brand's motion identity.

| Time | Scene family |
|---|---|
| 0–4s | hook |
| 4–12s | problem |
| 12–18s | promise |
| 18–32s | workflow_demo (3–4 steps) |
| 32–44s | feature_demo ×2 (6s each) |
| 44–52s | proof_metric + social_proof (sequential beats) or ui_proof |
| 52–57s | cta |
| 57–60s | logo_outro |

**Evidence bill:** positioning line, real UI covering a 3-step workflow, 2 evidenced features, ≥ 1 admissible proof item. This structure demands the fullest input set; if the workflow evidence is missing, it degrades to 4.2 stretched — it does not fake the workflow.

### 4.4 — 90s Product Demo Explainer

For high-intent viewers: pricing-page, sales-cycle, and onboarding contexts. Product evidence dominates the runtime.

| Time | Scene family |
|---|---|
| 0–5s | hook |
| 5–12s | problem |
| 12–18s | promise |
| 18–40s | workflow_demo (extended, 4 steps) |
| 40–60s | feature_demo ×3 (~6.5s each) |
| 60–68s | ui_proof (the long hold) |
| 68–75s | proof_metric |
| 75–82s | objection_handling |
| 82–88s | cta |
| 88–90s | logo_outro |

**Evidence bill:** ≥ 4 real UI assets spanning the workflow, 3 evidenced features, 1 metric, 1 verified objection counter-fact. Missing objection evidence → the slot is cut and `ui_proof`/features absorb the time.

**Repeat-group notation.** Structures may contain repeat groups, written `N× (scene_a → scene_b)` — an atomic pair repeated N times. The group is scheduled as a unit: evidence for *all* N instances must clear the Ledger before the group is admitted, and if only M < N capabilities have evidence, the group shrinks to M× and the shortfall is logged. Within a group sequence, the variety law (8.5) applies across group instances — same rig family twice running inside a parade is the fastest way to make five features feel like one.

**Feature-parade variant of 4.4.** For version launches and release films whose argument is breadth of new capability — the register of the strongest modern launch videos. Replace the 40–60s feature block and reshape:

| Time | Scene family |
|---|---|
| 0–7s | hook (bold-statement variant permitted) |
| 7–9s | promise (compressed: product name + version reveal) |
| 9–24s | workflow_demo — **the hero take:** one continuous real capture, longest hold in the video |
| 24–72s | **4–6× (section_header → feature_demo)** |
| 72–82s | cta (long landing hold — URL read-twice) |
| 82–90s | logo_outro |

Parade rules: the hero take earns the parade — no hero demo, no parade (downgrade to standard 4.4). Group durations *accelerate*: early pairs run ~10s, late pairs compress toward ~4s (header at floor + demo at floor), so the video's cut density rises toward the CTA and the energy curve is produced by rhythm, not by louder motion. `problem` is optional and often cut — version launches address an audience that already knows the problem. Works in both narration modes; it is the canonical `text_driven` structure. **Evidence bill:** 1 hero-workflow capture + one real evidence asset per group instance. This is the structure most at risk of the "everything video" anti-pattern — six groups is the hard ceiling, and every capability beyond it is cut, not compressed.

### 4.5 — Founder / Product-Led Walkthrough (90–150s; 120s reference)

A different register entirely: conversational, longer holds, more real product, less type-slam. Reads as a founder showing you the thing — Loom-polished, not ad-polished.

Proportional layout (with 120s reference times): hook — personal insight or bold observation (5%, 0–6s) → context/problem told as a story (12%, 6–20s) → product reveal, understated (8%, 20–30s) → **guided workflow — the spine** (45%, 30–84s: real UI, real pace, narration in first person) → honest proof, plainly stated (12%, 84–98s) → soft CTA (10%, 98–110s) → logo (110–120s, with breathing room).

**Register rules:** founder VO if supplied (script = law); captions become more important (conversational audio, sound-off viewing); transitions calm down (cut share rises); type scenes shrink to almost nothing; `ui_proof` discipline extends across the whole workflow. **Evidence bill:** heavy — this structure is unavailable without substantial real UI.

### 4.6 — Enterprise / B2B Proof-Led Explainer (75–90s; 75s reference)

For buying committees. Proof density is the point; motion calms down; captions always on; claims discipline at maximum.

| Time | Scene family |
|---|---|
| 0–5s | hook (outcome-first, not hype) |
| 5–13s | problem (organizational framing — cost, risk, coordination) |
| 13–19s | promise |
| 19–33s | workflow_demo (team-scale: multi-user, review, handoff) |
| 33–43s | proof_metric (up to two sequential metrics) |
| 43–52s | social_proof (logos + one quote) |
| 52–61s | objection_handling (security/compliance — verified only) |
| 61–70s | cta (demo-request language, not "start free") |
| 70–75s | logo_outro |

**Evidence bill:** ≥ 1 metric **and** ≥ 1 logo-or-testimonial, plus verified security facts for the objection slot. If proof is thin, this structure is not available — an enterprise video without proof is a liability, and the Director downgrades to 4.2/4.3 with a logged notice.

### 4.7 Structure Selection Logic

1. **Duration & platform** from the brief pick the candidate set (paid social → 4.1; homepage → 4.2/4.3; sales/onboarding → 4.4/4.5; committee audience → 4.6; version/release launch with 3+ new capabilities and a demonstrable hero workflow → 4.4 feature-parade variant).
2. **Audience awareness** (brief/Vault) toggles the problem scene: aware → compress or cut; unaware → keep.
3. **Evidence audit** against the structure's bill: every required item resolved in the Ledger/asset inventory, or the substitution table fires.
4. **Substitution table** (in priority order): `proof_metric` → `ui_proof` → extra `feature_demo`; `social_proof` → cut, extend product evidence; `objection_handling` → cut; `workflow_demo` → `feature_demo` sequence; `comparison` → cut. Substitutions are logged as degradations.
5. **Core floor:** if no real product evidence exists at all, only 4.1 in declared-abstract mode is available, and the plan must say so.

---

## 5. Evidence and Claim Rules

The prime directive: **the system is a witness, not an author of facts.** It may compress, stage, and dramatize evidence it was given; it may never manufacture evidence. Marketing exaggeration by an AI is fabrication with a soundtrack.

### 5.1 The Claim Ledger

Before storyboarding, every claim-bearing statement available to the video is compiled into a ledger. Every entry: `{ text, class, source, verbatim_value, admissible }`. Sources: `script` | `brief` | `vault_proof` | `url_published` | `screenshot_visible`. **Render rule: a claim renders (on screen or in VO) only if its ledger entry is admissible for its class.** No entry, no render — in either channel. The reference video is not a source. Model knowledge is not a source.

### 5.2 Claim Classes

| Class | Admissible sources | Hard rules | Fallback when absent |
|---|---|---|---|
| **Customers / logos** | Vault assets, brief | Logo assets only as supplied; "trusted by X teams" needs a sourced count | Cut social proof; no generic "trusted by industry leaders" |
| **Metrics** | vault_proof, brief, url_published | Verbatim value + unit; no rounding up; no added precision; comparatives keep their basis | Replace `proof_metric` with `ui_proof` or capability demonstration |
| **Integrations** | vault_proof, url_published, brief | Named list only; third-party logos need supplied assets; "integrates with everything" banned | Text-list the named few, or omit |
| **Product capabilities** | screenshot_visible > url_published > brief | Shown capabilities need visual evidence; told capabilities can ride on text sources; brief-only claims tagged and flagged | Capability is *told* typographically or omitted — never shown via invented UI |
| **Testimonials** | Vault, brief | Verbatim, attribution as given, no trimming that shifts meaning, no synthesis, no "enhancement" | Cut the scene entirely |
| **Security / compliance** | vault_proof, brief, url_published — exact cert names verbatim | The strictest gate. No cert claim → no badge, no cert name, and no lock/shield iconography implying one | Omit; a generic "your data stays yours" line only if inputs state a data policy |
| **Pricing / offer** | vault_proof, brief, url_published | Exact figures and terms; "free trial" only if confirmed; "affordable" and price superlatives banned without source | CTA carries the action, silent on price |

### 5.3 Language Downgrade Ladder

When evidence weakens, language steps down — it never inflates:

1. **Sourced metric** → state the exact number.
2. **Verified capability, no metric** → demonstrative language: "watch it [do X]" — show, don't quantify.
3. **Brief-asserted capability, no visual evidence** → told claim, hedge-free but unquantified, flagged upstream.
4. **Nothing** → the scene is cut.

Comparatives and superlatives ("fastest," "#1," "the only") require an explicit source stating exactly that, or they are rewritten as demonstrable statements. Banned-by-default filler (overridable only by explicit Vault voice rules): *seamless, revolutionary, game-changing, next-generation, supercharge, unleash, empower, cutting-edge, effortless*.

### 5.4 Missing-Evidence Behavior

Silence over invention, always. The Director's output carries the `degradations[]` list naming every substitution and every flagged claim, so a human sees exactly where the evidence was thin *before* the render spends money. A video that quietly shipped a fabricated SOC 2 badge is a categorically worse outcome than a video that shipped one scene shorter.

### 5.5 The Legal Floor — FTC Substantiation Doctrine

The Claim Ledger is not just taste; it is the operationalization of advertising law, and knowing the law hardens the rules:

- **Reasonable basis, before dissemination.** US FTC doctrine requires an advertiser to possess substantiation for objective claims *before* the ad runs — for **express and implied claims alike**, judged by the ad's overall impression (words, phrases, *and pictures*). This is why G4 is a legal gate, not an aesthetic one: a fabricated dashboard is an implied capability claim with no basis.
- **Endorsements are not a loophole.** A testimonial may not convey any claim the advertiser couldn't substantiate directly. A customer saying "cut our editing time 80%" requires the same basis as the brand saying it.
- **Typicality.** A consumer testimonial about a key attribute is read as representative of what users *generally* achieve. If the quoted result isn't typical, the ad must clearly disclose the generally expected performance — and "results may vary" is explicitly insufficient. The Ledger therefore tags every testimonial claim `typical: true/false`, and atypical results either carry a real expected-performance disclosure or don't ship.
- **No invented endorsers.** Fake reviews, testimonials from non-existent people, and undisclosed AI-generated endorsers fall squarely inside the prohibition (the endorser definition now expressly covers virtual/AI personas), with civil penalties attached under the FTC's consumer-review rule. The three smiling cards with names and star ratings in a video for a pre-revenue product are not a style violation; they are the textbook offense.
- **Republishing is endorsing.** Quoting a third party's praise in the video makes the advertiser liable for it — so `social_proof` sources must be verifiable Vault proof, not screenshots of unverified posts.

The doctrine's standing rule follows: **the video is always the conservative reading of the evidence.** Where a claim has a strong and a weak honest phrasing, the Director takes the weak one and lets the product footage do the bragging.

---

## 6. Brand Vault Usage Rules

The Vault plays three distinct roles, and confusing them is where generic output comes from: **identity is law** (applied mechanically, zero creativity), **taste is bias** (shapes decisions, doesn't dictate them), **proof is inventory** (the only pre-approved claims list).

### 6.1 Identity Tokens — Law

**Logo.** Use only supplied variants; select light/dark variant by background luminance, automatically. Enforce clear space (≥ 0.5× logo height on all sides) and minimum size (≥ 4% of frame height). Never recolor, distort, outline, add glow, or animate the mark's internal geometry unless the Vault supplies a logo-behavior spec. Appearances: mandatory in the outro; optional and small in the hook; nowhere else by default — a logo watermarking every scene reads as insecurity.

**Colors.** Assign Vault colors to fixed roles: background family, text color, and **one accent**. The accent is reserved for decision moments — the promise turn, the metric land, the highlight ring, the CTA. An accent that appears in every scene stops meaning anything. Derivations limited to tints/shades of Vault hues for depth; zero off-Vault hues, ever — including "just a neutral gray" (use the brand's neutrals). Contrast gates: ≥ 4.5:1 for body/caption text, ≥ 3:1 for display type, enforced computationally.

**Fonts.** Map Vault fonts to roles: display, body, label/mono. Use only supplied weights — no faux-bold, no faux-italic, no "it's close enough" weight substitution. If a role's font is missing, the fallback pairing is applied *and declared* in the gaps report.

**Screenshots.** Evidence, not decoration (full rules in 2 and 8.10): crop/zoom/pan/highlight yes; repaint/alter/composite-fake-elements no. Device frames and browser chrome only per motion taste, applied consistently across the whole video.

### 6.2 Taste Tokens — Bias

**Audience** sets vocabulary ceiling, pacing bias, and scene mix (technical audiences tolerate more UI density and less metaphor; executive audiences want outcomes and proof).

**Positioning** is the single source of the promise line. One sentence. If the Vault's positioning is three sentences, the Director compresses to one and logs it.

**Voice/tone** constrains generated narration and labels: register (plain/technical/bold), sentence-length bias, adjective budget (default ≤ 1 per sentence), plus the brand's banned/preferred word lists layered over the doctrine defaults in 5.3.

**Motion taste** maps to a calm ↔ kinetic scalar that modulates Section 8's parameters: hold-duration multiplier, transition energy, cut frequency, camera aggression, type-set violence. Taste modulates within doctrine limits; it never overrides legibility, safe areas, or evidence rules.

**CTA language** is used verbatim when supplied.

**Proof claims** are the metric/customer/badge inventory feeding the Ledger — nothing more, nothing less.

### 6.3 Weak or Incomplete Vault

**Minimum viable Vault:** logo *or* wordmark, one brand color, product name + one-line description. Below this, the system should refuse gracefully and request inputs rather than render a guess.

Above the floor, degrade per field — and always emit a **Vault Gaps Report** upstream (field, default applied, impact). The user fixes gaps once in the Vault; the system never papers over them silently, because silent defaults are how every video ends up looking like the same "modern SaaS gradient" template.

| Missing field | Default behavior |
|---|---|
| Colors beyond one | Build a conservative ramp from the one brand color + luminance-derived neutrals; accent = the brand color |
| Fonts | Declared default pairing (one neutral grotesque + one mono for labels); flagged prominently |
| Voice | Neutral-confident register, doctrine word rules |
| Motion taste | Mid-scalar defaults from Section 8 |
| Audience | Infer from URL/brief; state the assumption |
| Positioning | Derive one line from URL hero copy; tag `url_published`; flag for confirmation |
| Proof claims | Proof families disabled (5.4) |

---

## 7. Reference Video Usage Rules

A reference video is a **style instrument reading, not a source of material.** The system measures it, converts the measurements into parameters, and discards the asset. The reference contributes zero words, zero layouts, zero colors, zero assets, zero claims.

### 7.1 Style DNA — What Gets Extracted

Each dimension is extracted as a *parameter*, never as a clip, frame, or layout:

| Dimension | Extracted as |
|---|---|
| Pacing | Cut-frequency distribution, mean/percentile scene durations, tempo curve across runtime |
| UI density | Share of runtime showing product UI; full-bleed vs framed ratio; average UI zoom level |
| Typography behavior | Type-forward vs UI-forward balance; set/exit style *categories* (slam, fade, mask-reveal — as enums, not recreations) |
| Transitions | Family taxonomy and frequency (cut / wipe / match / morph shares) |
| Camera rhythm | Push/pan energy scalar; hold-length distribution |
| Proof-screen holds | How long evidence frames breathe (informs hold multipliers) |
| CTA energy | Ending register: hard-sell ↔ quiet-confidence scalar |
| Music/SFX energy | BPM band, hit density, SFX presence scalar |

These parameters bias the same knobs that Vault motion taste biases — and **Vault taste wins every conflict.** The reference fills gaps in taste; it never overrides stated taste.

### 7.2 Hard No-Copy Boundaries

Violating any of these is a hard fail at the QA gate (Section 10):

1. **No wording.** Not a phrase of the reference's script, headlines, or labels.
2. **No layout cloning.** The swap test: if swapping logos would let a scene pass as the reference's scene, delete the scene and re-plan it.
3. **No color adoption.** Reference palette is never sampled. Brand Vault owns every hue on screen — this rule alone prevents 90% of accidental cloning.
4. **No asset mimicry.** No recreating the reference's logo behavior, mascots, illustrations, iconography style, or product UI.
5. **No VO echo.** Neither the script structure sentence-by-sentence, nor the narrator's signature phrasings.
6. **No music matching.** Energy band and hit density only — never the track, the melody, or a soundalike brief.
7. **Never evidence.** Nothing seen in the reference (their metrics, their customers, their features) enters the Ledger. Obvious, and worth stating.

**Precedence, restated:** Brand Vault identity > Vault motion taste > reference style DNA > doctrine defaults. The reference sits third, always.

---

## 8. Motion Design Doctrine

Ten laws. The Remotion engine's rigs implement these; the Director's storyboard must already comply with them, because motion cannot rescue a plan that violates them.

**8.1 — One owner per frame.** Every frame has exactly one primary attention owner. Hierarchy is built through scale: display type ≥ 3× body scale; a primary UI region visually dominant over its context. Two elements at equal weight means the frame has no subject.

**8.2 — Motion budget.** Per scene: **one primary move + at most two secondary moves.** Everything else is static or ambient (≤ 2% drift over the scene). Every animation must have a reason: a VO anchor, a continuity handoff, or a designed beat. "It felt empty" is not a reason — emptiness is a feature of premium.

**8.3 — The legibility gate.** Derived from subtitle reading-speed research rather than asserted: professional subtitling treats ~17 characters per second as the comfortable standard for general audiences, ~12–15 cps as fully relaxed, and ~20 cps (the Netflix adult ceiling) as the hard maximum before comprehension degrades. At ~6 characters per average English word, comfortable reading is ~2.5–2.8 words/second — and a display card must be read *while* the viewer also parses composition and motion, so the gate budgets below the ceiling, at ~2.8 w/s, with a settle allowance for the set move:

> **hold ≥ max(1.5s, 0.5s + 0.36s × word_count)** — and in `text_driven` mode, × 1.25 (≈ 0.45s/word), because no voice will rescue an unread card.

Sanity anchors: a 3-word header holds ≥ 1.6s; a 7-word statement ≥ 3.0s; nothing textual holds under 1.5s (subtitling floors sit near 1s for a fragment; a designed card carries more visual load). Minimum sizes hold: display ≥ 5% of frame height, body ≥ 2.5%, captions ≥ 3.2%; contrast per 6.1. UI text in screenshots is either legible after crop/zoom (≥ ~14px at output resolution) or intentionally out of focus as context — never the ambiguous middle where the viewer squints. A text element that fails the gate is not shortened into legality by trimming its hold; the *text* gets shorter or the hold gets longer.

**8.4 — Safe areas.** 5% action-safe margin on all edges; nothing critical in the outer band. The bottom 20% is the reserved caption band — primary content composes around it whenever captions are on. Design center-weighted so 9:16 and 1:1 crops survive; per-aspect re-layout, not blind cropping, for delivery variants.

**8.5 — Variety law.** Scene composition draws from the fifteen-archetype library in 3.0. No archetype appears twice consecutively (exceptions: steps inside a single `workflow_demo`; repeated `section_header → feature_demo` pairs in a parade, where the *pair* is the repeating unit and the demos inside it still rotate). No single motion rig drives more than 40% of scenes; no single archetype exceeds 50% of scenes outside `founder_vo`/`ambient_demo` registers, which legitimately live in archetypes 3–6. Rotate shot sizes on UI like cinematography: wide app → medium panel → close control.

**8.6 — Anchored reveals.** Every primary reveal binds to a narration marker or beat within the tolerance of its sync tier (9.5): percussive audiovisual hits at ±40ms, word-anchored reveals at ±120ms with a prefer-late bias, beat-locked cuts on the beat or up to two frames early. Nothing significant enters during unmarked silence — except designed music beats (the `ui_proof` quiet hold, the outro). If the narration and the plan disagree, the plan moves; the voice — or in `text_driven`, the beat grid — is the conductor.

**8.7 — Momentum and handoff.** The exit vector of scene N sets up the entry of scene N+1: direction continuity, or an object/element handoff across the cut. The video rides one energy curve — hook 0.9 → problem 0.5 → promise 0.7 → demo 0.6–0.7 → proof peak 0.8 → CTA 0.6 → logo 0.3 — and every scene knows its position on it. Flat energy is the sound of a template.

**8.8 — Transition law.** The cut is the default: **≥ 60% of transitions are cuts.** Every non-cut transition must encode meaning — contrast (before/after wipe), continuity (workflow match-cut), or reveal (mask into UI). One signature transition style per video, used consistently; a grab bag of wipes, spins, and morphs is the loudest cheap-tell there is. The priority order for *where* to cut comes from film editing's canon — Murch's Rule of Six ("In the Blink of an Eye") weights emotion over story over rhythm over eye-trace over spatial continuity: a cut that lands the feeling and the beat is right even if the geometry jumps, and never the reverse.

**8.9 — Proof holds.** Evidence frames get the longest holds in the video — the top quartile of scene durations belongs to proof and UI. The `ui_proof` hold is ≥ 3s with ≤ 4%-per-second camera drift. Holding evidence past comfort signals confidence; cutting away early signals the evidence couldn't survive a look.

**8.10 — Real vs synthetic UI.** Real screenshots are photographs: crop, zoom, pan, highlight — never repaint, never inject fake data, never composite invented elements into a real frame. Synthetic UI, when it must exist, is **declared abstraction**: simplified, flat, brand-styled, obviously schematic — a diagram of the idea, not an imitation of the app. The hard line: synthetic UI never wears real-product costume (browser chrome, OS chrome, fake user data at photographic fidelity). That costume is the fake-dashboard failure, and it hard-fails.

**8.11 — Micro-motion timing.** Individual moves inherit interaction-design physics, scaled for a passive viewer. UI motion research (Material Design) puts interface transitions at ~300ms typical on mobile (375ms for large/complex, past 400ms feels sluggish), small utility moves at 150–200ms, exits faster than entrances, and duration scaling with distance traveled and area changed — with asymmetric easing (fast take-off, soft landing) reading as natural. Video set-moves run **1.5–2.5× those interaction durations** because nobody is waiting on input: micro-moves and exits 150–300ms; standard element sets 300–600ms; hero display sets and large traversals 500–900ms with emphasized (decelerating) easing; nothing on a linear ramp, ever. Count-ups decelerate into their final value (the resolve is the message). These are per-move budgets inside 8.2's per-scene budget — a 600ms hero set plus two 200ms secondaries is a full scene's motion.

---

## 9. Voice, Captions, Music, SFX

Audio is not a layer added after the video — the narration timeline (or, in unvoiced modes, the beat grid) is the master clock the visual timeline binds to. Every number in this section is grounded; Section 12 carries the citations.

### 9.0 Mode Matrix

Sections 9.1–9.4 are written for `vo`. The matrix remaps them per mode — nothing else in the doctrine changes:

| Subsystem | `vo` | `founder_vo` | `talking_head` | `testimonial_led` | `text_driven` | `ambient_demo` |
|---|---|---|---|---|---|---|
| Master clock | VO timeline | VO timeline | On-camera speech | Stitched quote timeline | **Music beat grid** | Beat grid + interaction rhythm |
| Markers (9.1) | On script | On script (conversational density: fewer STRESS, more PAUSE) | On speech; camera↔B-roll cuts land on sentence boundaries | On quote key-phrases | On card text; beat-anchored | On interaction beats (click, result, state change) |
| Captions (9.2) | On by default | On by default | **Always on, burned in** | **Always on** (names/titles supered) | **Off** — cards are the text | On — interaction captions are the narration |
| Card-hold multiplier (8.3) | 1.0 | 1.0 | 1.0 | 1.0 | **1.25** | 1.25 for captions carrying narration |
| Music role (9.3) | Bed under voice | Bed, calmer map | Bed, ducked harder under untreated voice | Minimal bed (authenticity register) | **Lead element**, full structure map | Lead or absent; UI sounds foregrounded |
| SFX density (9.4) | standard | quiet | quiet (real-world sound competes) | quiet | standard–kinetic | UI-native sounds replace designed SFX |
| Claim audit | Script vs Ledger | Script vs Ledger | Speech transcript vs Ledger | Quotes vs Ledger **+ typicality (5.5)** | Card text vs Ledger | Captions + shown capability vs Ledger |

The `text_driven` failure smell: cards drifting off the beat grid reads as a slideshow over a playlist. The beat grid is not decoration — it is the substitute spine, and G9 audits it exactly as it audits VO sync.

### 9.1 Narration Markers & Word Budget

The script (user-supplied or generated) is annotated before storyboarding. Marker taxonomy:

| Marker | Meaning | Visual binding |
|---|---|---|
| `REVEAL` | A stressed word introducing something | Primary element enters here (Tier B, 9.5) |
| `STRESS` | Emphasis word | One emphasis response — scale-settle, accent flash, or underline draw. Pick one; never all |
| `NUMBER` | A spoken figure | Numeral lands its final value here (Tier A); screen and voice agree exactly |
| `NAME` | Product-name drop | Name/logo sets here (Tier A) |
| `IMPERATIVE` | CTA verb | CTA text sets here |
| `PAUSE` | Designed silence | Holds, breath, `ui_proof` moments live here |

Rules: ≥ 1 `REVEAL` per scene; marker density shapes the scene's motion budget; a wall of unmarked narration means the script needs editing, not the visuals more guessing.

**Word budget.** Explainer narration paces at **140–160 WPM** (professional VO practice: conversational speech 120–150, commercials 150–180, corporate/explainer sits between) — call it 2.3–2.7 words/second. That converts scene durations into hard script budgets: a 4s hook carries ≤ 10 narrated words; a 6s feature scene ≤ 15; a 60s video ≤ ~150 words total, *including* breathing room for `PAUSE` markers. A script over budget is cut at the script, not crammed at the read — rushed VO is the audible version of the illegible card.

### 9.2 Captions

Phrase-level chunks of 3–7 words (word-karaoke only if Vault taste explicitly asks for kinetic captions). Max 2 lines × 36 characters — at the phrase durations the word budget produces, that construction stays at or under the ~17 cps comfortable reading standard with the 20 cps ceiling never approached. Set in the Vault body/label face inside the caption band (8.4). Timing: appear ~100ms before the phrase's first phoneme (early feels synced; late feels dubbed — the asymmetry mirrors AV-sync perception, 9.5), persist through the phrase, linger 150–300ms, never straddle a cut. Captions obey the same contrast gate as all text.

Captions default **on** in every voiced mode: a large share of B2B and feed viewing happens muted, and platform research consistently associates captions with higher engagement and recall. For `talking_head`/`testimonial_led` they are non-negotiable (conversational audio, sound-off feeds). Only `text_driven` turns the module off — captioning the cards would double-print the video.

### 9.3 Music

**Structure-mapped, not wallpaper:** intro (hook) → tension texture (problem) → open-up (promise) → groove (demo) → peak (proof) → resolve (CTA/logo). Hit points land on scene turns — the promise cut and the metric land are the two mandatory hits. The track resolves on the logo, never cuts dead mid-phrase.

**Tempo.** No fixed BPM exists in this doctrine — tempo is a taste knob (Vault > reference > register default), constrained to bands that music-psychology categorization and library practice agree on. Slow/editorial ≈ 70–95 BPM (calm, premium, founder registers); standard launch ≈ 100–125 (the mainstream pop/corporate energy band); kinetic parade ≈ 120–135 (dance-tempo urgency without frenzy). Research marks ~77–107 as "moderate" and 108+ as "fast," with arousal rising with tempo — the energy curve (8.7) and the tempo band must agree, and a parade's *perceived* acceleration should come from cut density and arrangement intensity, not mid-video BPM changes.

**Levels.** In voiced modes the bed sits **15–20 dB below the voice** (pro mixing consensus; the W3C accessibility guideline requires background ≥ 20 dB below speech, so 20 is the accessibility-safe setting and hard floor for `talking_head` UGC audio; the BBC's field rule — mix it, then drop the music another 4 dB, because nobody ever complains music is too quiet — is the correct tiebreak). Dynamic ducking automates the last stretch: **6–12 dB of gain reduction** on the bed under speech, ~100–150ms attack, 300–500ms release, so the music breathes between phrases instead of pumping. In `text_driven` there is no ducking — music is the lead element at full structure-mapped dynamics, and hits carry the punctuation load alone.

**Deliverable.** −14 LUFS integrated, true peak ≤ −1.0 dBTP: YouTube and the major streaming platforms normalize to ≈ −14 LUFS and only turn content *down*, so mixing hotter buys distortion risk for zero loudness, and mixing quieter ships a quiet video (platforms don't reliably boost). Voice clearly dominant in voiced modes.

### 9.4 SFX

Register-based density, not one fixed number — but silence remains the default state and every sound must map to a visible event:

| Register | Avg SFX per scene | Applies to |
|---|---|---|
| quiet | ≤ 0.5 | `founder_vo`, `talking_head`, `testimonial_led`, enterprise structure |
| standard | ≤ 1 | `vo` launch/explainer |
| kinetic | ≤ 2, each justified by a Tier-A visual hit | `text_driven` parades, teaser |

Whitelisted moments: the promise turn, one workflow interaction beat, the metric land, the CTA set, the logo sting. **Rig-specific sound signatures** — each motion rig family carries one assigned SFX signature, so identical motions always sound like themselves; cohesion through consistency, variation only in subtle level/pitch:

| Rig family | Signature |
|---|---|
| type_slam | Soft thud + air |
| panel_slide | Low fabric whoosh |
| zoom_push | Subtle riser, no impact |
| highlight_draw | Fine tick |
| count_up | Tick cluster decelerating into a single resolve |
| logo_resolve | The brand sting (Vault-supplied if it exists; otherwise one restrained tonal hit) |

No whoosh-on-everything. An SFX that doesn't correspond to a visible event is noise; in `ambient_demo`, the product's own UI sounds *are* the palette and designed SFX stand down.

### 9.5 Sync Tiers

Broadcast AV-sync research (ITU-R BT.1359) fixes human tolerance: desynchronization is *detectable* from about +45ms (sound early) to −125ms (sound late), *acceptable* to about +90/−185ms — an asymmetry the doctrine exploits: the eye forgives a visual that lands after its sound far more than one that jumps its cue. Production standards run tighter (EBU R37 keeps program chains within roughly −60/+40ms; film lip-sync convention is ±1 frame ≈ ±22ms). Three tiers follow:

| Tier | Applies to | Tolerance | Rationale |
|---|---|---|---|
| **A — percussive** | `NUMBER` land, `NAME` set, logo sting, any hit with a designed SFX, on-camera lip sync | **±40ms** (±1 frame @ 30fps, ±2 @ 60) | Inside detectability for the sharpest audiovisual events; a late sting reads as a mistake |
| **B — word-anchored** | `REVEAL`/`STRESS`/`IMPERATIVE` bindings | **±120ms, prefer on-or-after the syllable** | Word-level anchoring isn't lip sync; ±120ms sits inside ITU acceptability, and the prefer-late bias tracks the perceptual asymmetry |
| **C — beat-locked** | Cuts and card sets in `text_driven`/`ambient_demo` | **On the beat to 2 frames early** | Editor practice: a cut *on or a hair before* the beat feels driven; after the beat feels dragged |

G9 audits the final timeline against whichever tiers the mode invokes.

---

## 10. Quality Rubric

Two-stage evaluation. **Stage 1: hard gates** — binary, any failure rejects the video regardless of score. **Stage 2: weighted score 0–100** — determines ship band. A 94 with a fabricated badge is a rejected video; the gates exist so that can never be argued.

### 10.1 Hard Gates (any fail = reject)

| Gate | Rule | Detection hint |
|---|---|---|
| `G1 prompt_leakage` | No generation-artifact text on screen: prompt fragments, scene labels ("Scene 1:"), template tokens (`{{ }}`), placeholder text (lorem, TBD), internal IDs | OCR every frame-sample; match against artifact-token patterns |
| `G2 static_output` | No unintended stillness: no scene fully static > 2.5s. Exempt: CTA/logo designed holds carrying micro-motion ≥ declared floor | Per-scene motion-energy analysis; flag zero-delta spans |
| `G3 unreadable_text` | Every text element passes the 8.3 legibility gate (reading-speed-derived hold × size × contrast, with the text_driven ×1.25 multiplier where it applies) | Computed from layout + timing data pre-render; OCR-confidence spot check post-render |
| `G4 fake_dashboard` | No synthetic UI presented as real product (real-app costume per 8.10); no fabricated data at photographic fidelity | Asset provenance audit: every UI region traces to a supplied asset or a declared-abstract synthetic |
| `G5 fabricated_claims` | Every rendered claim (screen + VO) resolves to an admissible Claim Ledger entry. Includes the 3.13 orphan rule: every `section_header` is followed by a scene proving the named capability — an orphaned header is an unproven capability claim | Ledger audit of final script + on-screen text inventory; header→successor scene check on the storyboard |
| `G6 product_evidence_floor` | If real product assets were supplied, ≥ 1 UI-family scene uses them; if none were supplied, the video is flagged declared-abstract and never framed as a demo | Plan metadata + asset usage map |
| `G7 brand_adherence` | Zero off-Vault hues (ΔE tolerance ~3), zero non-Vault fonts, zero logo violations (6.1) | Per-frame palette extraction vs Vault tokens; font audit of text layers |
| `G8 motion_variety` | No archetype twice consecutively (8.5 exception applies); no rig > 40% of scenes | Storyboard sequence check |
| `G9 narration_desync` | Anchored events within their 9.5 sync tier: Tier A ±40ms, Tier B ±120ms prefer-late, Tier C on-beat to 2 frames early; captions within 9.2 timing; text_driven card holds meet the ×1.25 multiplier | Marker/beat timestamp diff per tier on the final timeline |
| `G10 reference_copying` | Passes all Section 7.2 boundaries, including the swap test | Layout/wording similarity screen vs reference features; manual swap-test on nearest-neighbor scenes |

### 10.2 Weighted Score

| Category | Wt | 0 looks like | 100 looks like |
|---|---|---|---|
| Story & structure integrity | 15 | Scene soup; no turn; three-question test fails | Chosen structure executed; the turn lands; all three questions answered on time |
| Evidence strength & honesty | 15 | Vague claims, thin product presence | Dense sourced proof; product visibly does its job; degradations handled gracefully |
| Brand adherence & expression | 15 | Template with brand colors poured in | Passes the strip-the-logo test; accent discipline; voice matches Vault |
| Motion craft | 15 | Wallpaper drift or chaos; unmotivated transitions | Budgeted, anchored, momentum-carrying motion; earned transitions |
| Readability | 10 | Squint-and-rewind text | Every element comfortably readable on a phone |
| Narration/visual sync (VO or beat grid) | 10 | Reveals float free of the voice; cards drift off the beat | Every beat lands on its marker or grid point; the video feels *conducted* in either mode |
| Pacing & variety | 10 | Flat energy, repeated compositions | Energy curve realized; archetypes rotate; holds where they matter |
| Audio craft | 5 | Music wallpaper, SFX spam, bed masking the voice | Structure-mapped music, register-correct SFX density, bed 15–20dB under voice, −14 LUFS/−1dBTP at delivery |
| CTA effectiveness | 5 | Multiple asks; unreadable URL | One action, read-twice hold, VO/screen match |

**Ship bands:** 90–100 flagship-ready · 80–89 ship · 70–79 targeted revision (fix the two lowest categories, re-score) · < 70 re-plan at the Director level — the storyboard is wrong, not the polish.

---

## 11. Machine-Readable Knowledge Graph

The JSON below is the engineering seed for `saas-explainer-knowledge-graph.json`. Values mirror this document exactly; where the prose and the graph disagree, the prose wins and the graph is the bug. Durations in seconds; energies on a 0–1 scale; the graph is data for the Director and QA gate, not renderer code.

```json
{
  "meta": {
    "name": "saas-explainer-knowledge-graph",
    "version": "1.2.0",
    "sourceDoctrine": "saas-explainer-bible v1.2.0",
    "consumes": [
      "brand_vault",
      "product_url",
      "screenshots",
      "user_brief",
      "user_script",
      "reference_video"
    ],
    "consumedBy": [
      "saas_director",
      "storyboard_planner",
      "motion_engine",
      "audio_engine",
      "qa_gate"
    ],
    "units": {
      "duration": "seconds",
      "energy": "0-1",
      "syncTolerance": "milliseconds"
    },
    "changelog": {
      "1.1.0": "Added narrationModes axis, section_header scene family, repeat-group notation + feature-parade variant of demo_90s; G9 generalized to narration_desync; G5 extended with orphan-header rule; 3 new antiPatterns.",
      "1.2.0": "Grounding release: 6 narration modes; 15-archetype visual library; legibility formula rebuilt on subtitle reading-speed research; audio constants re-specified from ITU/EBU/W3C/platform standards; sync tiers; FTC legal floor; Sources appendix (Section 12) maps every constant."
    }
  },
  "narrationModes": {
    "modes": [
      "vo",
      "founder_vo",
      "talking_head",
      "testimonial_led",
      "text_driven",
      "ambient_demo"
    ],
    "default": "vo",
    "axes": {
      "speaker": [
        "narrator",
        "founder_first_person",
        "presenter_on_camera",
        "customers",
        "onscreen_cards",
        "nobody_product_speaks"
      ],
      "masterClock": [
        "vo_timeline",
        "music_beat_grid",
        "beat_grid_plus_interaction_rhythm"
      ]
    },
    "selection": {
      "userExplicitChoice": "wins",
      "scriptSupplied": "implies_voiced_mode_unless_stated",
      "founderOrCustomerFootageSupplied": "implies_talking_head_or_testimonial_led_footage_becomes_evidence",
      "referenceSuggestion": "text_driven_reference_may_suggest_never_silently_adopt",
      "midVideoSwitch": "forbidden_talking_head_broll_alternation_is_inside_mode"
    },
    "sharedLaw": "claim_rules_identical_regardless_of_speaker_testimonial_modes_add_typicality_5_5",
    "perMode": {
      "vo": {
        "masterClock": "vo_timeline",
        "captions": "on_default",
        "cardHoldMultiplier": 1.0,
        "musicRole": "bed_under_voice",
        "sfxRegister": "standard"
      },
      "founder_vo": {
        "masterClock": "vo_timeline",
        "markerDensity": "conversational_fewer_stress_more_pause",
        "captions": "on_default",
        "cardHoldMultiplier": 1.0,
        "musicRole": "bed_calmer_map",
        "sfxRegister": "quiet",
        "structureAffinity": "founder_walkthrough_4_5"
      },
      "talking_head": {
        "masterClock": "on_camera_speech",
        "cameraBrollCutsOn": "sentence_boundaries",
        "captions": "always_on_burned_in",
        "cardHoldMultiplier": 1.0,
        "musicRole": "bed_ducked_harder_untreated_voice",
        "sfxRegister": "quiet",
        "brollRule": "product_footage_obeys_8_10",
        "registers": [
          "ugc",
          "linkedin_native",
          "ai_presenter"
        ]
      },
      "testimonial_led": {
        "masterClock": "stitched_quote_timeline",
        "captions": "always_on_names_titles_supered",
        "cardHoldMultiplier": 1.0,
        "musicRole": "minimal_bed_authenticity",
        "sfxRegister": "quiet",
        "claimAudit": "quotes_vs_ledger_plus_typicality",
        "structureAffinity": "enterprise_proof_led_4_6"
      },
      "text_driven": {
        "masterClock": "music_beat_grid",
        "beatTier": "tier_C",
        "captions": "off_cards_are_the_text",
        "cardHoldMultiplier": 1.25,
        "musicRole": "lead_element_no_ducking",
        "sfxRegister": "standard_to_kinetic",
        "sectionHeaderFirstClass": true,
        "canonicalStructure": "demo_90s.featureParadeVariant"
      },
      "ambient_demo": {
        "masterClock": "beat_grid_plus_interaction_rhythm",
        "captions": "on_interaction_captions_are_narration",
        "captionHoldMultiplier": 1.25,
        "musicRole": "lead_or_absent_ui_sounds_foregrounded",
        "sfxRegister": "ui_native_replaces_designed",
        "markerBinding": "interaction_beats_click_result_state_change"
      }
    }
  },
  "visualArchetypes": {
    "library": [
      {
        "id": "TYPE_ONLY",
        "frame": "statement_or_name_on_clean_brand_field",
        "nativeEvidence": "claim_or_none_for_headers",
        "note": "kinetic_type_register_carries_text_driven_narration"
      },
      {
        "id": "TYPE_OVER_MEDIA",
        "frame": "display_type_over_dimmed_ui_or_footage",
        "nativeEvidence": "claim_plus_context",
        "note": "media_max_40pct_visual_weight"
      },
      {
        "id": "UI_FULL_BLEED",
        "frame": "raw_full_frame_screen_capture",
        "nativeEvidence": "screenshot_visible",
        "note": "screencast_register_ui_text_must_pass_8_3"
      },
      {
        "id": "UI_FRAMED",
        "frame": "capture_in_real_browser_app_device_chrome_on_brand_field",
        "nativeEvidence": "screenshot_visible",
        "note": "default_product_frame_chrome_must_be_real_8_10"
      },
      {
        "id": "UI_CROP_ZOOM",
        "frame": "cropped_ui_region_filling_frame",
        "nativeEvidence": "screenshot_visible",
        "note": "feature_demo_workhorse"
      },
      {
        "id": "CURSOR_HERO",
        "frame": "close_capture_following_live_cursor_smooth_zoom_pan",
        "nativeEvidence": "screenshot_visible_interaction",
        "note": "modern_demo_dialect_motion_from_recording_rig_adds_camera_only"
      },
      {
        "id": "UI_FLOAT_STACK",
        "frame": "multiple_real_panels_floated_in_composed_space",
        "nativeEvidence": "screenshot_visible_multiple",
        "note": "exploded_view_only_related_panels_stack"
      },
      {
        "id": "DEVICE_CONTEXT",
        "frame": "product_on_device_in_physical_scene",
        "nativeEvidence": "screenshot_visible_plus_staging",
        "note": "screen_content_still_obeys_8_10"
      },
      {
        "id": "HUMAN_FRAME",
        "frame": "person_on_camera_founder_presenter_customer",
        "nativeEvidence": "testimonial_or_delivery",
        "note": "talking_head_register_full_or_pip"
      },
      {
        "id": "BENTO_GRID",
        "frame": "composed_grid_of_feature_tiles",
        "nativeEvidence": "mixed_each_tile_sourced",
        "note": "max_6_tiles"
      },
      {
        "id": "DIAGRAM_SCHEMATIC",
        "frame": "declared_abstract_nodes_flows_shapes",
        "nativeEvidence": "declared_abstraction",
        "note": "only_home_for_synthetic_product_adjacent_visuals"
      },
      {
        "id": "DATA_VIZ",
        "frame": "chart_counter_metric_as_subject",
        "nativeEvidence": "vault_proof_verbatim_number",
        "note": "axes_honest_baselines_shown_countups_decelerate"
      },
      {
        "id": "SPLIT_COMPARE",
        "frame": "two_states_or_options_sharing_frame",
        "nativeEvidence": "per_side_sourcing",
        "note": "asymmetric_weight_rules_apply"
      },
      {
        "id": "ICON_CONSTELLATION",
        "frame": "logos_icons_around_hub_or_grid",
        "nativeEvidence": "verified_integrations_platforms",
        "note": "every_logo_is_a_verified_claim"
      },
      {
        "id": "LOGO_FIELD",
        "frame": "brand_mark_on_clean_field",
        "nativeEvidence": "vault_asset",
        "note": "max_3s_at_end"
      }
    ],
    "rules": {
      "evidenceBinding": "archetype_native_evidence_is_a_contract",
      "registerCoherence": "1_2_11_12_motion_graphics__3_to_7_product_film__8_9_live_action_mix_deliberately",
      "coverageDuty": "only_1_2_no_product__only_3_to_5_tutorial_not_launch_evidence_bill_forces_mix"
    }
  },
  "sceneFamilies": [
    {
      "id": "hook",
      "purpose": "Earn the next ten seconds via tension or spectacle",
      "useWhen": [
        "always_first_scene"
      ],
      "duration": {
        "min": 2,
        "max": 4
      },
      "evidence": {
        "required": [],
        "preferred": [
          "strongest_visual_asset",
          "admissible_hook_claim"
        ],
        "hardFailWithout": null
      },
      "visual": {
        "archetypes": [
          "TYPE_ONLY",
          "TYPE_OVER_MEDIA",
          "CURSOR_HERO",
          "UI_FULL_BLEED",
          "HUMAN_FRAME"
        ],
        "maxElements": 4,
        "accentAllowed": true,
        "logoAllowed": "small_optional",
        "productRequired": false
      },
      "narration": {
        "role": "hook_line",
        "maxWords": 12,
        "anchors": [
          "STRESS"
        ]
      },
      "motion": {
        "energy": 0.9,
        "firstMotionWithinMs": 500,
        "primaryMoves": [
          "type_slam",
          "hard_push",
          "cut_in_on_action"
        ],
        "holdBias": "short"
      },
      "mistakes": [
        "logo_first_open",
        "slow_fade_in",
        "stacked_value_props",
        "generic_category_line"
      ],
      "pattern": "cold_open -> tension_line_on_first_stress -> optional_stack -> hard_cut"
    },
    {
      "id": "problem",
      "purpose": "Make the status-quo cost felt, concretely",
      "useWhen": [
        "duration_gte_45s",
        "audience_not_problem_aware"
      ],
      "skipWhen": [
        "teaser_structure",
        "hype_aware_audience"
      ],
      "duration": {
        "min": 4,
        "max": 10
      },
      "maxShareOfRuntime": 0.2,
      "evidence": {
        "required": [
          "audience_pain_from_brief_or_vault"
        ],
        "forbidden": [
          "unsourced_statistics"
        ],
        "hardFailWithout": null
      },
      "visual": {
        "archetypes": [
          "TYPE_ONLY",
          "TYPE_OVER_MEDIA",
          "SPLIT_COMPARE",
          "DIAGRAM_SCHEMATIC"
        ],
        "palette": "muted_vault_neutrals",
        "accentAllowed": false,
        "productRequired": false,
        "productForbidden": true
      },
      "narration": {
        "role": "concrete_second_person_pain",
        "maxSentences": 2,
        "anchors": [
          "STRESS"
        ]
      },
      "motion": {
        "energy": 0.5,
        "texture": "staccato_accumulation",
        "primaryMoves": [
          "stack_accumulate",
          "interrupt_beat"
        ]
      },
      "mistakes": [
        "over_20pct_runtime",
        "abstract_global_statements",
        "product_shown_early",
        "stock_metaphor_chaos",
        "fake_statistics"
      ],
      "pattern": "pain_artifacts_accumulate -> composition_tightens -> silence_beat -> hard_cut_to_relief"
    },
    {
      "id": "promise",
      "purpose": "Name the product as the answer in one sentence; the turn",
      "useWhen": [
        "always_once",
        "immediately_after_problem_or_hook"
      ],
      "duration": {
        "min": 4,
        "max": 7
      },
      "evidence": {
        "required": [
          "product_name",
          "logo_asset",
          "positioning_line"
        ],
        "preferred": [
          "first_real_ui_glimpse"
        ],
        "hardFailWithout": "positioning_line"
      },
      "visual": {
        "archetypes": [
          "TYPE_ONLY",
          "TYPE_OVER_MEDIA",
          "UI_FRAMED",
          "LOGO_FIELD"
        ],
        "palette": "full_brand_confidence",
        "accentAllowed": true,
        "accentRole": "first_appearance"
      },
      "narration": {
        "role": "name_drop_plus_single_positioning_line",
        "valueProps": 1,
        "anchors": [
          "NAME",
          "REVEAL"
        ]
      },
      "motion": {
        "energy": 0.7,
        "primaryMoves": [
          "clean_set_into_stillness"
        ],
        "character": "tension_release"
      },
      "mistakes": [
        "multiple_value_props",
        "buried_product_name",
        "postage_stamp_ui",
        "hook_energy_reused"
      ],
      "pattern": "cut_to_open_field -> name_sets_on_name_drop -> positioning_under -> ui_slides_in_and_settles"
    },
    {
      "id": "workflow_demo",
      "purpose": "Show the end-to-end job: input -> process -> outcome",
      "useWhen": [
        "duration_gte_60s",
        "value_is_a_flow"
      ],
      "duration": {
        "min": 10,
        "max": 25
      },
      "evidence": {
        "required": [
          "real_ui_covering_steps",
          "verified_step_order"
        ],
        "hardFailWithout": "verified_step_order",
        "disabledWithoutRealUI": true
      },
      "visual": {
        "archetypes": [
          "UI_FULL_BLEED",
          "UI_FRAMED",
          "CURSOR_HERO",
          "UI_CROP_ZOOM"
        ],
        "maxSteps": 4,
        "dataContinuityRequired": true,
        "stepMarkers": "label_face"
      },
      "narration": {
        "role": "outcome_framed_procedural",
        "anchors": [
          "REVEAL_per_step"
        ]
      },
      "motion": {
        "energy": 0.65,
        "primaryMoves": [
          "lateral_pan",
          "match_cut_handoff"
        ],
        "perStepSettleHold": "legibility_gate"
      },
      "mistakes": [
        "screencap_cursor_feel",
        "teleporting_data",
        "over_4_steps",
        "flat_time_per_step",
        "narrating_buttons"
      ],
      "pattern": "step01_settles -> output_carries_across_transition -> step02_receives -> ... -> outcome_longest_hold"
    },
    {
      "id": "feature_demo",
      "purpose": "Prove exactly one capability",
      "useWhen": [
        "after_promise"
      ],
      "countByDuration": {
        "45": 2,
        "60": 3,
        "90": 3
      },
      "duration": {
        "min": 5,
        "max": 8
      },
      "flashVariant": {
        "allowedIn": [
          "teaser_30s"
        ],
        "duration": {
          "min": 3,
          "max": 4
        },
        "labelMaxWords": 4
      },
      "evidence": {
        "required": [
          "screenshot_or_verified_capability"
        ],
        "rule": "no_visual_evidence_means_told_not_shown",
        "hardFailWithout": null
      },
      "visual": {
        "archetypes": [
          "UI_CROP_ZOOM",
          "UI_FRAMED",
          "CURSOR_HERO",
          "UI_FLOAT_STACK",
          "TYPE_OVER_MEDIA",
          "BENTO_GRID"
        ],
        "cropToFeatureRegion": true,
        "highlightTreatments": [
          "ring_draw",
          "underline",
          "dim_rest"
        ],
        "highlightAppliesOnce": true,
        "labelMaxWords": 4
      },
      "narration": {
        "role": "benefit_first_mechanism_second",
        "anchors": [
          "REVEAL",
          "STRESS"
        ]
      },
      "motion": {
        "energy": 0.65,
        "primaryMoves": [
          "wide_to_close_push"
        ],
        "microInteractionIfEvidenced": true
      },
      "mistakes": [
        "multiple_features_per_scene",
        "unreadable_full_app_shot",
        "highlight_strobing",
        "ui_too_brief",
        "asset_driven_feature_choice_unlogged"
      ],
      "pattern": "wide_context -> push_to_region -> label_on_stress_verb -> interaction_beat -> hold"
    },
    {
      "id": "ui_proof",
      "purpose": "The it-is-real beat; credibility via unedited-feeling real product",
      "useWhen": [
        "at_least_once_in_product_led_video"
      ],
      "duration": {
        "min": 4,
        "max": 8
      },
      "evidence": {
        "required": [
          "real_screenshot_or_recording"
        ],
        "syntheticUIDisqualifies": true,
        "hardFailWithout": "real_ui_asset"
      },
      "visual": {
        "archetypes": [
          "UI_FULL_BLEED",
          "UI_FRAMED",
          "CURSOR_HERO",
          "DEVICE_CONTEXT"
        ],
        "overlays": "minimal",
        "decorationForbidden": [
          "glow",
          "fake_data_sparkle",
          "composited_elements"
        ]
      },
      "narration": {
        "role": "single_quiet_line_or_designed_silence",
        "anchors": [
          "PAUSE"
        ]
      },
      "motion": {
        "energy": 0.5,
        "primaryMoves": [
          "slow_push_2_4pct",
          "hold_with_microdrift"
        ],
        "holdMinSeconds": 3,
        "maxDriftPctPerSecond": 4,
        "holdBias": "longest_in_video"
      },
      "mistakes": [
        "over_decoration",
        "early_cutaway",
        "fake_composites",
        "mockup_substitution"
      ],
      "pattern": "hard_cut_to_full_ui -> slow_push -> quiet_line_or_music -> hold_past_comfort -> cut"
    },
    {
      "id": "proof_metric",
      "purpose": "Quantified believability",
      "useWhen": [
        "admissible_metric_exists"
      ],
      "duration": {
        "min": 4,
        "max": 7
      },
      "evidence": {
        "required": [
          "ledger_admissible_metric_verbatim"
        ],
        "sources": [
          "vault_proof",
          "brief",
          "url_published"
        ],
        "hardFailWithout": "admissible_metric"
      },
      "visual": {
        "archetypes": [
          "DATA_VIZ",
          "TYPE_ONLY"
        ],
        "metricsPerFrame": 1,
        "sequentialBeatsMax": 2,
        "contextLineRequired": true,
        "attributionIfAvailable": true
      },
      "narration": {
        "role": "voice_says_the_number",
        "screenVoiceExactMatch": true,
        "anchors": [
          "NUMBER"
        ]
      },
      "motion": {
        "energy": 0.8,
        "countUpAllowedIf": "final_value_holds_gte_1s",
        "countUpEasing": "decelerate_no_overshoot",
        "primaryMoves": [
          "count_up",
          "scale_settle"
        ]
      },
      "mistakes": [
        "fake_precision",
        "unattributed_superlatives",
        "competing_metrics",
        "unreadable_count_up",
        "vo_screen_number_mismatch"
      ],
      "pattern": "numeral_counts_decelerating -> lands_on_number_word -> unit_context_under -> hold"
    },
    {
      "id": "comparison",
      "purpose": "Make the switch from the old way feel obvious",
      "useWhen": [
        "recognizable_old_way_exists"
      ],
      "optional": true,
      "duration": {
        "min": 6,
        "max": 10
      },
      "evidence": {
        "required": [
          "honest_defensible_contrast"
        ],
        "namedCompetitorRequires": [
          "explicit_user_instruction",
          "user_supplied_claims"
        ],
        "defaultForm": "old_way_vs_with_product"
      },
      "visual": {
        "archetypes": [
          "SPLIT_COMPARE",
          "DATA_VIZ"
        ],
        "weightAsymmetryRequired": true,
        "beforeSide": "muted_accent_free",
        "afterSide": "brand_lit_owns_accent"
      },
      "narration": {
        "role": "parallel_contrast_clauses",
        "anchors": [
          "STRESS_on_pivot_word"
        ]
      },
      "motion": {
        "energy": 0.7,
        "afterSideMotionQuality": "superior",
        "primaryMoves": [
          "meaning_carrying_wipe",
          "replace_push"
        ]
      },
      "mistakes": [
        "strawman_before",
        "uninstructed_competitor_naming",
        "fifty_fifty_weight",
        "indistinct_sides",
        "defensive_length"
      ],
      "pattern": "muted_before_panel -> wipe_on_pivot_word -> brand_lit_after -> after_expands_to_full"
    },
    {
      "id": "social_proof",
      "purpose": "Borrowed trust from real customers and quotes",
      "useWhen": [
        "real_testimonial_or_logo_assets_exist"
      ],
      "duration": {
        "min": 5,
        "max": 8
      },
      "evidence": {
        "required": [
          "verbatim_testimonial_or_supplied_logos"
        ],
        "zeroFallback": true,
        "hardFailWithout": "real_social_assets",
        "logoSource": "vault_assets_only_never_web"
      },
      "visual": {
        "archetypes": [
          "HUMAN_FRAME",
          "TYPE_ONLY",
          "ICON_CONSTELLATION"
        ],
        "quoteTypography": true,
        "attributionLine": "label_face",
        "logoStrip": "single_row_equal_treatment"
      },
      "narration": {
        "role": "summary_line_or_silence_never_duel_the_quote",
        "anchors": [
          "PAUSE"
        ]
      },
      "motion": {
        "energy": 0.55,
        "quoteSet": "line_by_line",
        "karaokeForbidden": true,
        "holdFrom": "legibility_formula"
      },
      "mistakes": [
        "fabricated_names_or_companies",
        "logo_soup",
        "meaning_shifting_trims",
        "unreadable_quote_holds"
      ],
      "pattern": "quote_sets_line_by_line_music_forward -> attribution -> logo_row_resolves -> read_hold"
    },
    {
      "id": "objection_handling",
      "purpose": "Preempt the single top blocker",
      "useWhen": [
        "structure_90s_demo",
        "structure_enterprise"
      ],
      "duration": {
        "min": 6,
        "max": 10
      },
      "objectionsPerScene": 1,
      "evidence": {
        "required": [
          "verified_counter_fact"
        ],
        "complianceClaimsRule": "exact_cert_names_verbatim_from_inputs_only",
        "securityIconographyRule": "only_when_some_security_claim_exists",
        "hardFailWithout": "verified_counter_fact"
      },
      "visual": {
        "archetypes": [
          "TYPE_ONLY",
          "UI_FRAMED",
          "DIAGRAM_SCHEMATIC",
          "ICON_CONSTELLATION"
        ],
        "character": "most_restrained_frame_in_video",
        "grid": "stable"
      },
      "narration": {
        "role": "name_objection_then_dissolve_with_fact",
        "maxSentences": 2,
        "anchors": [
          "REVEAL"
        ]
      },
      "motion": {
        "energy": 0.5,
        "character": "near_stillness_stability_is_the_message"
      },
      "mistakes": [
        "invented_certifications",
        "objection_checklist_spray",
        "defensive_tone",
        "placed_after_cta"
      ],
      "pattern": "objection_plain_type -> verified_fact_sets_steady -> badge_resolves_once -> long_stable_hold"
    },
    {
      "id": "cta",
      "purpose": "One action; the funnel's end",
      "useWhen": [
        "always_second_to_last_or_merged_with_outro"
      ],
      "duration": {
        "min": 4,
        "max": 7
      },
      "evidence": {
        "required": [
          "real_cta_language",
          "real_destination_url"
        ],
        "freeTrialOnlyIfConfirmed": true,
        "hardFailWithout": "real_destination"
      },
      "visual": {
        "archetypes": [
          "TYPE_ONLY",
          "LOGO_FIELD",
          "UI_FRAMED"
        ],
        "actionsPerVideo": 1,
        "urlMinScale": "body_or_larger",
        "contrast": "maximum"
      },
      "narration": {
        "role": "imperative_matching_screen_verbatim",
        "maxWords": 8,
        "anchors": [
          "IMPERATIVE"
        ]
      },
      "motion": {
        "energy": 0.6,
        "character": "confident_set_then_designed_near_still",
        "microMotionFloor": "breathing_scale_lte_1pct",
        "holdRule": "url_readable_twice"
      },
      "mistakes": [
        "multiple_ctas",
        "fine_print_url",
        "early_cutaway",
        "vo_screen_cta_mismatch"
      ],
      "pattern": "frame_clears -> verb_phrase_on_imperative -> url_under -> near_still_read_twice_hold"
    },
    {
      "id": "logo_outro",
      "purpose": "Brand stamp; the last pixel kept",
      "useWhen": [
        "always_last"
      ],
      "duration": {
        "min": 2,
        "max": 3
      },
      "evidence": {
        "required": [
          "logo_asset_correct_variant"
        ],
        "taglineOnlyIfInVault": true,
        "hardFailWithout": "logo_asset"
      },
      "visual": {
        "archetypes": [
          "LOGO_FIELD"
        ],
        "background": "clean_brand_field",
        "competingElements": 0
      },
      "narration": {
        "role": "silence_or_brand_name_once",
        "anchors": [
          "PAUSE"
        ]
      },
      "motion": {
        "energy": 0.3,
        "signatureMoveMaxSeconds": 2.5,
        "trueStillHoldMinSeconds": 1,
        "sfx": "optional_single_sting"
      },
      "mistakes": [
        "long_logo_animation",
        "busy_background",
        "logo_cta_collision",
        "ending_on_motion"
      ],
      "pattern": "cta_fades -> logo_signature_move -> 1s_true_still -> end"
    },
    {
      "id": "section_header",
      "purpose": "Chapter title naming the capability the next scene proves; not a hook, promise, or claim",
      "useWhen": [
        "feature_parade",
        "videos_with_3plus_capabilities",
        "text_driven_first_class"
      ],
      "forbiddenIn": [
        "teaser_30s"
      ],
      "duration": {
        "min": 1.5,
        "max": 4
      },
      "sequencing": "between_promise_and_demo_families_recurs_before_each_demo_group",
      "evidence": {
        "required": [],
        "rule": "evidence_free_by_design_name_only_max_4_words_one_line",
        "statusTagAllowedIfEvidenced": [
          "Beta",
          "New"
        ],
        "reclassification": "any_verb_claim_number_or_superlative_makes_it_a_claim_card_full_ledger_rules",
        "orphanRule": "must_be_immediately_followed_by_feature_demo_workflow_demo_or_ui_proof_proving_the_named_capability_else_reject",
        "hardFailWithout": "successor_proof_scene"
      },
      "visual": {
        "archetypes": [
          "TYPE_ONLY"
        ],
        "content": "capability_name_on_clean_brand_field_nothing_else",
        "maxLines": 1,
        "labelMaxWords": 4
      },
      "narration": {
        "role": "vo_speaks_capability_name_on_card_set_plus_optional_bridge",
        "anchors": [
          "NAME"
        ],
        "textDriven": "card_is_the_narration_hold_uses_9_0_multiplier"
      },
      "motion": {
        "energy": 0.6,
        "primaryMoves": [
          "type_slam",
          "mask_reveal"
        ],
        "exit": "hard_cut_into_proof_scene",
        "paradeCompression": "late_parade_holds_compress_toward_1_5s_floor"
      },
      "mistakes": [
        "claims_smuggled_into_header",
        "orphaned_header",
        "two_line_header",
        "subtitle_duplicating_demo_label",
        "overdecorated_card",
        "header_before_every_scene"
      ],
      "pattern": "card_sets_on_beat_or_NAME -> legibility_hold -> hard_cut_to_proof"
    }
  ],
  "storyStructures": [
    {
      "id": "teaser_30s",
      "duration": 30,
      "audience": "aware",
      "context": [
        "paid_social",
        "launch_hype"
      ],
      "scenes": [
        {
          "family": "hook",
          "start": 0,
          "end": 3
        },
        {
          "family": "promise",
          "start": 3,
          "end": 8
        },
        {
          "family": "feature_demo",
          "variant": "flash",
          "count": 3,
          "start": 8,
          "end": 20
        },
        {
          "family": "ui_proof|proof_metric",
          "rule": "strongest_evidence_wins",
          "start": 20,
          "end": 25
        },
        {
          "family": "cta",
          "start": 25,
          "end": 28
        },
        {
          "family": "logo_outro",
          "start": 28,
          "end": 30
        }
      ],
      "evidenceBill": [
        "positioning_line",
        "one_strong_visual_asset"
      ],
      "notes": "floor_structure_all_others_degrade_toward_this"
    },
    {
      "id": "explainer_45s",
      "duration": 45,
      "audience": "semi_aware",
      "context": [
        "website",
        "organic_social"
      ],
      "scenes": [
        {
          "family": "hook",
          "start": 0,
          "end": 4
        },
        {
          "family": "problem",
          "start": 4,
          "end": 10
        },
        {
          "family": "promise",
          "start": 10,
          "end": 16
        },
        {
          "family": "feature_demo",
          "count": 2,
          "start": 16,
          "end": 30
        },
        {
          "family": "proof_metric|social_proof",
          "fallback": "ui_proof",
          "start": 30,
          "end": 36
        },
        {
          "family": "cta",
          "start": 36,
          "end": 42
        },
        {
          "family": "logo_outro",
          "start": 42,
          "end": 45
        }
      ],
      "evidenceBill": [
        "positioning_line",
        "2_evidenced_features",
        "1_proof_item_or_fallback"
      ]
    },
    {
      "id": "launch_60s",
      "duration": 60,
      "audience": "mixed",
      "context": [
        "launch_day",
        "homepage_hero"
      ],
      "flagship": true,
      "scenes": [
        {
          "family": "hook",
          "start": 0,
          "end": 4
        },
        {
          "family": "problem",
          "start": 4,
          "end": 12
        },
        {
          "family": "promise",
          "start": 12,
          "end": 18
        },
        {
          "family": "workflow_demo",
          "steps": "3-4",
          "start": 18,
          "end": 32
        },
        {
          "family": "feature_demo",
          "count": 2,
          "start": 32,
          "end": 44
        },
        {
          "family": "proof_metric+social_proof",
          "form": "sequential_beats",
          "fallback": "ui_proof",
          "start": 44,
          "end": 52
        },
        {
          "family": "cta",
          "start": 52,
          "end": 57
        },
        {
          "family": "logo_outro",
          "start": 57,
          "end": 60
        }
      ],
      "evidenceBill": [
        "positioning_line",
        "real_ui_3_step_workflow",
        "2_evidenced_features",
        "1_proof_item"
      ],
      "degradeTo": "explainer_45s_stretched"
    },
    {
      "id": "demo_90s",
      "duration": 90,
      "audience": "high_intent",
      "context": [
        "pricing_page",
        "sales_cycle",
        "onboarding"
      ],
      "scenes": [
        {
          "family": "hook",
          "start": 0,
          "end": 5
        },
        {
          "family": "problem",
          "start": 5,
          "end": 12
        },
        {
          "family": "promise",
          "start": 12,
          "end": 18
        },
        {
          "family": "workflow_demo",
          "steps": 4,
          "start": 18,
          "end": 40
        },
        {
          "family": "feature_demo",
          "count": 3,
          "start": 40,
          "end": 60
        },
        {
          "family": "ui_proof",
          "start": 60,
          "end": 68
        },
        {
          "family": "proof_metric",
          "start": 68,
          "end": 75
        },
        {
          "family": "objection_handling",
          "start": 75,
          "end": 82
        },
        {
          "family": "cta",
          "start": 82,
          "end": 88
        },
        {
          "family": "logo_outro",
          "start": 88,
          "end": 90
        }
      ],
      "evidenceBill": [
        "4_real_ui_assets_spanning_workflow",
        "3_evidenced_features",
        "1_metric",
        "1_verified_objection_fact"
      ],
      "missingObjectionEvidence": "cut_slot_extend_product_evidence",
      "featureParadeVariant": {
        "useWhen": "version_or_release_launch_3plus_new_capabilities_with_demonstrable_hero_workflow",
        "narrationModes": [
          "vo",
          "text_driven"
        ],
        "canonicalFor": "text_driven",
        "scenes": [
          {
            "family": "hook",
            "variant": "bold_statement_allowed",
            "start": 0,
            "end": 7
          },
          {
            "family": "promise",
            "variant": "compressed_name_plus_version_reveal",
            "start": 7,
            "end": 9
          },
          {
            "family": "workflow_demo",
            "variant": "hero_take_single_continuous_real_capture_longest_hold",
            "start": 9,
            "end": 24
          },
          {
            "repeatGroup": {
              "n": {
                "min": 4,
                "max": 6
              },
              "unit": [
                "section_header",
                "feature_demo"
              ]
            },
            "start": 24,
            "end": 72
          },
          {
            "family": "cta",
            "variant": "long_landing_hold_url_read_twice",
            "start": 72,
            "end": 82
          },
          {
            "family": "logo_outro",
            "start": 82,
            "end": 90
          }
        ],
        "rules": {
          "heroEarnsParade": "no_hero_demo_means_downgrade_to_standard_demo_90s",
          "groupAcceleration": "early_pairs_10s_late_pairs_compress_toward_4s_cut_density_rises_toward_cta",
          "problemScene": "optional_often_cut_version_launch_audience_knows_problem",
          "groupCeiling": 6,
          "beyondCeiling": "cut_not_compressed"
        },
        "evidenceBill": [
          "1_hero_workflow_capture",
          "1_real_evidence_asset_per_group_instance"
        ]
      }
    },
    {
      "id": "founder_walkthrough",
      "duration": {
        "min": 90,
        "max": 150,
        "reference": 120
      },
      "audience": "community_and_early_adopters",
      "register": "conversational_loom_polished",
      "scenesProportional": [
        {
          "family": "hook",
          "share": 0.05,
          "note": "personal_insight"
        },
        {
          "family": "problem",
          "share": 0.12,
          "note": "told_as_story"
        },
        {
          "family": "promise",
          "share": 0.08,
          "note": "understated_reveal"
        },
        {
          "family": "workflow_demo",
          "share": 0.45,
          "note": "the_spine_first_person_real_pace"
        },
        {
          "family": "proof_metric|social_proof",
          "share": 0.12,
          "note": "plainly_stated"
        },
        {
          "family": "cta",
          "share": 0.1,
          "note": "soft"
        },
        {
          "family": "logo_outro",
          "share": 0.08
        }
      ],
      "registerRules": [
        "founder_vo_script_is_law_if_supplied",
        "captions_always_on",
        "cut_share_rises",
        "type_scenes_minimal",
        "ui_proof_discipline_across_whole_workflow"
      ],
      "evidenceBill": [
        "substantial_real_ui_required_else_unavailable"
      ]
    },
    {
      "id": "enterprise_proof_led",
      "duration": {
        "min": 75,
        "max": 90,
        "reference": 75
      },
      "audience": "buying_committee",
      "register": "calm_captions_always_on_max_claims_discipline",
      "scenes": [
        {
          "family": "hook",
          "note": "outcome_first",
          "start": 0,
          "end": 5
        },
        {
          "family": "problem",
          "note": "organizational_cost_risk_coordination",
          "start": 5,
          "end": 13
        },
        {
          "family": "promise",
          "start": 13,
          "end": 19
        },
        {
          "family": "workflow_demo",
          "note": "team_scale_multi_user_review_handoff",
          "start": 19,
          "end": 33
        },
        {
          "family": "proof_metric",
          "count": "1-2_sequential",
          "start": 33,
          "end": 43
        },
        {
          "family": "social_proof",
          "note": "logos_plus_one_quote",
          "start": 43,
          "end": 52
        },
        {
          "family": "objection_handling",
          "note": "security_compliance_verified_only",
          "start": 52,
          "end": 61
        },
        {
          "family": "cta",
          "note": "demo_request_language",
          "start": 61,
          "end": 70
        },
        {
          "family": "logo_outro",
          "start": 70,
          "end": 75
        }
      ],
      "evidenceBill": [
        "1_metric_AND_1_logo_or_testimonial",
        "verified_security_facts"
      ],
      "unavailableWhenProofThin": true,
      "degradeTo": "explainer_45s_or_launch_60s_with_logged_notice"
    }
  ],
  "structureSelection": {
    "steps": [
      "duration_and_platform_pick_candidates",
      "audience_awareness_toggles_problem_scene",
      "evidence_audit_against_bill",
      "apply_substitution_table",
      "core_floor_check"
    ],
    "substitutionTable": {
      "proof_metric": [
        "ui_proof",
        "extra_feature_demo"
      ],
      "social_proof": [
        "cut_and_extend_product_evidence"
      ],
      "objection_handling": [
        "cut"
      ],
      "workflow_demo": [
        "feature_demo_sequence"
      ],
      "comparison": [
        "cut"
      ]
    },
    "coreFloor": "no_real_product_evidence -> teaser_30s_declared_abstract_only",
    "rule": "structures_degrade_before_they_fabricate",
    "sceneFloorRule": "if_scaling_pushes_scene_below_family_floor_cut_a_scene_instead",
    "repeatGroupNotation": {
      "syntax": "Nx(scene_a -> scene_b)",
      "scheduling": "atomic_unit_all_n_instances_must_clear_ledger_before_admission",
      "shortfall": "evidence_for_only_m_of_n_shrinks_group_to_m_and_logs",
      "varietyLaw": "applies_across_group_instances_no_rig_family_twice_running"
    },
    "paradeTrigger": "version_release_launch_3plus_capabilities_plus_hero_workflow -> demo_90s.featureParadeVariant"
  },
  "evidenceRules": {
    "primeDirective": "witness_not_author_of_facts",
    "ledger": {
      "entryFields": [
        "text",
        "class",
        "source",
        "verbatim_value",
        "admissible"
      ],
      "sources": [
        "script",
        "brief",
        "vault_proof",
        "url_published",
        "screenshot_visible"
      ],
      "neverSources": [
        "reference_video",
        "model_knowledge"
      ],
      "renderRule": "claim_renders_on_screen_or_in_vo_only_with_admissible_entry"
    },
    "claimClasses": {
      "customers_logos": {
        "allowedSources": [
          "vault_proof",
          "brief"
        ],
        "rules": [
          "logo_assets_as_supplied_only",
          "counts_need_source"
        ],
        "fallback": "cut_social_proof_no_generic_trusted_by"
      },
      "metrics": {
        "allowedSources": [
          "vault_proof",
          "brief",
          "url_published"
        ],
        "rules": [
          "verbatim_value_and_unit",
          "no_rounding_up",
          "no_added_precision",
          "comparatives_keep_basis"
        ],
        "fallback": "replace_with_ui_proof_or_demonstration"
      },
      "integrations": {
        "allowedSources": [
          "vault_proof",
          "url_published",
          "brief"
        ],
        "rules": [
          "named_list_only",
          "third_party_logos_need_assets",
          "no_integrates_with_everything"
        ],
        "fallback": "text_list_named_few_or_omit"
      },
      "capabilities": {
        "sourceHierarchy": [
          "screenshot_visible",
          "url_published",
          "brief"
        ],
        "rules": [
          "shown_requires_visual_evidence",
          "brief_only_claims_tagged_and_flagged"
        ],
        "fallback": "told_typographically_or_omitted_never_shown_via_invented_ui"
      },
      "testimonials": {
        "allowedSources": [
          "vault_proof",
          "brief"
        ],
        "rules": [
          "verbatim",
          "attribution_as_given",
          "no_meaning_shifting_trims",
          "no_synthesis"
        ],
        "fallback": "cut_scene"
      },
      "security_compliance": {
        "allowedSources": [
          "vault_proof",
          "brief",
          "url_published"
        ],
        "rules": [
          "exact_cert_names_verbatim_only",
          "no_implying_iconography_without_claim"
        ],
        "fallback": "omit"
      },
      "pricing_offer": {
        "allowedSources": [
          "vault_proof",
          "brief",
          "url_published"
        ],
        "rules": [
          "exact_figures_and_terms",
          "free_trial_only_if_confirmed",
          "no_price_superlatives_without_source"
        ],
        "fallback": "cta_silent_on_price"
      }
    },
    "languageDowngradeLadder": [
      "sourced_metric_exact_number",
      "verified_capability_demonstrative",
      "brief_asserted_told_and_flagged",
      "cut_scene"
    ],
    "superlativeRule": "requires_explicit_source_stating_exactly_that_else_rewrite_demonstrable",
    "bannedFillerDefault": [
      "seamless",
      "revolutionary",
      "game-changing",
      "next-generation",
      "supercharge",
      "unleash",
      "empower",
      "cutting-edge",
      "effortless"
    ],
    "degradationsListRequired": true
  },
  "brandRules": {
    "roles": {
      "identity": "law",
      "taste": "bias",
      "proof": "inventory"
    },
    "logo": {
      "variantsAsSuppliedOnly": true,
      "variantByBackgroundLuminance": true,
      "clearSpaceMinOfLogoHeight": 0.5,
      "minSizePctFrameHeight": 4,
      "forbidden": [
        "recolor",
        "distort",
        "outline",
        "glow",
        "internal_geometry_animation_without_spec"
      ],
      "appearances": {
        "outro": "mandatory",
        "hook": "small_optional",
        "elsewhere": "none_by_default"
      }
    },
    "color": {
      "roles": [
        "background_family",
        "text",
        "single_accent"
      ],
      "accentReservedFor": [
        "promise_turn",
        "metric_land",
        "highlight",
        "cta"
      ],
      "derivation": "tints_shades_of_vault_hues_only",
      "offVaultHues": "forbidden_including_generic_grays",
      "contrast": {
        "bodyMin": 4.5,
        "displayMin": 3.0
      }
    },
    "fonts": {
      "roles": [
        "display",
        "body",
        "label_mono"
      ],
      "suppliedWeightsOnly": true,
      "fauxStylesForbidden": true,
      "missingRoleFallback": "declared_default_pairing_flagged"
    },
    "screenshots": {
      "allowed": [
        "crop",
        "zoom",
        "pan",
        "highlight"
      ],
      "forbidden": [
        "repaint",
        "alter_data",
        "composite_fake_elements"
      ],
      "framingConsistencyRequired": true
    },
    "taste": {
      "audience": [
        "vocabulary_ceiling",
        "pacing_bias",
        "scene_mix"
      ],
      "positioning": "single_source_of_promise_line_compress_to_one_sentence",
      "voice": {
        "register": true,
        "sentenceLengthBias": true,
        "adjectiveBudgetPerSentenceDefault": 1,
        "brandWordListsLayerOverDoctrine": true
      },
      "motionTaste": {
        "type": "calm_kinetic_scalar",
        "modulates": [
          "hold_multiplier",
          "transition_energy",
          "cut_frequency",
          "camera_aggression",
          "type_set_violence"
        ],
        "neverOverrides": [
          "legibility",
          "safe_areas",
          "evidence_rules"
        ]
      },
      "ctaLanguage": "verbatim_when_supplied"
    },
    "weakVault": {
      "minimumViable": [
        "logo_or_wordmark",
        "one_brand_color",
        "product_name_plus_one_liner"
      ],
      "belowMinimum": "refuse_gracefully_request_inputs",
      "gapsReportRequired": true,
      "defaults": {
        "colors": "ramp_from_single_brand_color_plus_luminance_neutrals",
        "fonts": "declared_neutral_grotesque_plus_mono_flagged",
        "voice": "neutral_confident",
        "motionTaste": "mid_scalar",
        "audience": "infer_from_url_brief_state_assumption",
        "positioning": "derive_from_url_hero_tag_url_published_flag_for_confirmation",
        "proofClaims": "proof_families_disabled"
      }
    }
  },
  "referenceRules": {
    "principle": "style_instrument_reading_not_source_material",
    "extractAsParameters": [
      {
        "dimension": "pacing",
        "params": [
          "cut_frequency_distribution",
          "scene_duration_percentiles",
          "tempo_curve"
        ]
      },
      {
        "dimension": "ui_density",
        "params": [
          "ui_runtime_share",
          "full_bleed_vs_framed_ratio",
          "avg_zoom_level"
        ]
      },
      {
        "dimension": "typography_behavior",
        "params": [
          "type_vs_ui_balance",
          "set_exit_style_enums"
        ]
      },
      {
        "dimension": "transitions",
        "params": [
          "family_shares_cut_wipe_match_morph"
        ]
      },
      {
        "dimension": "camera_rhythm",
        "params": [
          "push_pan_energy_scalar",
          "hold_length_distribution"
        ]
      },
      {
        "dimension": "proof_holds",
        "params": [
          "evidence_frame_hold_multiplier"
        ]
      },
      {
        "dimension": "cta_energy",
        "params": [
          "hard_sell_quiet_confidence_scalar"
        ]
      },
      {
        "dimension": "music_sfx_energy",
        "params": [
          "bpm_band",
          "hit_density",
          "sfx_presence_scalar"
        ]
      }
    ],
    "contributes": {
      "words": 0,
      "layouts": 0,
      "colors": 0,
      "assets": 0,
      "claims": 0
    },
    "hardBoundaries": [
      "no_wording",
      "no_layout_cloning_swap_test",
      "no_color_adoption_vault_owns_every_hue",
      "no_asset_mimicry_logo_mascot_illustration_ui",
      "no_vo_echo_structure_or_phrasing",
      "no_music_matching_energy_band_only",
      "never_an_evidence_source"
    ],
    "swapTest": "if_swapping_logos_would_pass_scene_as_reference_scene_delete_and_replan",
    "precedence": [
      "vault_identity",
      "vault_motion_taste",
      "reference_style_dna",
      "doctrine_defaults"
    ]
  },
  "motionRules": {
    "laws": [
      {
        "id": "one_owner_per_frame",
        "displayToBodyScaleMin": 3.0
      },
      {
        "id": "motion_budget",
        "primaryMovesPerScene": 1,
        "secondaryMovesMax": 2,
        "ambientDriftMaxPct": 2,
        "everyAnimationNeedsReason": [
          "vo_anchor",
          "continuity_handoff",
          "designed_beat"
        ]
      },
      {
        "id": "legibility_gate",
        "holdSecondsFormula": "max(1.5, 0.5 + 0.36 * word_count)",
        "minSizePctFrameHeight": {
          "display": 5.0,
          "body": 2.5,
          "captions": 3.2
        },
        "uiTextRule": "legible_after_crop_or_intentionally_defocused_never_middle",
        "uiTextMinPxAtOutput": 14,
        "failureFix": "shorten_text_or_lengthen_hold_never_trim_hold_into_legality",
        "textDrivenMultiplier": 1.25,
        "derivedFrom": "subtitle_reading_speed_research_17cps_standard_20_ceiling_netflix_6s_rule"
      },
      {
        "id": "safe_areas",
        "actionSafeMarginPct": 5,
        "captionBandBottomPct": 20,
        "designCenterWeighted": true,
        "aspectVariants": "relayout_not_blind_crop"
      },
      {
        "id": "variety_law",
        "archetypes": "see_visualArchetypes.library",
        "consecutiveSameArchetypeMax": 1,
        "workflowInternalException": true,
        "singleRigMaxShareOfScenes": 0.4,
        "uiShotSizeRotation": [
          "wide_app",
          "medium_panel",
          "close_control"
        ],
        "repeatGroupPairException": true,
        "singleArchetypeMaxShare": 0.5,
        "singleArchetypeShareExemptModes": [
          "founder_vo",
          "ambient_demo"
        ]
      },
      {
        "id": "anchored_reveals",
        "syncToleranceMs": "per_sync_tier_see_audioRules.syncTiers",
        "significantEntryDuringUnmarkedSilence": "forbidden_except_designed_beats"
      },
      {
        "id": "momentum_handoff",
        "exitEntryVectorContinuity": true,
        "energyCurve": {
          "hook": 0.9,
          "problem": 0.5,
          "promise": 0.7,
          "demo": 0.65,
          "proof_peak": 0.8,
          "cta": 0.6,
          "logo": 0.3
        }
      },
      {
        "id": "transition_law",
        "cutShareMin": 0.6,
        "nonCutMustEncode": [
          "contrast",
          "continuity",
          "reveal"
        ],
        "signatureTransitionStylesPerVideoMax": 1,
        "cutPriority": "murch_rule_of_six_emotion_story_rhythm_eyetrace_plane_space"
      },
      {
        "id": "proof_holds",
        "evidenceFramesGet": "top_quartile_hold_durations",
        "uiProofHoldMinSeconds": 3,
        "uiProofDriftMaxPctPerSecond": 4
      },
      {
        "id": "real_vs_synthetic",
        "realScreenshotOps": [
          "crop",
          "zoom",
          "pan",
          "highlight"
        ],
        "realScreenshotForbidden": [
          "repaint",
          "inject_fake_data",
          "composite_invented_elements"
        ],
        "syntheticMustBe": "declared_abstraction_flat_simplified_brand_styled_schematic",
        "syntheticForbidden": [
          "browser_chrome_costume",
          "os_chrome_costume",
          "photographic_fidelity_fake_data"
        ]
      },
      {
        "id": "micro_motion_timing",
        "basis": "material_design_interaction_physics_scaled_1_5x_to_2_5x_for_passive_viewing",
        "microMovesExitsMs": [
          150,
          300
        ],
        "standardSetsMs": [
          300,
          600
        ],
        "heroSetsLargeTraversalsMs": [
          500,
          900
        ],
        "easing": "asymmetric_fast_takeoff_soft_landing_never_linear",
        "exitsFasterThanEntrances": true,
        "durationScalesWith": [
          "travel_distance",
          "area_change"
        ],
        "countUps": "decelerate_into_final_value"
      }
    ]
  },
  "audioRules": {
    "masterClockPerMode": "see_narrationModes.perMode",
    "markers": {
      "taxonomy": [
        "REVEAL",
        "STRESS",
        "NUMBER",
        "NAME",
        "IMPERATIVE",
        "PAUSE"
      ],
      "minRevealPerScene": 1,
      "stressResponseMenu": [
        "scale_settle",
        "accent_flash",
        "underline_draw"
      ],
      "stressResponsePickCount": 1,
      "numberRule": "screen_and_voice_exact_match",
      "syncToleranceMs": 120
    },
    "wordBudget": {
      "wpmTarget": [
        140,
        160
      ],
      "wordsPerSecond": [
        2.3,
        2.7
      ],
      "rule": "scene_duration_times_wps_is_hard_script_budget_cut_at_script_not_crammed_at_read",
      "examples": {
        "hook_4s_max_words": 10,
        "feature_6s_max_words": 15,
        "video_60s_max_words": 150
      }
    },
    "captions": {
      "unit": "phrase_3_to_7_words",
      "karaoke": "only_if_vault_taste_kinetic",
      "maxLines": 2,
      "maxCharsPerLine": 36,
      "leadInMs": 100,
      "lingerMs": {
        "min": 150,
        "max": 300
      },
      "neverStraddleCut": true,
      "band": "bottom_20pct",
      "face": "vault_body_or_label",
      "alwaysOnFor": [
        "founder_walkthrough",
        "enterprise_proof_led"
      ],
      "readingSpeedBudget": "2x36_at_phrase_durations_stays_at_or_under_17cps_never_approaches_20",
      "defaultOn": "all_voiced_modes",
      "nonNegotiableFor": [
        "talking_head",
        "testimonial_led"
      ],
      "offOnlyIn": "text_driven",
      "rationale": "muted_viewing_prevalence_plus_caption_engagement_recall_lifts"
    },
    "music": {
      "structureMap": {
        "hook": "intro",
        "problem": "tension_texture",
        "promise": "open_up",
        "demo": "groove",
        "proof": "peak",
        "cta_logo": "resolve"
      },
      "mandatoryHits": [
        "promise_cut",
        "metric_land"
      ],
      "tempoBands": {
        "slow_editorial_bpm": [
          70,
          95
        ],
        "standard_launch_bpm": [
          100,
          125
        ],
        "kinetic_parade_bpm": [
          120,
          135
        ],
        "basis": "dube_categorization_40_76_slow_77_107_moderate_108plus_fast_arousal_rises_with_tempo",
        "rule": "tempo_is_taste_knob_vault_over_reference_over_register_default_no_mid_video_bpm_change"
      },
      "bedLevelBelowVoiceDb": {
        "range": [
          15,
          20
        ],
        "accessibilityFloor": 20,
        "basis": "w3c_20db_pro_consensus_15_20_bbc_drop_4db_tiebreak"
      },
      "ducking": {
        "gainReductionDb": [
          6,
          12
        ],
        "attackMs": [
          100,
          150
        ],
        "releaseMs": [
          300,
          500
        ],
        "textDriven": "none_music_leads"
      },
      "deliverable": {
        "integratedLufs": -14,
        "truePeakDbtpMax": -1.0,
        "basis": "youtube_spotify_normalize_minus14_downward_only"
      },
      "resolveOnLogo": true
    },
    "sfx": {
      "densityByRegister": {
        "quiet_max_per_scene": 0.5,
        "standard_max_per_scene": 1.0,
        "kinetic_max_per_scene": 2.0,
        "kineticCondition": "each_justified_by_tier_A_visual_hit"
      },
      "registerAssignment": {
        "quiet": [
          "founder_vo",
          "talking_head",
          "testimonial_led",
          "enterprise_proof_led"
        ],
        "standard": [
          "vo"
        ],
        "kinetic": [
          "text_driven_parade",
          "teaser_30s"
        ]
      },
      "silenceDefault": true,
      "everySoundMapsToVisibleEvent": true,
      "whitelistedMoments": [
        "promise_turn",
        "one_workflow_interaction_beat",
        "metric_land",
        "cta_set",
        "logo_sting"
      ],
      "rigSignatures": {
        "type_slam": "soft_thud_plus_air",
        "panel_slide": "low_fabric_whoosh",
        "zoom_push": "subtle_riser_no_impact",
        "highlight_draw": "fine_tick",
        "count_up": "tick_cluster_decelerating_into_single_resolve",
        "logo_resolve": "brand_sting_or_one_restrained_tonal_hit"
      },
      "ambientDemoRule": "ui_native_sounds_are_the_palette_designed_sfx_stand_down"
    },
    "syncTiers": {
      "basis": "itu_r_bt1359_detect_plus45_minus125_accept_plus90_minus185_ebu_r37_minus60_plus40_film_pm22",
      "tierA_percussive": {
        "appliesTo": [
          "NUMBER_land",
          "NAME_set",
          "logo_sting",
          "any_designed_sfx_hit",
          "lip_sync"
        ],
        "toleranceMs": 40
      },
      "tierB_word_anchored": {
        "appliesTo": [
          "REVEAL",
          "STRESS",
          "IMPERATIVE"
        ],
        "toleranceMs": 120,
        "bias": "prefer_on_or_after_syllable"
      },
      "tierC_beat_locked": {
        "appliesTo": [
          "text_driven_cuts_and_card_sets",
          "ambient_demo"
        ],
        "tolerance": "on_beat_to_2_frames_early"
      }
    }
  },
  "qualityGates": {
    "stage1HardGates": [
      {
        "id": "G1_prompt_leakage",
        "rule": "no_generation_artifact_text_on_screen",
        "detect": "frame_sample_ocr_vs_artifact_token_patterns"
      },
      {
        "id": "G2_static_output",
        "rule": "no_unintended_stillness_gt_2_5s",
        "exempt": "designed_holds_with_micromotion_floor",
        "detect": "per_scene_motion_energy_zero_delta_spans"
      },
      {
        "id": "G3_unreadable_text",
        "rule": "every_text_element_passes_8_3_reading_speed_derived_gate_incl_text_driven_1_25x",
        "detect": "layout_timing_computation_plus_ocr_confidence_spotcheck"
      },
      {
        "id": "G4_fake_dashboard",
        "rule": "no_synthetic_ui_in_real_product_costume",
        "detect": "asset_provenance_audit_every_ui_region"
      },
      {
        "id": "G5_fabricated_claims",
        "rule": "every_rendered_claim_resolves_to_admissible_ledger_entry_including_orphan_header_rule",
        "detect": "ledger_audit_of_final_script_and_onscreen_text_plus_header_successor_check",
        "orphanHeaderRule": "every_section_header_followed_by_scene_proving_named_capability"
      },
      {
        "id": "G6_product_evidence_floor",
        "rule": "real_assets_supplied_implies_gte_1_ui_family_scene_uses_them_else_declared_abstract_never_framed_as_demo",
        "detect": "plan_metadata_asset_usage_map"
      },
      {
        "id": "G7_brand_adherence",
        "rule": "zero_off_vault_hues_fonts_logo_violations",
        "tolerances": {
          "colorDeltaE": 3
        },
        "detect": "per_frame_palette_extraction_font_audit"
      },
      {
        "id": "G8_motion_variety",
        "rule": "archetype_and_rig_caps_respected",
        "detect": "storyboard_sequence_check"
      },
      {
        "id": "G9_narration_desync",
        "rule": {
          "tierA": "pm40ms",
          "tierB": "pm120ms_prefer_late",
          "tierC": "on_beat_to_2_frames_early",
          "captions": "per_9_2",
          "textDrivenHolds": "1_25x_multiplier"
        },
        "detect": "marker_beat_timestamp_diff_per_tier_final_timeline",
        "aliases": [
          "G9_vo_desync"
        ]
      },
      {
        "id": "G10_reference_copying",
        "rule": "all_section7_boundaries_pass_including_swap_test",
        "detect": "layout_wording_similarity_vs_reference_plus_manual_swap_test"
      }
    ],
    "stage2Weights": {
      "story_structure_integrity": 15,
      "evidence_strength_honesty": 15,
      "brand_adherence_expression": 15,
      "motion_craft": 15,
      "readability": 10,
      "narration_visual_sync": 10,
      "pacing_variety": 10,
      "audio_craft": 5,
      "cta_effectiveness": 5
    },
    "shipBands": {
      "flagship": [
        90,
        100
      ],
      "ship": [
        80,
        89
      ],
      "targetedRevision": [
        70,
        79
      ],
      "replanAtDirector": [
        0,
        69
      ]
    },
    "gatePrecedence": "hard_gate_failure_rejects_regardless_of_score",
    "renamedFrom": {
      "narration_visual_sync": "vo_visual_sync",
      "G9_narration_desync": "G9_vo_desync"
    }
  },
  "antiPatterns": [
    {
      "id": "template_slideshow",
      "description": "Template with brand colors poured in; no structure-specific decisions",
      "relatedGate": "G7"
    },
    {
      "id": "stock_metaphor_montage",
      "description": "Gears, handshakes, rockets, timelapses standing in for the product",
      "relatedGate": "G6"
    },
    {
      "id": "karaoke_over_gradients",
      "description": "Word-karaoke captions over animated gradients as the whole video",
      "relatedGate": "G6"
    },
    {
      "id": "fake_dashboard",
      "description": "Invented UI wearing real-product costume",
      "relatedGate": "G4"
    },
    {
      "id": "feature_laundry_list",
      "description": "Constant-energy feature enumeration with no story turn",
      "relatedGate": "G8"
    },
    {
      "id": "motion_wallpaper",
      "description": "Everything drifting, nothing meaning; parallax and whoosh on all elements",
      "relatedGate": "G2_G8"
    },
    {
      "id": "logo_first_open",
      "description": "Opening on the logo before earning attention",
      "relatedGate": null
    },
    {
      "id": "fabricated_social_proof",
      "description": "Invented customers, quotes, counts, or badges",
      "relatedGate": "G5"
    },
    {
      "id": "invented_compliance",
      "description": "Certifications or security badges without verbatim source",
      "relatedGate": "G5"
    },
    {
      "id": "strawman_comparison",
      "description": "Dishonest before-state built to be knocked down",
      "relatedGate": "G5"
    },
    {
      "id": "reference_cloning",
      "description": "Layout, wording, palette, or asset mimicry of the reference video",
      "relatedGate": "G10"
    },
    {
      "id": "accent_everywhere",
      "description": "Accent color in every scene until it means nothing",
      "relatedGate": "G7"
    },
    {
      "id": "dueling_channels",
      "description": "VO reading a quote while the viewer reads it; screen and voice disagreeing on numbers or CTA",
      "relatedGate": "G9"
    },
    {
      "id": "nervous_cutaway",
      "description": "Cutting away from evidence before it can be read; no proof holds",
      "relatedGate": "G3"
    },
    {
      "id": "silent_degradation",
      "description": "Missing inputs papered over with invented defaults instead of logged degradations",
      "relatedGate": "G5"
    },
    {
      "id": "orphan_section_header",
      "description": "Section header whose named capability is not proven by the immediately following scene — an unproven capability claim",
      "relatedGate": "G5"
    },
    {
      "id": "claim_stuffed_header",
      "description": "Verb-claims, numbers, or superlatives smuggled into a section header to dodge Ledger audit",
      "relatedGate": "G5"
    },
    {
      "id": "off_beat_cards",
      "description": "text_driven cards drifting off the music beat grid; slideshow-over-playlist feel",
      "relatedGate": "G9"
    },
    {
      "id": "logo_first_intro",
      "description": "Opening on a logo/brand animation before value; platform data shows steepest audience loss in the opening seconds",
      "relatedGate": "structure"
    },
    {
      "id": "atypical_testimonial_undisclosed",
      "description": "Testimonial states an atypical result without a clear generally-expected-performance disclosure; results-may-vary language is insufficient (FTC)",
      "relatedGate": "G5"
    },
    {
      "id": "linear_easing",
      "description": "Elements moving on linear ramps; motion reads mechanical instead of physical",
      "relatedGate": "G8"
    }
  ],
  "grounding": {
    "sourceGrades": {
      "STD": "published_standard_or_regulation",
      "RES": "peer_reviewed_or_platform_scale_research",
      "DATA": "named_platform_vendor_data",
      "PRAC": "documented_practitioner_consensus"
    },
    "map": {
      "legibility_gate": "PRAC/RES subtitle reading speed: 17cps standard, 20cps Netflix adult ceiling, 12-15 relaxed; six-second rule; derived 0.36s/word",
      "word_budget": "PRAC VO pacing: conversational 120-150 (NCVS), commercial 150-180, explainer 140-160",
      "sync_tiers": "STD ITU-R BT.1359-1 (+45/-125 detect, +90/-185 accept); EBU R37 (-60/+40); film ±22ms; PRAC beat-cut on-or-early",
      "cut_priority": "PRAC Murch, In the Blink of an Eye, Rule of Six",
      "music_bed": "STD W3C >=20dB below speech; PRAC 15-20dB consensus; BBC drop-4dB",
      "ducking": "PRAC sidechain practice 6-12dB GR, 100-150ms attack, 300-500ms release",
      "loudness": "DATA YouTube/Spotify normalize ~-14 LUFS downward-only; -1 dBTP convention; broadcast EBU R128 -23 / ATSC A/85 -24 excluded",
      "tempo_bands": "RES Dube et al. 40-76/77-107/108-208; arousal rises with tempo; PRAC genre practice",
      "attention": "DATA Wistia: ~30% lost by 30s; hook ~5s; sub-minute ~52% engagement; flat 1-5min then drop; CTA end-placed best <5min",
      "captions_on": "DATA/PRAC muted-viewing prevalence; caption engagement/recall lifts",
      "micro_motion": "PRAC Material Design: ~300ms mobile typical, 375 complex, >400 sluggish, 150-200 small; exits faster; scaled 1.5-2.5x for video",
      "evidence_legal": "STD FTC substantiation doctrine; 16 CFR 255 (2023, AI endorsers, typicality); consumer-review rule 2024",
      "contrast": "STD WCAG 2.x AA 4.5:1 body / 3:1 large",
      "archetypes": "PRAC industry explainer-style taxonomies collapsed to 15 scene-level archetypes",
      "narration_modes": "PRAC/DATA observed shipping registers incl. founder/UGC rise, music-driven text register",
      "design_decisions_unsourced": "energy curve values, scene-count ceilings, 40% rig cap, 60% cut share, group ceilings — internally consistent taste validated on benchmark teardowns; taste may bias these, never the sourced floors"
    }
  }
}
```

---

*The graph above ships alongside this document as `saas-explainer-knowledge-graph.json`; keep them versioned together — a Director consuming graph v1.2.0 must be reading bible v1.2.0.*

---

## 12. Sources & Grounding

Every operative number in this doctrine traces to one of four source grades: **[STD]** published standard or regulation · **[RES]** peer-reviewed or platform-scale research · **[DATA]** named platform/vendor data · **[PRAC]** documented practitioner consensus (named institutions or converging professional guidance). Where a value is a design decision *derived from* a source rather than copied out of it, the derivation is stated.

| Parameter | Doctrine value | Source & derivation |
|---|---|---|
| Comfortable subtitle reading speed | ~17 cps standard; 12–15 relaxed; 20 cps ceiling | [PRAC/RES] Professional subtitling standards incl. Netflix's 20 cps adult limit; eye-tracking studies test 12/16/20/28 cps and show proportional reading time rising with speed (Szarkowska et al.; Liao et al. replications) |
| 8.3 hold formula | max(1.5s, 0.5 + 0.36s × words); ×1.25 text_driven | Derived: 17–20 cps ≈ 2.8–3.3 words/s at ~6 chars/word; display cards budgeted at ~2.8 w/s (0.36s/word) because composition competes for gaze; the classic six-second rule (2×35 chars/6s) and Netflix's ~0.83s minimum event anchor the 1.5s floor for designed cards |
| VO pacing | 140–160 WPM explainer target | [PRAC] VO industry guidance: conversational 120–150 (NCVS), commercials 150–180, corporate/long-form ~140; explainer sweet spot 150–160 |
| AV sync detectability | +45/−125ms detect; +90/−185ms accept | [STD] ITU-R BT.1359-1 subjective thresholds (positive = audio leads) |
| Production sync tolerance | Tier A ±40ms | [STD] EBU R37 chain tolerance ≈ −60/+40ms; film lip-sync convention ±22ms (~1 frame); Tier A sits at the strict edge |
| Tier B ±120ms prefer-late | Word-anchored reveals | Derived: inside ITU acceptability; prefer-late bias mirrors the measured asymmetry (audio-early detected sooner than audio-late) |
| Tier C beat cuts | On-beat to 2 frames early | [PRAC] Editing convention: cuts land on or a hair before the musical beat |
| Cut priority | Emotion > story > rhythm > eye-trace > plane > space | [PRAC] Walter Murch, *In the Blink of an Eye* — the Rule of Six |
| Music bed level | 15–20 dB below voice; 20 dB accessibility floor | [STD/PRAC] W3C WCAG technique: background ≥ 20 dB below foreground speech; pro-mixing consensus 15–20 dB; BBC guidance: drop music a further 4 dB after mixing |
| Ducking automation | 6–12 dB GR, ~100–150ms attack, 300–500ms release | [PRAC] Sidechain mixing practice for speech-over-music; hard-sell reads tolerate the shallow end (~12 dB gap total) |
| Delivery loudness | −14 LUFS integrated, ≤ −1.0 dBTP | [DATA] YouTube/Spotify normalization ≈ −14 LUFS, downward-only; true-peak limiting convention −1 dBTP (broadcast: EBU R128 −23, ATSC A/85 −24 — not this deliverable) |
| Tempo bands | 70–95 / 100–125 / 120–135 BPM by register | [RES/PRAC] Music-psych categorization: 40–76 slow, 77–107 moderate, 108+ fast (Dubé et al.); arousal rises with tempo; genre practice: pop 100–125, dance 120–130; corporate-library tracks cluster ~108–150 |
| Hook deadline; nose loss | ~5s hook; ~30% gone by 30s; sub-minute ≈ 50% engagement | [DATA] Wistia platform analyses: nose (first 2%) loss 4.9% on 1–2min videos; 564K-video study shows steepest loss in first 30s; sub-minute average ≈ 52% engagement; practitioner read: hook in 5 seconds |
| Length band | 30–90s core; < 2min for site explainers | [DATA] Wistia: engagement roughly flat 1–5 min, drops after 5; explainer guidance < 2 min |
| CTA at the end | cta → logo_outro in all structures | [DATA] Wistia: for videos < 5 min, end-placed conversion elements convert best |
| Captions default-on | All voiced modes | [DATA/PRAC] Muted-viewing prevalence in feeds/B2B contexts; platform research links captions to higher engagement/recall (e.g., TikTok-reported lifts) |
| Micro-motion durations | 150–300ms micro; 300–600ms sets; 500–900ms hero (1.5–2.5× interaction physics) | [PRAC] Material Design motion: ~300ms typical mobile transition, 375ms complex, > 400ms sluggish, 150–200ms small moves; exits faster than entrances; duration scales with travel/area; asymmetric easing natural. Video multiplier is a design decision for passive viewing |
| Evidence & testimonial rules | Ledger, typicality tag, no invented endorsers | [STD] FTC substantiation doctrine (reasonable basis pre-dissemination; implied claims count; overall impression incl. pictures); FTC Endorsement Guides 16 CFR 255 (2023 revision: AI/virtual endorsers covered; typicality; "results may vary" insufficient); FTC consumer-review rule (2024, civil penalties) |
| WCAG contrast | 4.5:1 body, 3:1 large/display | [STD] WCAG 2.x AA |
| Style taxonomy → archetypes | 15 scene archetypes | [PRAC] Industry explainer-style taxonomies (motion graphics, screencast, kinetic type, whiteboard, character, 3D, live action, mixed media) collapsed to scene-level compositional identities; hybrid MG+screencast noted as the dominant SaaS register |
| Narration modes | 6 modes | [PRAC/DATA] Observed shipping registers: classic VO; founder walkthrough; talking-head/UGC (LinkedIn-native, AI presenters); testimonial-led; music-driven text (Lovable/Ramp register); ambient demo. UGC/founder formats' rise documented across B2B creative guidance |

Numbers *not* in this table (energy-curve values, scene-count ceilings, the 40%-rig cap, 60%-cut share, group ceilings) are doctrine design decisions: internally consistent taste, validated against benchmark teardowns, and marked as such. They are defaults a Vault or reference may bias — the sourced values above are floors and physics, and may not be overridden by taste.

*End of doctrine.*
