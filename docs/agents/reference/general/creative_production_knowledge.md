---
name: Creative Production Knowledge — SUPERSEDED by v2
description: v1 is OUTDATED. v2 (37 pages, 12 sections) is authoritative. Read v2 at docs/creative-production-knowledge-v2.pdf or C:\Users\admin\AppData\Local\Temp\creative-doc-v2.txt
type: reference
superseded_by: docs/creative-production-knowledge-v2.pdf
originSessionId: 4d413f79-e253-433c-aec2-c835ed7c9b20
---
# Creative Production Knowledge — v1 SUPERSEDED by v2

**v2 location:** `D:\google downloads\Front-End-main\Front-End-main\docs\creative-production-knowledge-v2.pdf`

**v2 key changes:** 12 sections by pipeline decision type, 20+ narrative structures (including Kishōtenketsu, Rasa theory), cultural variations in every section, cross-domain interaction tables, [TECHNICAL SPEC] tags, philosophy: "menus not rules — LLM selects by intent", AI artifact prevention §2.5, feedback loop §11.5, 13 foundational texts.

**v1 content below preserved for reference only.**

---

# v1 Content (DEPRECATED)

**Rule: Consult v2 before making ANY decision about prompts, editing, transitions, SFX, pacing, composition, or video quality.**

---

## 1. FILM EDITING — Foundational Theory

### Walter Murch's Rule of Six (Priority Order)
The six criteria for every cut, in order of importance:

| Priority | Criterion | Weight | What It Means |
|----------|-----------|--------|---------------|
| 1 | **Emotion** | 51% | Does the cut feel RIGHT emotionally? This trumps everything. |
| 2 | **Story** | 23% | Does it advance the narrative? |
| 3 | **Rhythm** | 10% | Is the timing musically right? |
| 4 | **Eye-trace** | 7% | Does the viewer's eye land naturally on the next shot? |
| 5 | **Planarity** | 5% | Does 2D screen space read correctly? |
| 6 | **Spatial continuity** | 4% | Does 3D space make sense? |

**Key insight:** "What they finally remember is not the editing, not the camerawork, not the performances, not even the story — it's how they felt." Sacrifice from the bottom up, never sacrifice emotion.

### Eisenstein's Five Methods of Montage

| Type | How It Works | Use Case |
|------|-------------|----------|
| **Metric** | Cuts at fixed intervals regardless of content | Building tension (Scene 4 rapid montage) |
| **Rhythmic** | Cuts based on visual rhythm of content | Music-driven editing (beat-sync) |
| **Tonal** | Cuts based on emotional tone of shots | Mood transitions (nostalgia → energy) |
| **Overtonal** | Combination of metric + rhythmic + tonal | Complex emotional sequences |
| **Intellectual** | Juxtaposition creates meaning neither shot has alone | Brand messaging ("always there" + golden arches) |

### Dancyger's Editing Principles
- **Pace by content type:** Dialogue = slow cuts. Action = fast cuts. Emotional = hold the shot.
- **The invisible cut:** The best edit is one the viewer doesn't notice.
- **Energy transfer:** Each cut transfers energy — match energy levels or use contrast deliberately.

---

## 2. CINEMATOGRAPHY — Composition & Framing

### Core Composition Rules (for storyboard + video prompts)

| Rule | What It Means | Prompt Language |
|------|--------------|-----------------|
| **Rule of Thirds** | Subject at grid intersections, not center | "subject positioned at left third intersection" |
| **Leading Lines** | Lines guide eye to subject | "road/table edge leading toward subject" |
| **Depth** | Foreground + middle + background layers | "shallow depth of field, bokeh background" |
| **Framing** | Use environment to frame subject | "framed through doorway/window/archway" |
| **Headroom** | Space above subject's head | "appropriate headroom, not cropped at forehead" |
| **Looking Room** | Space in direction subject faces | "subject facing right with negative space on right" |
| **Balance** | Visual weight distributed across frame | "balanced composition, no heavy tilt" |

### Shot Types (for video generation prompts)

| Shot | When to Use | Prompt Fragment |
|------|------------|-----------------|
| **Extreme Close-Up** | Emotion, detail, product | "extreme close-up of hands/eyes/product, filling frame" |
| **Close-Up** | Character emotion, reaction | "close-up from chin to forehead, soft focus background" |
| **Medium Close-Up** | Conversation, intimate | "medium close-up, chest to head, shallow DOF" |
| **Medium Shot** | Action in context | "medium shot, waist up, environment visible" |
| **Wide Shot** | Establishing, environment | "wide establishing shot, full environment visible" |
| **Over-the-Shoulder** | Dialogue, connection | "over-the-shoulder, focus on far subject" |

### Camera Movements (for video motion prompts)

| Movement | Emotional Effect | Prompt Fragment |
|----------|-----------------|-----------------|
| **Push-in** | Increasing tension/intimacy | "slow steady push-in toward subject" |
| **Pull-back** | Reveal, resolution, release | "gradual pull-back revealing environment" |
| **Pan** | Following action, scanning | "smooth horizontal pan left to right" |
| **Tilt** | Reveal height, power | "slow tilt up from ground to subject" |
| **Tracking** | Following movement | "tracking shot following subject walking" |
| **Crane/Jib** | Epic, establishing | "crane shot rising above scene" |
| **Handheld** | Energy, documentary feel | "subtle handheld movement, organic" |
| **Static** | Stability, observation | "locked-off tripod shot, no camera movement" |

---

## 3. SOUND DESIGN — Professional Audio Layers

### The Three-Layer Sound Model

Every scene should have AT MINIMUM:

| Layer | Purpose | Examples | Volume |
|-------|---------|----------|--------|
| **Ambient Bed** | Fills silence, creates place | Room tone, outdoor air, traffic hum, restaurant buzz | -20 to -30 dB |
| **Spot SFX** | Specific on-screen actions | Door close, cup clink, paper rustle, footstep | -12 to -18 dB |
| **Feature SFX** | Key story moments | Impact hit, whoosh, musical stinger, dramatic silence | -6 to -12 dB |

### Frequency Management
- **Low (20-200Hz):** Bass rumble, weight, power, tension
- **Mid (200-2kHz):** Dialogue, most musical instruments, warmth
- **High (2k-20kHz):** Sparkle, air, detail, crispness, sibilance
- Each layer should occupy its own frequency range to avoid masking.

### Sound Design Rules for AI Video
- **Never leave a scene silent** — even "quiet" scenes need room tone
- **SFX should match what's on screen** — if hands touch food, there should be a sound
- **Ambient beds should be continuous** — don't start/stop between cuts
- **Feature SFX on transitions** — whoosh on cut, shimmer on dissolve, impact on punch
- **Music and SFX don't compete** — duck SFX under music peaks, duck music under SFX hits

---

## 4. AI VIDEO GENERATION — Prompt Engineering

### The Problem
AI video models generate based on text prompts. Vague prompts = hallucinated details, morphing, artifacts. Detailed prompts = consistent, controllable output.

### Prompt Structure (in this order)
```
1. ENVIRONMENT + LIGHTING first
2. SUBJECT + their ACTION
3. CAMERA BEHAVIOR
4. MOOD + AESTHETIC
5. TECHNICAL QUALITY
6. NEGATIVE PROMPT (what to avoid)
```

### Avoiding Common Artifacts

| Artifact | Cause | Prevention (Prompt Language) |
|----------|-------|------------------------------|
| **Melted hands** | Model can't resolve 3D hand geometry | "hands NOT visible" OR "hands at sides, relaxed, not interacting with objects" |
| **Face morphing** | Identity drift between frames | "consistent facial features throughout, no morphing" + reference image |
| **Text hallucination** | Models can't render legible text | NEVER include text in video prompt. Add text as graphic overlay in post. |
| **Object phasing** | Physics not understood | "natural physics, objects have weight and don't pass through each other" |
| **Uncanny eating** | Complex mouth/food interaction | "subject smiling near food" NOT "subject eating/biting food" |
| **Temporal flicker** | Frame-to-frame inconsistency | "temporally consistent, no flickering, smooth motion" |
| **Background warp** | Unstable environment | "static background, locked environment, no background movement" |
| **Color shift** | Inconsistent lighting | "consistent lighting throughout, no exposure changes" |

### Negative Prompt Template
```
blur, out of focus, low quality, pixelated, distorted, deformed, bad anatomy,
extra limbs, extra fingers, missing fingers, fused fingers, melted hands,
text overlay, watermark, logo, subtitles, UI elements,
temporal flickering, color banding, jittery motion, strobing,
uncanny valley, plastic skin, dead eyes, face morphing, identity drift
```

### Model-Specific Prompting

| Model | Strengths | Weaknesses | Prompt Style |
|-------|-----------|------------|-------------|
| **Kling 2.1** | Cinematic quality, good faces | Slow, hands still bad | Cinematic language, lens types, 100-150 words |
| **Seedance 1.5** | Native audio, good motion | Newer, less tested | Describe visual AND audio elements, 100-150 words |
| **Veo 3.1** | Complex motion, 4K | Expensive | Ambitious camera paths OK, 100-150 words |
| **Wan 2.2** | Natural motion, fast | Lower quality | Organic movement description, 80-120 words |

---

## 5. STORYTELLING & PACING

### Three-Act Structure (Applied to 30-60s Ads)

| Act | Duration | Purpose | Pacing |
|-----|----------|---------|--------|
| **Hook** | 0-3s | Grab attention | Fast cut or striking image |
| **Build** | 3-25s | Develop story/emotion | Medium pacing, building |
| **Resolve** | 25-42s | Payoff + CTA | Slow to medium, satisfying |

### Pacing by Content Type

| Content | Cuts/Minute | Shot Duration | Feel |
|---------|-------------|---------------|------|
| **Brand ad (nostalgia)** | 6-10 | 3-6s | Slow, emotional |
| **Product ad (energy)** | 12-20 | 1-3s | Fast, dynamic |
| **Tutorial** | 4-8 | 5-10s | Measured, clear |
| **UGC/Social** | 15-25 | 0.5-2s | Rapid, attention-grabbing |
| **Documentary** | 5-8 | 4-8s | Observational |

### Emotional Arc
Every video should have an emotional trajectory:
- **Tension curve:** Low → build → peak → resolve
- **Energy curve:** Match to music (if beat-synced)
- **Color temperature:** Can shift with emotion (warm = safe, cool = tension)

---

## 6. VFX & POST-PRODUCTION

### Color Grading Psychology

| Color Temperature | Emotion | Use Case |
|-------------------|---------|----------|
| **Warm (golden/orange)** | Nostalgia, comfort, happiness | Brand ads, memory scenes |
| **Cool (blue/teal)** | Professional, modern, tension | Tech, corporate |
| **Desaturated** | Serious, documentary, vintage | Dramatic content |
| **High contrast** | Energy, power, drama | Action, music videos |
| **Low contrast** | Soft, dreamy, intimate | Romance, beauty |

### Transition Psychology

| Transition | When to Use | When NOT to Use |
|-----------|------------|-----------------|
| **Hard cut** | Same energy, action continuity | Between vastly different moods |
| **Dissolve** | Time passing, mood shift, connection | Fast-paced sequences |
| **Fade to black** | End of chapter, dramatic pause | Mid-action |
| **Zoom punch** | Impact moment, beat drop | Calm/emotional scenes |
| **Wipe** | Playful, retro, stylistic | Serious content |
| **Flash** | Snapshot, memory | Overuse = amateur |

---

## 7. THE FEEDBACK LOOP — Self-Improving Pipeline

### How Editron Should Use This Knowledge

```
GENERATE VIDEO
    ↓
ANALYZE OUTPUT (Gemma 4 Vision)
    ↓
CRITIQUE against this knowledge document:
    - Are hands visible? (artifact risk)
    - Is text readable? (never should be AI-generated)
    - Does composition follow rule of thirds?
    - Is lighting consistent?
    - Are there temporal artifacts?
    - Does pacing match content type?
    - Are SFX layered (ambient + spot + feature)?
    - Do transitions match emotional arc?
    ↓
GENERATE IMPROVEMENT PROMPTS
    - "Hands were melted → add 'hands not visible' to negative prompt"
    - "Text hallucinated → remove text from video prompt, add as graphic overlay"
    - "Face morphed → add reference image, add 'consistent features' to prompt"
    ↓
REGENERATE with improved prompts
    ↓
COMPARE before/after
    ↓
STORE successful prompt patterns in knowledge graph
```

### What the Critique Should Check (per scene)

| Check | Pass Criteria | Fail Action |
|-------|--------------|-------------|
| **Anatomical correctness** | No melted/extra fingers, no face drift | Add negative prompt, reframe shot |
| **Text legibility** | No AI-generated text visible | Move text to graphic overlay |
| **Temporal consistency** | No flickering, morphing, or jumping | Add "temporally consistent" to prompt |
| **Composition** | Follows rule of thirds, proper headroom | Add composition tokens to prompt |
| **Lighting consistency** | No exposure shifts within shot | Add "consistent lighting" to prompt |
| **Motion naturalness** | Physics look real, no floating | Add "natural physics, weight" to prompt |
| **Audio sync** | SFX matches on-screen action | Regenerate SFX with video context |
| **Emotional alignment** | Shot mood matches script intent | Adjust color/speed/framing |

---

## 8. SOURCES

- [Walter Murch's Rule of Six](https://www.studiobinder.com/blog/walter-murch-rule-of-six/)
- [Eisenstein Montage Theory](https://media-studies.com/eisenstein-montage/)
- [Rules of Shot Composition](https://www.studiobinder.com/blog/rules-of-shot-composition-in-film/)
- [Sound Layering for Richer Audio](https://blog.prosoundeffects.com/sound-layering)
- [AI Video Prompt Engineering Guide 2026](https://bonega.ai/en/blog/ai-video-prompt-engineering-guide-2025)
- [How to Fix Distorted Faces in AI Video](https://hailuoai.video/pages/blog/fix-distorted-faces-ai-video)
- [No Film School: 7 Rules of Cinematic Framing](https://nofilmschool.com/rules-of-cinematic-framing-and-composition)
- [Pro Sound Effects: Immersive Backgrounds](https://blog.prosoundeffects.com/how-to-sound-design-immersive-backgrounds-video)
- [AI Video Generation: What Works & Doesn't 2026](https://is4.ai/blog/our-blog-1/ai-video-generation-2026-what-works-what-doesnt-340)

---

## 9. TYPOGRAPHY & CAPTION DESIGN

### Font Pairing Rules

| Pairing Strategy | How It Works | Example |
|-----------------|-------------|---------|
| **Serif heading + Sans-serif body** | Classic contrast, almost impossible to get wrong | Playfair Display + Open Sans |
| **Weight contrast** | Bold header + Light/Regular body creates hierarchy | Montserrat Bold + Montserrat Light |
| **Superfamily** | Same type family, different classifications — built-in harmony | Roboto + Roboto Slab |
| **X-height matching** | Pair fonts with similar x-heights for visual consistency | Fonts with matching lowercase letter heights |
| **Mood contrast** | Geometric sans + Humanist serif for modern/warm blend | Futura + Georgia |

**Rules:**
- Maximum 2-3 font families per video (headline, body, optional caption/UI)
- Never pair two fonts that are *almost* identical — they clash like mismatched plaids
- Create contrast through style (serif vs sans), weight (bold vs light), OR size — not all three at once
- Script/decorative fonts: headlines ONLY, never body text, never captions

### Font Psychology

| Category | Personality | Use Case |
|----------|-----------|----------|
| **Sans-serif** (Helvetica, Inter, Roboto) | Modern, clean, trustworthy, neutral | Tech, SaaS, corporate, most B2B |
| **Serif** (Georgia, Playfair, Garamond) | Traditional, authoritative, established, trustworthy | Finance, law, luxury, editorial |
| **Slab serif** (Rockwell, Roboto Slab) | Strong, bold, confident, grounded | Headlines, CTAs, impact moments |
| **Script/Handwritten** (Pacifico, Dancing Script) | Creative, personal, feminine, casual | Lifestyle, beauty, personal brands |
| **Monospace** (Fira Code, JetBrains Mono) | Technical, precise, code-like | Developer tools, technical content |
| **Geometric sans** (Futura, Poppins) | Minimal, forward-thinking, premium | Design, architecture, fashion |

### Caption Readability Standards

| Parameter | Standard | Source |
|-----------|----------|--------|
| **Max lines** | 2 lines per subtitle | BBC/Netflix broadcast standard |
| **Max characters per line** | 37-42 characters (including spaces) | BBC Subtitling Guidelines |
| **Reading speed (adult)** | 160-180 WPM (words per minute) | BBC standard |
| **Reading speed (children)** | 120-130 WPM | DCMP Guidelines |
| **Reading speed (max)** | 250 WPM absolute maximum | Capital Captions |
| **Minimum display time** | 1 second (even for short text) | Broadcast standard |
| **Maximum display time** | 7 seconds | Netflix specification |
| **Comfortable display** | 3 seconds per 63 characters | Industry average |
| **Title-safe zone** | 80% of frame (10% margin each side) | Broadcast standard |
| **Action-safe zone** | 90% of frame (5% margin each side) | Broadcast standard |
| **Minimum font size** | 1/15th of frame height for HD (72px at 1080p) | Readability guideline |

### Caption Timing Rules (for programmatic implementation)

```
APPEAR:  0.25-0.5s BEFORE speech starts (give eye time to find text)
DISAPPEAR: 0.25-0.5s AFTER speech ends (give brain time to finish reading)
MIN DISPLAY: 1.0s minimum (even for single words)
MAX DISPLAY: 7.0s maximum (re-segment if longer)
GAP BETWEEN: minimum 0.08s gap between consecutive subtitles (2 frames at 24fps)
SCENE CHANGE: never span a hard cut — break subtitle at the cut point
```

### Kinetic Typography (Hormozi/High-Retention Style)

| Technique | Implementation | Purpose |
|-----------|---------------|---------|
| **Word-by-word reveal** | Each word appears synced to speech timestamp | Forces reading, boosts retention |
| **Emphasis scaling** | Key word scales to 120-150% of base size | Draws attention to important term |
| **Color pop** | Key word in brand/accent color, rest white | Visual hierarchy within sentence |
| **Position shift** | Text block moves slightly on emphasis | Pattern interrupt, prevents eye fatigue |
| **Typewriter effect** | Characters appear left-to-right with cursor | Creates anticipation |
| **Bounce/pop entrance** | Word enters with overshoot + settle (ease-out-back) | Energetic, youthful feel |

**Hormozi Style Specifics:**
- Clean sans-serif fonts (SF Pro, Roboto, Inter) — never Impact or Comic Sans
- White text on dark backgrounds with subtle drop shadow (2px, 50% opacity black)
- Keywords highlighted in brand color (typically yellow, green, or blue)
- Aggressive jump cuts — remove ALL dead air, pauses, and filler words
- 85% of social media watched on mute — captions are not optional, they ARE the content

### Accessibility — Text Contrast

| Standard | Normal Text (<18pt) | Large Text (>18pt or >14pt bold) |
|----------|---------------------|----------------------------------|
| **WCAG AA** (minimum) | 4.5:1 contrast ratio | 3:1 contrast ratio |
| **WCAG AAA** (enhanced) | 7:1 contrast ratio | 4.5:1 contrast ratio |
| **UI components** | 3:1 contrast ratio | 3:1 contrast ratio |

**Caption background methods (ranked by readability):**
1. **Semi-transparent box** (black at 60-80% opacity) — highest readability, broadcast standard
2. **Text outline/stroke** (2-3px black outline) — good readability, less obtrusive
3. **Drop shadow** (3-5px, 80% black) — moderate readability, cleanest look
4. **Full opaque box** (solid black bar) — maximum readability, most obtrusive (YouTube CC default)

---

## 10. MOTION GRAPHICS & ANIMATION PRINCIPLES

### Disney's 12 Principles Applied to Motion Graphics / UI

| # | Principle | Motion Graphics Application | Timing |
|---|-----------|---------------------------|--------|
| 1 | **Squash & Stretch** | Button press states, bouncing elements, text emphasis | Stretch on move, squash on impact |
| 2 | **Anticipation** | Element pulls back before entering, hover states before click | 0.1-0.15s before main action |
| 3 | **Staging** | Direct viewer attention to ONE focal point per moment | One animated element at a time |
| 4 | **Straight Ahead / Pose to Pose** | Straight ahead for organic (particles), pose-to-pose for UI (keyframed) | Depends on content |
| 5 | **Follow-through & Overlapping** | Overshoot on stops (modal bounces past target then settles), staggered element arrivals | 0.05-0.1s overshoot, 0.1s settle |
| 6 | **Ease In / Ease Out** | NEVER use linear movement — always ease (CSS: cubic-bezier) | ease-out for entrances, ease-in for exits |
| 7 | **Arcs** | Elements move in natural curves, not straight lines | Curved paths for natural feel |
| 8 | **Secondary Action** | Subtle supporting animations (shadow shifts when card moves, ripple on click) | Smaller amplitude than primary |
| 9 | **Timing** | Fast = light/small, Slow = heavy/large/important | 0.15-0.3s for UI, 0.3-0.6s for emphasis |
| 10 | **Exaggeration** | Make intent unmistakable — if something grows, grow it MORE than real life | 110-130% of realistic scale |
| 11 | **Solid Drawing** | Maintain consistent visual weight and proportion in 2D elements | No accidental distortion |
| 12 | **Appeal** | Clean, readable, aesthetically pleasing design | Simplicity over complexity |

### Entry/Exit Animation Patterns

| Pattern | Motion Description | Best For | Duration |
|---------|-------------------|----------|----------|
| **Fade up** | Opacity 0→1, translateY 20px→0 | Professional, subtle | 0.3-0.5s |
| **Scale pop** | Scale 0→1.1→1.0 (overshoot) | Energetic, attention-grabbing | 0.2-0.4s |
| **Slide in** | translateX -100%→0 (from left) or 100%→0 (from right) | Directional, sequential | 0.3-0.5s |
| **Typewriter** | Characters appear sequentially left to right | Text reveals, terminal aesthetic | 30-50ms per character |
| **Blur in** | blur(10px)→blur(0), opacity 0→1 | Dreamy, cinematic | 0.4-0.6s |
| **Drop in** | translateY -50px→5px→0 (gravity + bounce) | Playful, dynamic | 0.4-0.6s |
| **Wipe** | clip-path reveals content directionally | Cinematic, editorial | 0.3-0.6s |
| **None (cut)** | Instant appear | Fast-paced, jump-cut style | 0s (1 frame) |

**Exit = reverse of entry, but 20% faster** (exits should feel snappy, not lingering).

### Hormozi / High-Retention Motion Style

| Element | Specification | Purpose |
|---------|--------------|---------|
| **Kinetic captions** | Word-by-word, synced to speech timestamps (within 50ms) | Silent viewing optimization |
| **White-line icons** | Minimalist stroke icons, 2-3px weight, pop into frame | Visual variety without clutter |
| **Stat counters** | Number counts from 0 to target over 0.5-1.0s | Makes data feel dynamic and earned |
| **Digital zoom** | 1.0x→1.3x over 0.3s on emphasis moments | Pattern interrupt, draws focus |
| **Dark mode aesthetic** | Dark gray/black background (#0D0D0D to #1A1A1A) | Reduces eye strain, modern feel |
| **Limited palette** | White + 1 accent color (max 2) per video | Clean, brand-consistent |
| **B-roll cutaways** | 1-3s stock/screen footage between talking head | Visual variety every 5-8s |

### Duration Rules for Motion Elements

| Element Type | Entrance | Hold | Exit | Total |
|-------------|----------|------|------|-------|
| **Icon/emoji pop** | 0.2-0.3s | 1.5-3.0s | 0.15-0.2s | 1.85-3.5s |
| **Stat counter** | 0.5-1.0s (counting) | 1.5-2.5s | 0.2-0.3s | 2.2-3.8s |
| **Lower third** | 0.3-0.5s | 3.0-5.0s | 0.2-0.4s | 3.5-5.9s |
| **Full-screen title** | 0.3-0.5s | 1.5-3.0s | 0.3-0.5s | 2.1-4.0s |
| **Caption word** | 0.05-0.1s | speech duration | 0.05-0.1s | varies |
| **Transition graphic** | 0.2-0.4s | 0s | 0.2-0.4s | 0.4-0.8s |

---

## 11. MUSIC THEORY FOR VIDEO

### Tempo-to-Mood Mapping

| BPM Range | Mood/Energy | Content Types | Musical Genre Examples |
|-----------|------------|---------------|----------------------|
| **40-60** | Meditative, ambient, somber | Memorials, meditation, slow intro | Ambient, drone, classical adagio |
| **60-80** | Calm, emotional, reflective, nostalgic | Brand story, testimonial, documentary | Ballads, lo-fi, acoustic |
| **80-100** | Moderate, warm, conversational | Corporate, tutorial, explainer | Pop ballad, R&B, soft rock |
| **100-120** | Upbeat, positive, motivational | Product launch, team culture, SaaS demo | Pop, indie, funk |
| **120-140** | Energetic, driving, exciting | Hype reel, event promo, fitness | EDM, dance pop, house |
| **140-160** | High energy, intense, aggressive | Action, gaming, sports, fast montage | Drum & bass, dubstep, punk |
| **160+** | Extreme, chaotic, frantic | Extreme sports, comedic fast-forward | Hardcore, speedcore |

### Key and Mode

| Mode | Character | Use Case |
|------|-----------|----------|
| **Major (Ionian)** | Happy, uplifting, triumphant, resolved | Success stories, product celebrations, CTAs |
| **Minor (Aeolian)** | Sad, dramatic, serious, contemplative | Problem statements, emotional narratives |
| **Dorian** | Sophisticated, jazzy, bittersweet | Premium brands, creative content |
| **Mixolydian** | Bluesy, warm, slightly unresolved | Lifestyle, food, travel |
| **Lydian** | Dreamy, ethereal, wonder | Innovation, futuristic, technology |
| **Pentatonic Major** | Simple, universal, folk | Approachable brands, heartfelt content |
| **Pentatonic Minor** | Moody, universal, powerful | Trailer, action, intensity |

### Song Structure for Video Ads

```
INTRO (2-4 bars):    Sparse instrumentation. Sets mood. Matches hook/opening shot.
BUILD (4-8 bars):    Layers add. Tension increases. Matches problem/story development.
PEAK/DROP (2-4 bars): Full instrumentation or silence→impact. Matches emotional climax/CTA.
RESOLVE (2-4 bars):  Energy settles. Resolution. Matches logo/tagline/end card.
```

**Sync Points:**
- Cuts on downbeats (beat 1 of a measure)
- Transitions on phrase boundaries (every 4 or 8 bars)
- Emotional climax aligned with musical peak/drop
- CTA appears on final chord or post-drop resolution

### Music Ducking Parameters (for programmatic mixing)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Duck amount** | -6 to -12 dB (relative to music level) | -6 for subtle, -12 for aggressive |
| **Attack/ramp down** | 200-400ms | How fast music ducks when speech starts |
| **Release/ramp up** | 400-800ms | How fast music returns after speech ends |
| **Look-ahead** | 100-200ms | Start ducking BEFORE speech onset |
| **Threshold** | Set to speech presence detection | Triggers on voiceover signal |
| **Ratio** | 3:1 to 6:1 | Controls compression curve of ducking |
| **Music level under speech** | -18 to -24 dB | Target level while VO is active |
| **Music level solo** | -12 to -6 dB | Level when no speech present |

### Tension/Release Cycle

- **Tension builds engagement** — viewer leans in, anticipates resolution
- **Release provides satisfaction** — payoff, relief, emotional reward
- **Cycle every 15-30 seconds** in short-form content
- **Cycle every 60-120 seconds** in long-form content
- Musical tools for tension: rising pitch, increasing tempo, adding layers, dissonance, drum builds
- Musical tools for release: drop/silence, resolving chord, tempo settling, removing layers

---

## 12. BRAND GUIDELINES INTEGRATION

### Color Consistency Rules

| Rule | Implementation | Why It Matters |
|------|---------------|----------------|
| **Brand color temperature** | Apply consistent color grade across ALL scenes | Mismatched grades feel like different videos spliced together |
| **Primary color usage** | Brand primary in CTAs, headlines, accent elements | Reinforces brand recognition |
| **Secondary color usage** | Supporting elements, backgrounds, dividers | Creates depth without competing |
| **Neutral base** | White/dark backgrounds for contrast | Lets brand colors pop |
| **Color ratio** | 60% neutral / 30% primary / 10% accent | Prevents visual overload |

### Logo Usage Rules

| Rule | Specification |
|------|--------------|
| **Clear space** | Minimum padding = height of logo's tallest letter on all sides |
| **Minimum size** | Never smaller than 48px wide on screen |
| **Never AI-generate** | Always use original vector/PNG asset — AI distorts proportions |
| **Never distort** | Maintain original aspect ratio — no stretching, squishing, rotating |
| **Placement** | Lower-right or center for end cards; lower-left or upper-left for watermarks |
| **Animation** | Simple fade-in or scale-up; never spin, bounce, or morph |
| **Duration** | Logo visible for minimum 2s at end, 3-5s preferred |
| **Background contrast** | Ensure logo meets 3:1 contrast ratio against its background |

### Typography Consistency

- **Maximum 2 font families per video** (headline + body/caption)
- **Consistent weight hierarchy:** Bold for headlines, Regular for body, Medium for labels
- **Consistent size hierarchy:** Define 3-4 sizes and reuse (e.g., 72px title, 48px subtitle, 36px body, 24px label)
- **Never change fonts mid-video** unless intentional style shift (flashback, quote, different speaker)

### Template Systems (Reusable per Brand)

| Template | Contains | Reuse Frequency |
|----------|---------|-----------------|
| **Intro bumper** | Logo animation, brand colors, sound logo | Every video |
| **Lower third** | Name/title bar with brand fonts and colors | Every speaker appearance |
| **End card** | CTA, logo, subscribe/follow, website URL | Every video |
| **Transition** | Branded wipe/dissolve matching brand style | Between major sections |
| **Chapter card** | Section divider with number/title | Long-form content |

---

## 13. PLATFORM-SPECIFIC REQUIREMENTS

### Comprehensive Platform Specs (2026)

| Platform | Aspect Ratio | Resolution | Max Duration | Optimal Duration | File Size Max | Codec |
|----------|-------------|------------|-------------|-----------------|---------------|-------|
| **YouTube (standard)** | 16:9 | 1920x1080 (4K preferred) | 12 hours | 8-15 min | 256 GB | H.264, VP9, AV1 |
| **YouTube Shorts** | 9:16 | 1080x1920 | 3 min | 30-60s | 256 GB | H.264 |
| **Instagram Reels** | 9:16 | 1080x1920 | 90s | 15-30s | 4 GB | H.264 |
| **Instagram Stories** | 9:16 | 1080x1920 | 60s per segment | 15s | 4 GB | H.264 |
| **Instagram Feed** | 1:1, 4:5, 16:9 | 1080x1080+ | 60 min | 30-90s | 4 GB | H.264 |
| **TikTok** | 9:16 | 1080x1920 | 10 min | 15-60s | 500 MB (web) | H.264 |
| **LinkedIn** | 16:9, 1:1, 9:16 | 1920x1080 | 10 min | 30s-3 min | 5 GB | H.264 |
| **Twitter/X** | 16:9, 1:1 | 1920x1080 | 2:20 | 15-45s | 512 MB | H.264 |
| **Facebook Feed** | 1:1, 4:5, 16:9 | 1080x1080+ | 240 min | 1-3 min | 10 GB | H.264 |
| **Facebook Reels** | 9:16 | 1080x1920 | 90s | 15-30s | 4 GB | H.264 |

### Platform-Specific Best Practices

| Platform | Critical Rules |
|----------|---------------|
| **YouTube** | First 30s determines retention; chapters supported via timestamps; thumbnail is #1 click factor; algorithm favors watch time over views |
| **Instagram Reels** | Hook in first 1.0s; text must be within center 80% (UI overlays crop edges); trending audio boosts reach; cover frame matters for profile grid |
| **TikTok** | Hook in first 0.5-1.0s; trending sounds increase distribution; duet/stitch compatibility matters; raw/authentic outperforms polished |
| **LinkedIn** | 80% watch muted — captions are MANDATORY; professional tone; educational/thought-leadership performs best; native video preferred over links |
| **Twitter/X** | Auto-plays muted in feed; first frame IS the thumbnail; concise messaging; quote-tweet friendly content performs well |
| **Facebook** | Captions essential (85% muted viewing); 1:1 or 4:5 gets more feed real estate than 16:9; live video gets 6x more engagement |

### Safe Zone Map (9:16 vertical video)

```
+---------------------------+
|  ← 10% UNSAFE (top) →    |  Platform UI: time, battery, signal
|                           |
|  +---------------------+  |
|  |                     |  |
|  |   SAFE ZONE (80%)   |  |  All critical text/graphics HERE
|  |   Center of frame   |  |
|  |                     |  |
|  +---------------------+  |
|                           |
|  ← 20% UNSAFE (bottom) → |  Platform UI: comments, like, share, follow
+---------------------------+
```

**Bottom 20% on TikTok/Reels is covered by:** caption area, username, description, sound name, action buttons.
**Top 10%** is covered by: status bar, close button, search.

---

## 14. COLOR SCIENCE (Beyond Psychology)

### Color Wheel Relationships

| Harmony | Definition | Visual Effect | Video Use Case |
|---------|-----------|---------------|---------------|
| **Complementary** | 2 opposite colors (e.g., blue + orange) | High contrast, vibrant, bold | Action scenes, dramatic moments, teal-orange grading |
| **Analogous** | 3 adjacent colors (e.g., blue + teal + green) | Harmonious, cohesive, calm | Nature scenes, consistent mood pieces |
| **Triadic** | 3 evenly spaced (e.g., red + yellow + blue) | Vibrant, balanced energy | Playful brands, children's content |
| **Split-complementary** | 1 color + 2 adjacent to its complement | Balanced contrast, less harsh | Versatile — contrast without jarring tension |
| **Monochromatic** | Single hue, varying saturation/lightness | Elegant, unified, sophisticated | Luxury brands, minimalist design |
| **Tetradic** | 4 colors forming rectangle on wheel | Rich, complex palette | Use sparingly — easy to overdo |

### Color Spaces for Video

| Color Space | Gamut Size | Use Case | Notes |
|-------------|-----------|----------|-------|
| **sRGB** | Smallest | Web, computer displays | Standard for online content |
| **Rec.709** | = sRGB primaries | Broadcast HD, SDR television | Same primaries as sRGB, different gamma curve |
| **DCI-P3** | 25% wider than sRGB | Digital cinema, modern displays | Apple displays, Netflix mastering |
| **Rec.2020** | Widest standard | HDR television, 4K+ broadcast | Future-proof, most modern HDR displays |
| **Log** (S-Log, V-Log, C-Log) | Maximum dynamic range | Camera capture, before grading | Flat/gray — MUST apply LUT or grade before delivery |

### LUT Types

| LUT Type | Purpose | When to Apply |
|----------|---------|---------------|
| **Technical/Conversion** | Log-to-Rec.709, camera-specific normalization | First in grading chain — converts flat footage to viewable |
| **Creative/Look** | Stylistic grade (teal-orange, vintage, film stock) | After technical LUT — applies aesthetic |
| **Display** | Adapts output for specific monitor/projector | End of chain — hardware calibration |

**Rule:** Never stack creative LUTs. Apply ONE creative look and fine-tune with manual adjustments.

### Skin Tone Protection

- **Vectorscope skin tone line:** All healthy skin tones (regardless of ethnicity) fall along a narrow line on the vectorscope between red and yellow (approximately 123 degrees, the "I-line")
- **When grading:** Check vectorscope — if skin tones deviate from this line, the grade is unnatural
- **Priority:** Skin tones should look correct even if the rest of the grade is stylized
- **Never auto-grade skin:** AI color grading should mask skin regions and preserve natural tones

### White Balance Reference

| Color Temperature | Light Source | Mood |
|-------------------|------------|------|
| **2700K** | Candlelight, warm tungsten | Intimate, warm, romantic |
| **3200K** | Standard tungsten / halogen | Indoor warm, traditional |
| **4000K** | Fluorescent / early morning | Neutral-warm, natural |
| **5000K** | Direct midday sun | Neutral, baseline |
| **5600K** | Daylight balanced (standard) | Clean, natural, standard reference |
| **6500K** | Overcast / shade | Slightly cool, soft |
| **7500K+** | Deep shade / blue sky | Cool, melancholic, cinematic |

---

## 15. AUDIO MASTERING FOR VIDEO

### Platform Loudness Targets

| Platform / Standard | Target LUFS | True Peak Max | Notes |
|--------------------|-------------|---------------|-------|
| **YouTube** | -14 LUFS | -1.0 dBTP | Normalizes both up and down |
| **Spotify** | -14 LUFS (Normal mode) | -1.0 dBTP | Also supports -11 (Loud) and -19 (Quiet) |
| **Apple Music** | -16 LUFS | -1.0 dBTP | Sound Check feature |
| **Instagram / TikTok** | -14 LUFS | -1.0 dBTP | Matches YouTube standard |
| **Facebook** | -14 LUFS | -1.0 dBTP | Mobile-first normalization |
| **Podcast** | -16 to -18 LUFS | -1.0 dBTP | More conservative for spoken word |
| **Broadcast TV (EBU R128)** | -23 LUFS | -1.0 dBTP | European broadcast standard |
| **Broadcast TV (ATSC A/85)** | -24 LUFS | -2.0 dBTP | North American broadcast standard |
| **Cinema (theatrical)** | -24 to -27 LUFS | -1.0 dBTP | Calibrated room reference |

**Universal safe target: -14 LUFS with -1.0 dBTP true peak covers YouTube, Spotify, Instagram, TikTok, and Facebook.**

### Dynamic Range by Content Type

| Content | Recommended Range | Reason |
|---------|-------------------|--------|
| **Dialogue/VO** | 6-10 dB | Must be consistently intelligible |
| **Music bed** | 8-14 dB | Needs dynamic feel but shouldn't overwhelm |
| **Sound effects** | 10-20 dB | Can be wider — impacts are supposed to hit hard |
| **Ambient bed** | 3-6 dB | Should be consistent, unobtrusive |
| **Full mix** | 8-14 dB (short form), 12-18 dB (long form) | Short form needs more compression for mobile |

### Mix Hierarchy (Volume Levels)

| Element | Level Range | Priority |
|---------|------------|----------|
| **Dialogue / Voiceover** | -12 to -6 dB | HIGHEST — always intelligible |
| **Sound effects (spot)** | -15 to -9 dB | Second — action feedback |
| **Music bed (solo, no VO)** | -12 to -6 dB | Fills space when no speech |
| **Music bed (under VO)** | -24 to -18 dB | Ducked — never compete with speech |
| **Ambient bed** | -30 to -20 dB | Lowest — felt, not heard consciously |

### Audio QC Rules

- **True peak:** NEVER exceed -1.0 dBTP — lossy codecs (AAC, MP3) add intersample peaks that cause clipping
- **Check on 3+ devices:** Studio monitors, laptop speakers, phone speakers, earbuds — mix must translate
- **Mono compatibility:** Collapse to mono and verify no phase cancellation kills the dialogue
- **Sample rate:** 48 kHz for all video (not 44.1 kHz, which is audio-only/CD standard)
- **Bit depth:** 24-bit for production, 16-bit acceptable for final delivery

---

## 16. VOICE DIRECTION FOR TTS

### Pacing Guidelines

| Content Type | Target WPM | Character |
|-------------|-----------|-----------|
| **Dramatic / emotional** | 100-120 WPM | Slow, deliberate, space for impact |
| **Narration / documentary** | 130-150 WPM | Measured, authoritative, clear |
| **Conversational / explainer** | 140-160 WPM | Natural, approachable, engaging |
| **Energetic / promotional** | 160-180 WPM | Fast, excited, forward momentum |
| **Rapid-fire / social media** | 180-200 WPM | Aggressive pace, Hormozi style |

### Punctuation-to-Pause Mapping (TTS Control)

| Punctuation | Pause Duration | Use Case |
|-------------|---------------|----------|
| **Comma (,)** | 0.2-0.3s | Clause separation, breath point |
| **Period (.)** | 0.4-0.6s | Sentence end, thought completion |
| **Em-dash (—)** | 0.3-0.5s | Dramatic pause, interjection |
| **Ellipsis (...)** | 0.5-0.8s | Trailing off, suspense, hesitation |
| **Question mark (?)** | 0.4-0.6s | Rising intonation + pause |
| **Exclamation (!)** | 0.3-0.5s | Emphasis + slightly shorter pause |
| **Paragraph break** | 0.8-1.2s | Topic shift, major pause |
| **Colon (:)** | 0.3-0.4s | Introduction of list or explanation |

### Tone Matching Guidelines

| Video Mood | Voice Direction | TTS Adjustments |
|-----------|----------------|-----------------|
| **Nostalgia / warmth** | Warm, soft, slightly slower | Lower pitch, slower rate, gentle inflection |
| **Corporate / authority** | Clear, confident, measured | Neutral pitch, moderate rate, minimal inflection |
| **Product launch / excitement** | Energetic, bright, upbeat | Slightly higher pitch, faster rate, dynamic inflection |
| **Tutorial / education** | Patient, clear, friendly | Moderate pitch, slower rate, emphasis on key terms |
| **Dramatic / cinematic** | Deep, deliberate, weighted | Lower pitch, slowest rate, long pauses between phrases |
| **Urgent / CTA** | Direct, commanding, fast | Slightly higher pitch, compressed pauses |

### Natural Speech Patterns (for realistic TTS)

- **Between sentences:** 0.3-0.5s pause (simulate breath)
- **Between phrases/clauses:** 0.1-0.2s pause
- **Key word emphasis:** Slightly louder (+1-2 dB) AND slightly slower (stretch to 110-120% duration)
- **List items:** Equal timing between items, slight pause before final item ("and...")
- **Paragraph transitions:** 0.8-1.2s pause signals topic change

---

## 17. ACCESSIBILITY

### WCAG 2.1 Compliance for Video

| Requirement | Standard | Specification |
|------------|----------|---------------|
| **Text contrast (normal)** | AA: 4.5:1, AAA: 7:1 | Against immediate background |
| **Text contrast (large >18pt)** | AA: 3:1, AAA: 4.5:1 | 18pt regular or 14pt bold |
| **UI component contrast** | 3:1 minimum | Buttons, icons, form fields |
| **Flashing content** | Max 3 flashes/second | Applies to ANY area >25% of screen |
| **Red flashing** | Stricter threshold | Saturated red flashing is higher seizure risk |
| **Motion animation** | Provide reduced-motion option | `prefers-reduced-motion` CSS media query |
| **Captions** | Required for all pre-recorded video | Closed captions OR burned-in for social |
| **Audio descriptions** | Required for meaningful visual content | Describe visuals during natural pauses |
| **Transcript** | Recommended for all video | Full text alternative |

### Caption Standards

| Rule | Value | Reason |
|------|-------|--------|
| **Always include captions** | 100% of videos | Legal requirement in many jurisdictions; 80%+ watch muted on social |
| **Closed captions (CC)** | Preferred for web/YouTube | User-toggleable, searchable, translatable |
| **Burned-in (open) captions** | Required for social media | Platform players don't always support CC |
| **Accuracy** | 99%+ transcription accuracy | Auto-generated must be reviewed and corrected |
| **Speaker identification** | Required for multi-speaker | "[Speaker Name]:" or different positioning |
| **Sound descriptions** | Include non-speech audio | "[music playing]", "[door slams]", "[laughter]" |

### Photosensitive Seizure Prevention

| Rule | Threshold | Implementation |
|------|-----------|----------------|
| **Max flash rate** | 3 flashes per second | Count all luminance transitions >20 cd/m2 |
| **Flash area** | Must cover <25% of screen area | Or <0.006 steradians at typical viewing distance |
| **Luminance change** | <10% relative luminance swing | Between darker and lighter states |
| **Red flash** | Additional restriction | Saturated red transitions have lower threshold |
| **Strobe effects** | Avoid entirely | Even sub-threshold strobing causes discomfort |

**Tools:** Use PEAT (Photosensitive Epilepsy Analysis Tool) to validate video content before publishing.

### Color Blindness Considerations

| Type | Affected Colors | Prevalence | Design Solution |
|------|----------------|-----------|-----------------|
| **Deuteranopia** (green-blind) | Red-green confusion | 6% of males | Never use red vs green alone for meaning |
| **Protanopia** (red-blind) | Red appears dark/black | 2% of males | Add patterns, icons, or labels alongside color |
| **Tritanopia** (blue-yellow) | Blue-yellow confusion | 0.01% | Rare, but still don't rely on color alone |
| **Achromatopsia** (no color) | All colors | 0.003% | Ensure luminance contrast works in grayscale |

**Universal rule:** Never use color as the ONLY way to convey information. Always supplement with: text labels, icons/shapes, patterns/textures, position/size differences.

---

## 18. TECHNICAL QC CHECKLIST

### Resolution & Frame Rate

| Setting | Value | Use Case |
|---------|-------|----------|
| **1080p (1920x1080)** | Minimum acceptable | All platforms, standard delivery |
| **1440p (2560x1440)** | Better quality | YouTube (gets VP9 codec = better quality at same bitrate) |
| **4K (3840x2160)** | Preferred | YouTube, premium content, future-proofing |
| **24 fps** | Cinematic, film-like | Narrative, emotional, brand films |
| **25 fps** | PAL standard | European broadcast |
| **30 fps** | Standard video | General content, social media, corporate |
| **60 fps** | Smooth motion | Gaming, sports, high-motion content |

**Rule:** Never mix frame rates within a single video without proper conversion. 24fps footage in a 30fps timeline causes judder.

### Codec & Bitrate

| Codec | 1080p Bitrate | 4K Bitrate | Compatibility | Notes |
|-------|---------------|-----------|---------------|-------|
| **H.264 (AVC)** | 8-15 Mbps | 25-45 Mbps | 98%+ universal | Safe default — everything plays it |
| **H.265 (HEVC)** | 4-8 Mbps | 12-20 Mbps | 85%+ (growing) | 50% smaller files, same quality as H.264 |
| **VP9** | 4-8 Mbps | 12-20 Mbps | YouTube, Chrome, Android | YouTube re-encodes to VP9 for quality boost |
| **AV1** | 3-6 Mbps | 8-15 Mbps | Growing (YouTube, Netflix) | Best compression, slow encoding, future standard |

**Audio codec:** AAC, 128-256 kbps, stereo, 48 kHz sample rate. Always AAC for video (not MP3).

### Pre-Delivery QC Checklist

| Check | Pass Criteria | Fail = |
|-------|--------------|--------|
| **Resolution** | Minimum 1080p, matches target platform | Upscaled/blurry content |
| **Frame rate** | Consistent throughout, matches project settings | Judder, dropped frames |
| **Aspect ratio** | Correct for platform, no accidental letterboxing/pillarboxing | Black bars, cropped content |
| **Black frames** | No unintended black frames >1 frame duration | Jump/flash between scenes |
| **Audio sync** | Lip sync within 40ms tolerance | Visible desync, uncanny feeling |
| **Loudness** | Within 1 LUFS of platform target (Section 15) | Too quiet (buried) or too loud (distorted) |
| **True peak** | Below -1.0 dBTP | Clipping on lossy codec playback |
| **Color space** | Matches delivery spec (usually Rec.709/sRGB) | Washed out or oversaturated colors |
| **Safe zones** | All critical content within title-safe (80%) | Text/logos cut off on some devices |
| **Captions** | Present, accurate, timed correctly | Accessibility failure, muted viewing broken |
| **End frame** | Clean final frame (logo/endcard), no accidental extra frames | Ends on random frame or black |
| **File size** | Within platform max (see Section 13) | Upload rejected |
| **Metadata** | Title, description, tags populated | SEO/discoverability loss |

### Export Settings Quick Reference

```
UNIVERSAL SAFE EXPORT (works everywhere):
  Container:    MP4
  Video codec:  H.264 (High Profile)
  Resolution:   1920x1080 (or 1080x1920 for vertical)
  Frame rate:   30fps (or match source)
  Bitrate:      10-12 Mbps (CBR or VBR 2-pass)
  Audio codec:  AAC-LC
  Audio rate:   48 kHz
  Audio bitrate: 192-256 kbps
  Channels:     Stereo
  Color space:  Rec.709
  True peak:    < -1.0 dBTP
  Loudness:     -14 LUFS (integrated)
```

---

## 19. SOURCES (Sections 9-18)

### Typography & Captions
- [BBC Subtitling Guidelines](https://www.clevercast.com/bbc-subtitling-guidelines/)
- [DCMP Captioning Guidelines](https://dcmp.org/learn/5-captioning-guidelines-for-the-dcmp)
- [Capital Captions Subtitling Standards](https://capitalcaptions.com/services/subtitle-services-2/capital-captions-standard-subtitling-guidelines/)
- [NN/g: The Dos and Don'ts of Pairing Typefaces](https://www.nngroup.com/articles/pairing-typefaces/)
- [IxDF: How to Pair Fonts](https://ixdf.org/literature/article/how-to-pair-fonts-a-practical-guide)
- [Smashing Magazine: Best Practices of Combining Typefaces](https://www.smashingmagazine.com/2010/11/best-practices-of-combining-typefaces/)

### Motion Graphics & Animation
- [IxDF: Disney's 12 Principles Applied to UI Design](https://ixdf.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design)
- [Wikipedia: Twelve Basic Principles of Animation](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)
- [Adobe: 12 Principles of Animation](https://www.adobe.com/creativecloud/animation/discover/principles-of-animation.html)
- [Joyspace: Hormozi Editing Style Analysis 2026](https://joyspace.ai/hormozi-editing-style-2026-analysis)

### Music Theory
- [Artlist: How to Choose the Right Music BPM for Video](https://artlist.io/blog/music-bpm/)
- [Soundraw: Choosing the Right BPM](https://blog.soundraw.io/post/choosing-the-right-bpm)
- [iZotope: What is Audio Ducking](https://www.izotope.com/en/learn/what-is-audio-ducking)
- [Gearspace: Ducking Music under Dialog](https://gearspace.com/board/post-production-forum/1198509-ducking-music-under-dialog-your-thoughts-philosophy.html)

### Audio Mastering
- [Youlean: Loudness Standards Full Comparison Table](https://youlean.co/loudness-standards-full-comparison-table/)
- [iZotope: Mastering for Streaming Platforms](https://www.izotope.com/en/learn/mastering-for-streaming-platforms)
- [NUGEN Audio: What are LUFS](https://nugenaudio.com/what-are-lufs/)
- [Spotify: Loudness Normalization](https://support.spotify.com/us/artists/article/loudness-normalization/)

### Platform Specs
- [Kapwing: Social Media Video Sizes 2026](https://www.kapwing.com/resources/social-media-video-aspect-ratios-and-sizes-the-2025-guide/)
- [Sprout Social: Social Media Video Specs Guide](https://sproutsocial.com/insights/social-media-video-specs-guide/)
- [Wyzowl: Social Media Video Specs 2026](https://wyzowl.com/social-media-video-specs/)

### Color Science
- [Cinema-LUTs: Rec.709 Color Space](https://www.cinema-luts.com/rec-709/)
- [Digital Camera World: Rec.709 vs Rec.2020](https://www.digitalcameraworld.com/cameras/video-cameras/what-is-rec-709-vs-rec-2020-in-video)
- [Colour Grading London: Understanding Colour Theory](https://colourgradinglondon.com/cinematic-colour-grading-understanding-colour-theory/)

### Codecs & Technical
- [Ant Media: Video Codecs Streaming Guide](https://antmedia.io/video-codecs-streaming-guide/)
- [Red5: H.264 vs H.265 vs VP9 2026](https://www.red5.net/blog/h264-vs-h265-vp9/)

### Accessibility
- [W3C: WCAG 2.1](https://www.w3.org/TR/WCAG21/)
- [W3C: Understanding Contrast Minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [W3C: Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
- [MDN: Web Accessibility for Seizure Disorders](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Seizure_disorders)
- [TRACE: Photosensitive Epilepsy Analysis Tool](https://trace.umd.edu/peat/)

### TTS & Voice
- [Speechactors: Optimizing TTS Output](https://speechactors.com/article/optimizing-tts-output-tips/)
- [Resemble AI: Best Practices for Text-to-Speech](https://knowledge.resemble.ai/what-are-best-practices-for-text-to-speech)
